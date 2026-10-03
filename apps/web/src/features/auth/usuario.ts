import type { components } from '@/lib/api/schema';

/** Quem está logado, como devolvido por GET /auth/me. */
export type UsuarioAtual = components['schemas']['UsuarioAtualDto'];
export type Cargo = UsuarioAtual['cargo'];

/** Rótulo do cargo para a interface (a API usa o código). */
export const ROTULO_CARGO: Record<Cargo, string> = {
  SOLICITANTE: 'Solicitante',
  ANALISTA: 'Analista',
  ADMIN: 'Administrador',
};
