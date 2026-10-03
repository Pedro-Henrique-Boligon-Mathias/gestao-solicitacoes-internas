import { createHmac } from 'node:crypto';

/** Segredo usado pelos testes (definido em test/setup-env.ts e test/integracao/setup-env.ts). */
export const SEGREDO_JWT_TESTE = 'segredo-de-teste-com-pelo-menos-32-caracteres';

export interface ClaimsAcesso {
  sub: string;
  cargo: string;
  areaId: string;
  sid: string;
  iat?: number;
  exp?: number;
}

function base64url(valor: string | Buffer): string {
  return Buffer.from(valor).toString('base64url');
}

/**
 * Assina um JWT HS256 sem depender da biblioteca da API, para os testes montarem tokens
 * válidos, vencidos ou com assinatura errada.
 */
export function assinarJwt(
  claims: ClaimsAcesso,
  opcoes: { segredo?: string; validadeSegundos?: number } = {},
): string {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { iat: agora, exp: agora + (opcoes.validadeSegundos ?? 900), ...claims };
  const cabecalho = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const carga = base64url(JSON.stringify(corpo));
  const assinatura = createHmac('sha256', opcoes.segredo ?? SEGREDO_JWT_TESTE)
    .update(`${cabecalho}.${carga}`)
    .digest('base64url');
  return `${cabecalho}.${carga}.${assinatura}`;
}

/** Lê a carga de um JWT sem verificar a assinatura. */
export function lerClaims(token: string): Record<string, unknown> {
  const carga = token.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as Record<string, unknown>;
}
