import type {
  EventoHistorico,
  Prioridade,
  Status,
  StatusIntegracao,
  TipoEventoIntegracao,
} from './tipos';

/** Rótulos da interface; a API usa os códigos. */
export const ROTULO_STATUS: Record<Status, string> = {
  ABERTA: 'Aberta',
  EM_ANALISE: 'Em análise',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
};

/** Plural usado nos blocos do dashboard e nos chips de filtro. */
export const ROTULO_STATUS_PLURAL: Record<Status, string> = {
  ABERTA: 'Abertas',
  EM_ANALISE: 'Em análise',
  APROVADA: 'Aprovadas',
  REJEITADA: 'Rejeitadas',
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
};

export const ROTULO_EVENTO: Record<EventoHistorico['tipo'], string> = {
  CRIADA: 'Criada',
  EDITADA: 'Editada',
  ANALISE_INICIADA: 'Análise iniciada',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
  REABERTA: 'Reaberta',
  EXCLUIDA: 'Excluída',
};

/** O que significa cada prioridade, para a pessoa escolher com critério. */
export const EXPLICACAO_PRIORIDADE: Record<Prioridade, string> = {
  ALTA: 'Impede ou compromete uma operação ou um atendimento.',
  MEDIA: 'Afeta o trabalho, mas existe alternativa temporária.',
  BAIXA: 'Melhoria ou pedido sem urgência.',
};

/** Rótulos dos campos editáveis, usados no histórico de edições. */
export const ROTULO_CAMPO: Record<string, string> = {
  titulo: 'Título',
  descricao: 'Descrição',
  prioridade: 'Prioridade',
};

/** Tipo do evento enviado ao sistema externo. */
export const ROTULO_TIPO_INTEGRACAO: Record<TipoEventoIntegracao, string> = {
  SolicitacaoAprovada: 'Aprovação',
  SolicitacaoReaberta: 'Reabertura',
};

export const ROTULO_STATUS_INTEGRACAO: Record<StatusIntegracao, string> = {
  PENDENTE: 'Pendente',
  ENVIADO: 'Enviada',
  FALHOU: 'Falhou',
};
