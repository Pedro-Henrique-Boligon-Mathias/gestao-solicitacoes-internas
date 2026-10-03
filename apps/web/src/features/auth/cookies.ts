/**
 * Nomes e atributos dos cookies de sessão. Sem `server-only` de propósito:
 * o proxy (src/proxy.ts) também usa estas regras.
 */
export const COOKIE_ACCESS = 'sessao_access';
export const COOKIE_REFRESH = 'sessao_refresh';

export interface ParDeTokens {
  accessToken: string;
  accessExpiraEm: string;
  refreshToken: string;
  refreshExpiraEm: string;
}

export interface OpcoesCookie {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  secure: boolean;
  maxAge: number;
}

/** Segundos até a data ISO informada (nunca negativo). */
function segundosAte(dataIso: string, agora = Date.now()): number {
  const diferenca = Math.floor((Date.parse(dataIso) - agora) / 1000);
  return Number.isFinite(diferenca) ? Math.max(diferenca, 0) : 0;
}

export function opcoesCookie(maxAge: number): OpcoesCookie {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // Atrás de HTTPS, COOKIE_SECURE=true; em http://localhost o Safari recusaria cookie Secure
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge,
  };
}

/** Os dois cookies de uma sessão, cada um valendo até a validade devolvida pela API. */
export function cookiesDaSessao(par: ParDeTokens): [string, string, OpcoesCookie][] {
  return [
    [COOKIE_ACCESS, par.accessToken, opcoesCookie(segundosAte(par.accessExpiraEm))],
    [COOKIE_REFRESH, par.refreshToken, opcoesCookie(segundosAte(par.refreshExpiraEm))],
  ];
}

/** Atributos para apagar: valor vazio e Max-Age=0, com o mesmo path dos cookies gravados. */
export function cookiesApagados(): [string, string, OpcoesCookie][] {
  return [
    [COOKIE_ACCESS, '', opcoesCookie(0)],
    [COOKIE_REFRESH, '', opcoesCookie(0)],
  ];
}

/**
 * O access ainda vale? Lê só o `exp` do JWT, sem validar a assinatura:
 * serve para decidir quando renovar. Quem valida de verdade é a API.
 */
export function accessValido(token: string | undefined, folgaSegundos = 10): boolean {
  if (!token) return false;
  const carga = token.split('.')[1];
  if (!carga) return false;
  try {
    const base64 = carga.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(
      atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')),
    );
    const exp: unknown = json?.exp;
    return typeof exp === 'number' && exp - folgaSegundos > Date.now() / 1000;
  } catch {
    return false;
  }
}
