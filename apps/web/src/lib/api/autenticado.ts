import 'server-only';
import { cache } from 'react';
import { lerAccessToken } from '@/features/auth/sessao';
import { criarClienteApi } from './client';
import type { UsuarioAtual } from '@/features/auth/usuario';

/** Client da API em nome de quem está logado (access lido do cookie httpOnly). */
export async function criarClienteApiAutenticado() {
  const accessToken = await lerAccessToken();
  return criarClienteApi(accessToken ? { accessToken } : {});
}

export type ResultadoUsuarioAtual =
  { autenticado: true; usuario: UsuarioAtual } | { autenticado: false };

/**
 * GET /auth/me, uma vez por requisição (React cache). Sessão recusada pela API vira
 * `autenticado: false`; qualquer outra falha sobe para o error boundary.
 */
export const obterUsuarioAtual = cache(async (): Promise<ResultadoUsuarioAtual> => {
  const cliente = await criarClienteApiAutenticado();
  const { data, response } = await cliente.GET('/api/v1/auth/me', { cache: 'no-store' });
  if (data) return { autenticado: true, usuario: data };
  if (response.status === 401) return { autenticado: false };
  throw new Error(`Falha ao carregar o usuário atual (HTTP ${response.status}).`);
});
