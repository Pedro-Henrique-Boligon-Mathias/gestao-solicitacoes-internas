import { Injectable } from '@nestjs/common';
import { ContextoBanco } from '../../../database/contexto-banco';
import {
  RepositorioAuth,
  type MotivoRevogacao,
  type NovaSessao,
  type SessaoComUsuario,
  type UsuarioComArea,
} from '../application/repositorio-auth';

const USUARIO_COM_AREA = {
  id: true,
  nome: true,
  email: true,
  senhaHash: true,
  cargo: true,
  ativo: true,
  area: { select: { id: true, nome: true } },
} as const;

/** `usuarios` e `sessoes` ficam fora da RLS: o login precisa achar o usuário antes do contexto. */
@Injectable()
export class RepositorioAuthPrisma extends RepositorioAuth {
  constructor(private readonly banco: ContextoBanco) {
    super();
  }

  buscarUsuarioPorEmail(email: string): Promise<UsuarioComArea | null> {
    return this.banco.cliente.usuario.findUnique({ where: { email }, select: USUARIO_COM_AREA });
  }

  buscarUsuarioPorId(id: string): Promise<UsuarioComArea | null> {
    return this.banco.cliente.usuario.findUnique({ where: { id }, select: USUARIO_COM_AREA });
  }

  buscarSessaoPorRefreshHash(refreshHash: string): Promise<SessaoComUsuario | null> {
    return this.banco.cliente.sessao.findUnique({
      where: { refreshHash },
      select: {
        id: true,
        familiaId: true,
        expiraEm: true,
        usadoEm: true,
        revogadaEm: true,
        usuario: { select: USUARIO_COM_AREA },
      },
    });
  }

  criarSessao(sessao: NovaSessao): Promise<{ id: string }> {
    return this.banco.cliente.sessao.create({ data: sessao, select: { id: true } });
  }

  async marcarComoUsada(sessaoId: string, agora: Date): Promise<boolean> {
    // UPDATE condicional: entre duas renovações simultâneas, só uma marca o token.
    const { count } = await this.banco.cliente.sessao.updateMany({
      where: { id: sessaoId, usadoEm: null, revogadaEm: null },
      data: { usadoEm: agora },
    });
    return count === 1;
  }

  async revogarFamilia(familiaId: string, motivo: MotivoRevogacao, agora: Date): Promise<void> {
    await this.banco.cliente.sessao.updateMany({
      where: { familiaId, revogadaEm: null },
      data: { revogadaEm: agora, motivoRevogacao: motivo },
    });
  }

  async revogarFamiliaDaSessao(
    sessaoId: string,
    motivo: MotivoRevogacao,
    agora: Date,
  ): Promise<void> {
    const sessao = await this.banco.cliente.sessao.findUnique({
      where: { id: sessaoId },
      select: { familiaId: true },
    });
    if (sessao) await this.revogarFamilia(sessao.familiaId, motivo, agora);
  }
}
