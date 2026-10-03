/** Parâmetros do backoff (variáveis OUTBOX_BACKOFF_BASE_MS e OUTBOX_BACKOFF_MAX_MS). */
export interface ConfiguracaoBackoff {
  baseMs: number;
  maxMs: number;
}

/** Variação do atraso para cima e para baixo, para as réplicas não reenviarem todas juntas. */
const JITTER = 0.2;

/**
 * Atraso até a próxima tentativa, em milissegundos inteiros (ADR-010): `base × 2^(tentativas − 1)`,
 * limitado a `maxMs`, com jitter de ±20%. `tentativas` já conta a que acabou de falhar (1 na
 * primeira falha). `aleatorio` devolve um número em [0, 1): 0,5 não muda o valor; 0 tira 20%.
 */
export function calcularAtraso(
  tentativas: number,
  { baseMs, maxMs }: ConfiguracaoBackoff,
  aleatorio: () => number = Math.random,
): number {
  const expoente = Math.max(tentativas, 1) - 1;
  const semJitter = Math.min(maxMs, baseMs * 2 ** expoente);
  const fator = 1 - JITTER + 2 * JITTER * aleatorio();
  return Math.round(semJitter * fator);
}
