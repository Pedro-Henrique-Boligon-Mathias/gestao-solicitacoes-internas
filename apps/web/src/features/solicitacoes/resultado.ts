import type { Solicitacao } from './tipos';

/** Retorno das Server Actions das solicitações. */
export type ResultadoFalha = {
  ok: false;
  /** Mensagem para a pessoa (o `detail` da API ou uma mensagem genérica). */
  erro: string;
  /** Código estável da API (ex.: CONFLITO_DE_VERSAO). */
  code?: string;
  /** Erros por campo, vindos do `errors[]` do Problem Details. */
  errosDeCampo?: Record<string, string>;
};

export type ResultadoAcao = { ok: true; solicitacao: Solicitacao } | ResultadoFalha;
export type ResultadoExclusao = { ok: true } | ResultadoFalha;
