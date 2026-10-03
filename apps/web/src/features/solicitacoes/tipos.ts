import type { components } from '@/lib/api/schema';

type Schemas = components['schemas'];

export type Solicitacao = Schemas['SolicitacaoDto'];
export type PaginaSolicitacoes = Schemas['PaginaSolicitacoesDto'];
export type ItemSolicitacao = PaginaSolicitacoes['data'][number];
export type ResumoDashboard = Schemas['ResumoDto'];
export type Status = Solicitacao['status'];
export type Prioridade = Solicitacao['prioridade'];
export type AcaoPermitida = Solicitacao['acoesPermitidas'][number];
export type ResultadoDecisao = Schemas['DecisaoDto']['resultado'];
export type Pessoa = Solicitacao['solicitante'];
/** Integração com o sistema externo (ADR-010): campos de topo do evento em foco. */
export type Integracao = NonNullable<Solicitacao['integracao']>;
export type EventoIntegracao = Integracao['eventos'][number];
export type StatusIntegracao = Integracao['status'];
export type TipoEventoIntegracao = Integracao['tipo'];

/**
 * Evento do histórico. O `comentario` chega como texto ou null; o tipo é fixado aqui para não
 * depender de como o gerador descreve o campo.
 */
export type EventoHistorico = Omit<Schemas['EventoHistoricoDto'], 'comentario'> & {
  comentario: string | null;
};

export const STATUS: readonly Status[] = ['ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA'];
/** Da mais alta para a mais baixa, como nos filtros. */
export const PRIORIDADES: readonly Prioridade[] = ['ALTA', 'MEDIA', 'BAIXA'];
