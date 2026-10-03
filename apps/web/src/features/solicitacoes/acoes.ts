import type { AcaoPermitida, Solicitacao } from './tipos';

/** Ações que ficam no próprio bloco (o reprocessamento fica no bloco Integração). */
const FORA_DA_BARRA: readonly AcaoPermitida[] = ['REPROCESSAR_INTEGRACAO'];

/** Ações permitidas que vão para a barra de ações do detalhe. */
export function acoesDaBarra(solicitacao: Pick<Solicitacao, 'acoesPermitidas'>): AcaoPermitida[] {
  return solicitacao.acoesPermitidas.filter((acao) => !FORA_DA_BARRA.includes(acao));
}
