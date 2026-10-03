import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_ACCESS, opcoesCookie } from '@/features/auth/cookies';

/**
 * A API recusou o access (sessão revogada, usuário desativado) mas ele ainda parece válido.
 * Server Components não apagam cookies: o layout manda para cá, que apaga só o access e volta
 * para o /dashboard. Lá o proxy tenta o refresh, e é ele que decide: refresh recusado (401)
 * apaga os dois cookies e leva ao login; refresh aceito segue a navegação.
 * Por isso não importa de onde veio a chamada: um link de outro site não derruba ninguém.
 */
// A assinatura de route handler recebe a requisição; aqui ela não muda nada na resposta
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function GET(_request: NextRequest): NextResponse {
  // Location relativo: no standalone, request.url traz o host de bind (0.0.0.0), não o do navegador
  const resposta = new NextResponse(null, { status: 303, headers: { Location: '/dashboard' } });
  resposta.cookies.set(COOKIE_ACCESS, '', opcoesCookie(0));
  return resposta;
}
