import { NextResponse, type NextRequest } from 'next/server';
import {
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  accessValido,
  cookiesApagados,
  cookiesDaSessao,
  type ParDeTokens,
} from '@/features/auth/cookies';

const LOGIN = '/login';
const INICIO = '/dashboard';
const TEMPO_LIMITE_MS = 5_000;

/**
 * Sessão nas rotas da área logada (ADR-004). Server Components não gravam cookies,
 * então é aqui que o access vencido é renovado com o refresh. Quem valida de verdade é a API.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const access = request.cookies.get(COOKIE_ACCESS)?.value;
  const refresh = request.cookies.get(COOKIE_REFRESH)?.value;

  if (pathname === LOGIN) {
    return accessValido(access)
      ? NextResponse.redirect(new URL(INICIO, request.url))
      : NextResponse.next();
  }

  if (accessValido(access)) return NextResponse.next();

  const paraLogin = ({ apagarCookies }: { apagarCookies: boolean }) => {
    const url = new URL(LOGIN, request.url);
    url.search = '';
    url.searchParams.set('next', `${pathname}${search}`);
    const resposta = NextResponse.redirect(url);
    if (apagarCookies && (access || refresh)) {
      for (const [nome, valor, opcoes] of cookiesApagados())
        resposta.cookies.set(nome, valor, opcoes);
    }
    return resposta;
  };

  if (!refresh) return paraLogin({ apagarCookies: true });

  const resultado = await renovar(request, refresh);
  // Só o 401 encerra a sessão. Falha passageira (429, 5xx, rede, tempo esgotado) mantém os
  // cookies: o login aparece (o proxy deixa o /login passar sem access válido) e a próxima
  // navegação para a área logada tenta renovar de novo.
  if (resultado === 'recusado') return paraLogin({ apagarCookies: true });
  if (resultado === 'falhou') return paraLogin({ apagarCookies: false });
  const par = resultado;

  // O novo access também vale para a renderização desta mesma requisição
  request.cookies.set(COOKIE_ACCESS, par.accessToken);
  request.cookies.set(COOKIE_REFRESH, par.refreshToken);
  const resposta = NextResponse.next({ request: { headers: request.headers } });
  for (const [nome, valor, opcoes] of cookiesDaSessao(par))
    resposta.cookies.set(nome, valor, opcoes);
  return resposta;
}

/**
 * POST /auth/refresh. Dentro da graça, a API devolve outro par: vale sempre o mais recente.
 * `recusado` quando a API responde 401 (refresh inválido, vencido, reusado ou revogado);
 * `falhou` em qualquer outra falha, que pode passar sozinha.
 */
async function renovar(
  request: NextRequest,
  refreshToken: string,
): Promise<ParDeTokens | 'recusado' | 'falhou'> {
  const cabecalhos: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': crypto.randomUUID(),
  };
  const ip = request.headers.get('x-forwarded-for');
  const agente = request.headers.get('user-agent');
  if (ip) cabecalhos['X-Forwarded-For'] = ip;
  if (agente) cabecalhos['User-Agent'] = agente;

  try {
    const resposta = await fetch(
      `${process.env.API_URL ?? 'http://localhost:3001'}/api/v1/auth/refresh`,
      {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      },
    );
    if (resposta.status === 401) return 'recusado';
    if (!resposta.ok) return 'falhou';
    const corpo: unknown = await resposta.json();
    return ehParDeTokens(corpo) ? corpo : 'falhou';
  } catch {
    return 'falhou';
  }
}

function ehParDeTokens(valor: unknown): valor is ParDeTokens {
  if (typeof valor !== 'object' || valor === null) return false;
  const par = valor as Record<string, unknown>;
  return ['accessToken', 'accessExpiraEm', 'refreshToken', 'refreshExpiraEm'].every(
    (campo) => typeof par[campo] === 'string',
  );
}

export const config = {
  // Tudo, menos o healthcheck, o encerramento de sessão recusada, os arquivos do Next e os estáticos
  matcher: [
    '/((?!api/health|api/sessao/encerrar|_next/static|_next/image|favicon\\.ico|icon\\.svg|.*\\.(?:png|jpe?g|gif|svg|webp|ico|txt|xml)$).*)',
  ],
};
