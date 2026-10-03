import type { TipoEventoIntegracao } from '../domain/tipos';

/** Evento pronto para envio, como o worker o recebe da outbox. */
export interface EventoOutbox {
  id: string;
  tipo: TipoEventoIntegracao;
  agregadoId: string;
  /** Contrato versionado do evento, enviado como corpo da requisição. */
  payload: unknown;
  /** Tentativas já feitas antes desta. */
  tentativas: number;
  correlationId: string | null;
}

/** O que gravar depois de uma tentativa (as tentativas sempre aumentam em 1). */
export type Desfecho =
  | { status: 'ENVIADO' }
  | { status: 'PENDENTE'; erro: string; atrasoMs: number }
  | { status: 'FALHOU'; erro: string };

/**
 * Porta de persistência da outbox (implementada com Prisma em infra/, como app_worker).
 */
export abstract class RepositorioOutbox {
  /**
   * Trava o próximo evento pronto para envio (FOR UPDATE SKIP LOCKED, ordem estrita por
   * solicitação), chama `tentar` e grava o desfecho, tudo na mesma transação. Devolve `false`
   * quando não há evento pronto.
   */
  abstract processarProximo(tentar: (evento: EventoOutbox) => Promise<Desfecho>): Promise<boolean>;
}

export interface RespostaEnvio {
  /** Código HTTP da resposta, ou `null` quando não houve resposta (rede ou tempo esgotado). */
  statusHttp: number | null;
  latenciaMs: number;
  /** Descrição do problema, quando a resposta não foi 2xx. */
  erro?: string;
}

/** Porta do sistema externo que recebe os eventos (POST /eventos). */
export abstract class SistemaExterno {
  abstract enviar(evento: EventoOutbox): Promise<RespostaEnvio>;
}

/** Sinal de vida do worker, lido pelo healthcheck do container. */
export abstract class Heartbeat {
  abstract registrar(agora: Date): Promise<void>;
}
