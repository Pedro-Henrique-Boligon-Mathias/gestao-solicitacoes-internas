import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Cargo } from '../../generated/prisma/client';
import type { RequisicaoAutenticada } from '../context/usuario-autenticado';
import { CHAVE_CARGOS } from '../decorators/cargos.decorator';
import { AcessoNegadoError } from '../errors/erro-de-dominio';

/** Aplica o `@Cargos(...)` da rota. Roda depois do JwtAuthGuard, que já identificou o usuário. */
@Injectable()
export class CargosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const cargos = this.reflector.getAllAndOverride<Cargo[] | undefined>(CHAVE_CARGOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!cargos?.length) return true;

    const usuario = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().usuario;
    if (!usuario || !cargos.includes(usuario.cargo)) throw new AcessoNegadoError();
    return true;
  }
}
