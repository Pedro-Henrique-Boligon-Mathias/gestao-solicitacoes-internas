/**
 * Motivos de divergência na corrente do histórico (RN-10, auditoria):
 * - CONTEUDO_ALTERADO: o hash recalculado do conteúdo canônico (com o hash_anterior gravado no
 *   próprio evento) não bate com o hash gravado;
 * - CORRENTE_QUEBRADA: o conteúdo confere, mas o hash_anterior não bate com o hash do evento
 *   anterior da mesma solicitação (evento apagado ou inserido no meio).
 * Um evento com as duas falhas gera um item só, CONTEUDO_ALTERADO.
 */
export const MOTIVOS_DIVERGENCIA = ['CONTEUDO_ALTERADO', 'CORRENTE_QUEBRADA'] as const;
export type MotivoDivergencia = (typeof MOTIVOS_DIVERGENCIA)[number];

/** Divergências devolvidas na resposta, da mais antiga para a mais recente. */
export const LIMITE_DIVERGENCIAS = 20;
