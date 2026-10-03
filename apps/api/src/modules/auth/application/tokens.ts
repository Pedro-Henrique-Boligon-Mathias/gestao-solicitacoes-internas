import { createHash, randomBytes } from 'node:crypto';

const SEGUNDOS_POR_UNIDADE = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** Converte uma duração como `15m` (validada no env) em segundos. */
export function duracaoEmSegundos(duracao: string): number {
  const encontrado = /^(\d+)([smhd])$/.exec(duracao);
  if (!encontrado) throw new Error(`Duração inválida: ${duracao}`);
  const [, valor, unidade] = encontrado as unknown as [
    string,
    string,
    keyof typeof SEGUNDOS_POR_UNIDADE,
  ];
  return Number(valor) * SEGUNDOS_POR_UNIDADE[unidade];
}

/** Refresh token opaco: 32 bytes aleatórios (256 bits) em base64url. */
export function gerarRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Só este hash vai para o banco (`sessoes.refresh_hash`). */
export function hashDoRefresh(refreshToken: string): string {
  return createHash('sha256').update(refreshToken).digest('hex');
}
