import { ClsServiceManager } from 'nestjs-cls';
import type { Cargo } from '../../generated/prisma/client';

/** O que o `@UsuarioAtual()` entrega ao controller. */
export interface UsuarioAutenticado {
  id: string;
  nome: string;
  cargo: Cargo;
  areaId: string;
}

/** Contexto gravado no CLS pelo JwtAuthGuard e usado pelas transações com contexto no banco. */
export interface ContextoDoUsuario {
  usuarioId: string;
  cargo: Cargo;
  areaId: string;
}

export const CHAVE_USUARIO = 'usuario';

/** Requisição HTTP depois do JwtAuthGuard. */
export interface RequisicaoAutenticada {
  usuario?: UsuarioAutenticado;
  sessaoId?: string;
}

/** Contexto do usuário da requisição corrente, ou `undefined` fora de uma rota autenticada. */
export function contextoDoUsuarioAtual(): ContextoDoUsuario | undefined {
  const cls = ClsServiceManager.getClsService();
  return cls.isActive() ? cls.get<ContextoDoUsuario | undefined>(CHAVE_USUARIO) : undefined;
}
