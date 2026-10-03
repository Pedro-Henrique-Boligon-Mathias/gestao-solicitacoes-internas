import type { TipoEventoIntegracao } from '../../integracoes/domain/tipos';
import { formatarCodigo } from '../domain/codigo';
import type { Pessoa, SolicitacaoDetalhada } from './repositorio-solicitacoes';

/** Versão do contrato dos eventos enviados ao sistema externo. */
export const VERSAO_CONTRATO = 1;

export interface DecisaoDoEvento {
  resultado: 'APROVADA';
  comentario: string;
  decididoEm: Date;
  decididoPor: Pessoa;
}

export interface ReaberturaDoEvento {
  justificativa: string;
  reabertaEm: Date;
  reabertaPor: Pessoa;
}

/**
 * Contrato versionado do evento (ADR-010): `{ id, tipo, versao, ocorridoEm, correlationId, dados }`.
 * `dados.solicitacao` identifica a solicitação; `dados.decisao` é a aprovação (no
 * SolicitacaoReaberta, a aprovação desfeita); `dados.reabertura` só existe no SolicitacaoReaberta.
 */
export function montarPayload(evento: {
  id: string;
  tipo: TipoEventoIntegracao;
  ocorridoEm: Date;
  correlationId: string | null;
  solicitacao: SolicitacaoDetalhada;
  decisao: DecisaoDoEvento;
  reabertura?: ReaberturaDoEvento;
}): Record<string, unknown> {
  const { solicitacao, decisao, reabertura } = evento;
  return {
    id: evento.id,
    tipo: evento.tipo,
    versao: VERSAO_CONTRATO,
    ocorridoEm: evento.ocorridoEm.toISOString(),
    correlationId: evento.correlationId,
    dados: {
      solicitacao: {
        id: solicitacao.id,
        codigo: formatarCodigo(solicitacao.codigo),
        titulo: solicitacao.titulo,
        prioridade: solicitacao.prioridade,
        area: { id: solicitacao.area.id, nome: solicitacao.area.nome },
        solicitante: { id: solicitacao.solicitante.id, nome: solicitacao.solicitante.nome },
      },
      decisao: {
        resultado: decisao.resultado,
        comentario: decisao.comentario,
        decididoEm: decisao.decididoEm.toISOString(),
        decididoPor: { id: decisao.decididoPor.id, nome: decisao.decididoPor.nome },
      },
      ...(reabertura
        ? {
            reabertura: {
              justificativa: reabertura.justificativa,
              reabertaEm: reabertura.reabertaEm.toISOString(),
              reabertaPor: { id: reabertura.reabertaPor.id, nome: reabertura.reabertaPor.nome },
            },
          }
        : {}),
    },
  };
}
