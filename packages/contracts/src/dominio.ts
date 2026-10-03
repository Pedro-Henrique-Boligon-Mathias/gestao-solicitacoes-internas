import { z } from 'zod';

// Valores técnicos (iguais aos enums do banco). Os rótulos em pt-BR ficam só na exibição.

export const CARGOS = ['SOLICITANTE', 'ANALISTA', 'ADMIN'] as const;
export const cargoSchema = z.enum(CARGOS);
export type Cargo = z.infer<typeof cargoSchema>;

export const PRIORIDADES = ['BAIXA', 'MEDIA', 'ALTA'] as const;
export const prioridadeSchema = z.enum(PRIORIDADES);
export type Prioridade = z.infer<typeof prioridadeSchema>;

export const STATUS_SOLICITACAO = ['ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA'] as const;
export const statusSolicitacaoSchema = z.enum(STATUS_SOLICITACAO);
export type StatusSolicitacao = z.infer<typeof statusSolicitacaoSchema>;

export const ROTULOS_CARGO: Record<Cargo, string> = {
  SOLICITANTE: 'Solicitante',
  ANALISTA: 'Analista',
  ADMIN: 'Administrador',
};

export const ROTULOS_PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
};

export const ROTULOS_STATUS: Record<StatusSolicitacao, string> = {
  ABERTA: 'Aberta',
  EM_ANALISE: 'Em análise',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
};
