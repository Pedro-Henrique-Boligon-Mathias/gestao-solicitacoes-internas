/** Como o worker trata o resultado de uma tentativa de envio (ADR-010). */
export type ResultadoTentativa = 'SUCESSO' | 'TRANSITORIO' | 'PERMANENTE';

/** O servidor pediu para tentar de novo mais tarde, mesmo sendo 4xx. */
const REPETIVEIS = new Set([408, 429]);

/**
 * Classifica a resposta do sistema externo. `null` quando não houve resposta (erro de rede ou
 * tempo esgotado). 2xx é sucesso; rede, 5xx, 408 e 429 são transitórios (nova tentativa com
 * backoff); os demais códigos são permanentes (insistir não resolve).
 */
export function classificarResposta(statusHttp: number | null): ResultadoTentativa {
  if (statusHttp === null) return 'TRANSITORIO';
  if (statusHttp >= 200 && statusHttp < 300) return 'SUCESSO';
  if (statusHttp >= 500 || REPETIVEIS.has(statusHttp)) return 'TRANSITORIO';
  return 'PERMANENTE';
}
