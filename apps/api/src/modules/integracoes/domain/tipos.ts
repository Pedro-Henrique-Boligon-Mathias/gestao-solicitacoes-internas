// Tipos da integração com o sistema externo. Espelham o enum status_outbox, sem depender do Prisma.

export const STATUS_OUTBOX = ['PENDENTE', 'ENVIADO', 'FALHOU'] as const;
export type StatusOutbox = (typeof STATUS_OUTBOX)[number];

export const TIPOS_EVENTO_INTEGRACAO = ['SolicitacaoAprovada', 'SolicitacaoReaberta'] as const;
export type TipoEventoIntegracao = (typeof TIPOS_EVENTO_INTEGRACAO)[number];
