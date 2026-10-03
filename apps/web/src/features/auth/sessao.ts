import 'server-only';
import { cookies, headers } from 'next/headers';
import { COOKIE_ACCESS, cookiesApagados, cookiesDaSessao, type ParDeTokens } from './cookies';

export { COOKIE_ACCESS, COOKIE_REFRESH } from './cookies';

/** Grava o par de tokens em cookies httpOnly (só em Server Actions e Route Handlers). */
export async function gravarSessao(par: ParDeTokens): Promise<void> {
  const loja = await cookies();
  for (const [nome, valor, opcoes] of cookiesDaSessao(par)) loja.set(nome, valor, opcoes);
}

export async function apagarSessao(): Promise<void> {
  const loja = await cookies();
  for (const [nome, valor, opcoes] of cookiesApagados()) loja.set(nome, valor, opcoes);
}

export async function lerAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_ACCESS)?.value;
}

/** IP e navegador de quem fez a requisição, repassados à API para registrar na sessão. */
export async function cabecalhosDoNavegador(): Promise<Record<string, string>> {
  const recebidos = await headers();
  const repassados: Record<string, string> = {};
  const ip = recebidos.get('x-forwarded-for');
  const agente = recebidos.get('user-agent');
  if (ip) repassados['X-Forwarded-For'] = ip;
  if (agente) repassados['User-Agent'] = agente;
  return repassados;
}
