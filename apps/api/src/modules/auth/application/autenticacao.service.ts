import { randomUUID } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type { Env } from '../../../config/env';
import { Transactional } from '../../../database/transacao';
import { CredenciaisInvalidasError, SessaoInvalidaError } from '../domain/erros';
import { destinoDoRefresh } from '../domain/rotacao';
import { RepositorioAuth, type UsuarioComArea } from './repositorio-auth';
import { duracaoEmSegundos, gerarRefreshToken, hashDoRefresh } from './tokens';

/** IP e navegador de quem pediu (repassados pelo Next em X-Forwarded-For e User-Agent). */
export interface Origem {
  ip: string | null;
  userAgent: string | null;
}

export interface UsuarioAtual {
  id: string;
  nome: string;
  email: string;
  cargo: UsuarioComArea['cargo'];
  area: { id: string; nome: string };
}

export interface SessaoEmitida {
  accessToken: string;
  accessExpiraEm: Date;
  refreshToken: string;
  refreshExpiraEm: Date;
  usuario: UsuarioAtual;
}

const DIA_EM_MS = 24 * 60 * 60 * 1000;

function paraUsuarioAtual(usuario: UsuarioComArea): UsuarioAtual {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    cargo: usuario.cargo,
    area: { id: usuario.area.id, nome: usuario.area.nome },
  };
}

@Injectable()
export class AutenticacaoService implements OnModuleInit {
  private readonly logger = new Logger(AutenticacaoService.name);
  private readonly accessSegundos: number;
  private readonly refreshDias: number;
  private readonly gracaSegundos: number;
  /** Hash de uma senha qualquer, verificado quando o e-mail não existe (tempo de resposta igual). */
  private hashFicticio = '';

  constructor(
    private readonly repositorio: RepositorioAuth,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessSegundos = duracaoEmSegundos(config.get('ACCESS_TOKEN_TTL', { infer: true }));
    this.refreshDias = config.get('REFRESH_TOKEN_DIAS', { infer: true });
    this.gracaSegundos = config.get('REFRESH_GRACA_SEGUNDOS', { infer: true });
  }

  /** Gerado na subida, para a primeira tentativa com e-mail inexistente não pagar o custo do hash. */
  async onModuleInit(): Promise<void> {
    this.hashFicticio = await hash(randomUUID());
  }

  async entrar(emailInformado: string, senha: string, origem: Origem): Promise<SessaoEmitida> {
    const email = emailInformado.trim().toLowerCase();
    const usuario = await this.repositorio.buscarUsuarioPorEmail(email);
    const senhaConfere = await this.conferirSenha(usuario?.senhaHash, senha);

    if (!usuario || !senhaConfere || !usuario.ativo) {
      this.logger.warn({ email, sucesso: false }, 'Tentativa de login recusada');
      throw new CredenciaisInvalidasError();
    }

    const sessao = await this.abrirSessao(usuario, randomUUID(), origem);
    this.logger.log({ email, sucesso: true }, 'Login realizado');
    return sessao;
  }

  /** Rotação do refresh token, com período de graça e detecção de reuso (ADR-004). */
  async renovar(refreshToken: string, origem: Origem): Promise<SessaoEmitida> {
    const sessao = await this.repositorio.buscarSessaoPorRefreshHash(hashDoRefresh(refreshToken));
    if (!sessao || !sessao.usuario.ativo) throw new SessaoInvalidaError();

    const agora = new Date();
    switch (destinoDoRefresh(sessao, agora, this.gracaSegundos)) {
      case 'ROTACIONAR': {
        const emitida = await this.rotacionar(sessao.id, sessao.familiaId, sessao.usuario, origem);
        if (emitida) return emitida;
        // Outra requisição trocou (ou revogou) o mesmo token agora há pouco: relê e decide de
        // novo. Não repete indefinidamente, porque o token já não está mais livre.
        return this.renovar(refreshToken, origem);
      }
      case 'GRACA':
        return this.abrirSessao(sessao.usuario, sessao.familiaId, origem);
      case 'REUSO':
        await this.repositorio.revogarFamilia(sessao.familiaId, 'REUSO', agora);
        this.logger.warn(
          { usuarioId: sessao.usuario.id, familiaId: sessao.familiaId },
          'Reuso de refresh token: sessões da família revogadas',
        );
        throw new SessaoInvalidaError();
      case 'INVALIDA':
        throw new SessaoInvalidaError();
    }
  }

  /** Logout: revoga a família inteira da sessão do access token. */
  async sair(sessaoId: string): Promise<void> {
    await this.repositorio.revogarFamiliaDaSessao(sessaoId, 'LOGOUT', new Date());
  }

  async usuarioAtual(usuarioId: string): Promise<UsuarioAtual> {
    const usuario = await this.repositorio.buscarUsuarioPorId(usuarioId);
    // O guard acabou de carregar o usuário; só some se for apagado entre uma consulta e outra.
    if (!usuario?.ativo) throw new SessaoInvalidaError();
    return paraUsuarioAtual(usuario);
  }

  /** Marca o token como usado e cria o próximo da família, tudo na mesma transação. */
  @Transactional()
  private async rotacionar(
    sessaoId: string,
    familiaId: string,
    usuario: UsuarioComArea,
    origem: Origem,
  ): Promise<SessaoEmitida | undefined> {
    const marcou = await this.repositorio.marcarComoUsada(sessaoId, new Date());
    if (!marcou) return undefined;
    return this.abrirSessao(usuario, familiaId, origem);
  }

  private async abrirSessao(
    usuario: UsuarioComArea,
    familiaId: string,
    origem: Origem,
  ): Promise<SessaoEmitida> {
    const agora = Date.now();
    const refreshToken = gerarRefreshToken();
    // Precisão de milissegundos, igual à coluna timestamptz(3), para a data devolvida ser a gravada
    const refreshExpiraEm = new Date(agora + this.refreshDias * DIA_EM_MS);

    const { id: sessaoId } = await this.repositorio.criarSessao({
      usuarioId: usuario.id,
      familiaId,
      refreshHash: hashDoRefresh(refreshToken),
      expiraEm: refreshExpiraEm,
      ip: origem.ip,
      userAgent: origem.userAgent,
    });

    const emitidoEm = Math.floor(agora / 1000);
    const expiraEm = emitidoEm + this.accessSegundos;
    const accessToken = await this.jwt.signAsync({
      sub: usuario.id,
      cargo: usuario.cargo,
      areaId: usuario.area.id,
      sid: sessaoId,
      iat: emitidoEm,
      exp: expiraEm,
    });

    return {
      accessToken,
      accessExpiraEm: new Date(expiraEm * 1000),
      refreshToken,
      refreshExpiraEm,
      usuario: paraUsuarioAtual(usuario),
    };
  }

  private async conferirSenha(senhaHash: string | undefined, senha: string): Promise<boolean> {
    try {
      const confere = await verify(senhaHash ?? this.hashFicticio, senha);
      return senhaHash !== undefined && confere;
    } catch {
      return false;
    }
  }
}
