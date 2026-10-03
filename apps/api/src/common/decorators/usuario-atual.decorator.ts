import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { NaoAutenticadoError } from '../errors/erro-de-dominio';
import type { RequisicaoAutenticada, UsuarioAutenticado } from '../context/usuario-autenticado';

/** Entrega ao controller o usuário autenticado pelo JwtAuthGuard: `{ id, nome, cargo, areaId }`. */
export const UsuarioAtual = createParamDecorator(
  (_dados: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const usuario = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().usuario;
    if (!usuario) throw new NaoAutenticadoError();
    return usuario;
  },
);
