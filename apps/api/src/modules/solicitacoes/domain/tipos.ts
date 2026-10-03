// Tipos do domínio de solicitações. Espelham os enums do banco, sem depender do Prisma.

import type { StatusOutbox } from '../../integracoes/domain/tipos';

export const CARGOS = ['SOLICITANTE', 'ANALISTA', 'ADMIN'] as const;
export type Cargo = (typeof CARGOS)[number];

export const STATUS = ['ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA'] as const;
export type Status = (typeof STATUS)[number];

export const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA'] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

/** Ações que a política libera ou bloqueia; a UI desenha os botões a partir delas. */
export const ACOES = [
  'EDITAR',
  'EXCLUIR',
  'INICIAR_ANALISE',
  'DECIDIR',
  'REABRIR',
  'REPROCESSAR_INTEGRACAO',
] as const;
export type Acao = (typeof ACOES)[number];

export const RESULTADOS = ['APROVADA', 'REJEITADA'] as const;
export type Resultado = (typeof RESULTADOS)[number];

export interface UsuarioDominio {
  id: string;
  cargo: Cargo;
}

export interface SolicitacaoDominio {
  solicitanteId: string;
  analistaId: string | null;
  status: Status;
  /**
   * Status do evento de integração em foco (o mais antigo ainda não enviado ou, se todos foram, o
   * mais recente). `null` ou ausente: a solicitação não tem evento.
   */
  statusIntegracao?: StatusOutbox | null;
}

/** Rótulos em pt-BR usados nas mensagens de erro. */
export const ROTULO_STATUS: Record<Status, string> = {
  ABERTA: 'Aberta',
  EM_ANALISE: 'Em análise',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
};
