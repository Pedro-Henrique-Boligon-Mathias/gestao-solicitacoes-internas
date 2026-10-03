import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import { PrismaService } from '../../database/prisma.service';
import {
  CHAVE_USUARIO,
  type ContextoDoUsuario,
  type RequisicaoAutenticada,
} from '../context/usuario-autenticado';
import { CHAVE_PUBLICO } from '../decorators/publico.decorator';
import { NaoAutenticadoError } from '../errors/erro-de-dominio';

const claimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
});

function tokenBearer(requisicao: Request): string | undefined {
  const [esquema, token] = requisicao.headers.authorization?.split(' ') ?? [];
  return esquema?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Guard global: toda rota exige um access token válido, exceto as marcadas com `@Public()`.
 * A cada requisição recarrega o usuário e a sessão, para que um usuário desativado ou uma sessão
 * revogada (logout, reuso de refresh) percam o acesso na hora, sem esperar o token vencer.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean | undefined>(CHAVE_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica) return true;

    const requisicao = contexto.switchToHttp().getRequest<Request & RequisicaoAutenticada>();
    const token = tokenBearer(requisicao);
    if (!token) throw new NaoAutenticadoError();

    const claims = claimsSchema.safeParse(await this.verificar(token));
    if (!claims.success) throw new NaoAutenticadoError();
    const { sub, sid } = claims.data;

    const [usuario, sessao] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { id: sub } }),
      this.prisma.sessao.findUnique({ where: { id: sid } }),
    ]);
    if (!usuario?.ativo || !sessao || sessao.usuarioId !== usuario.id || sessao.revogadaEm) {
      throw new NaoAutenticadoError();
    }

    requisicao.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      cargo: usuario.cargo,
      areaId: usuario.areaId,
    };
    requisicao.sessaoId = sessao.id;
    const contextoDoUsuario: ContextoDoUsuario = {
      usuarioId: usuario.id,
      cargo: usuario.cargo,
      areaId: usuario.areaId,
    };
    if (this.cls.isActive()) this.cls.set(CHAVE_USUARIO, contextoDoUsuario);
    return true;
  }

  /** Assinatura, algoritmo e validade; qualquer falha vira 401, sem detalhar o motivo. */
  private async verificar(token: string): Promise<unknown> {
    try {
      return await this.jwt.verifyAsync<object>(token, { algorithms: ['HS256'] });
    } catch {
      throw new NaoAutenticadoError();
    }
  }
}
