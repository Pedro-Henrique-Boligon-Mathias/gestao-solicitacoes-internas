import type { StatusOutbox } from './tipos';

export interface Foco<T> {
  /** O evento que define o status da integração da solicitação. */
  evento: T;
  /** Quantos eventos ainda não enviados estão atrás dele na fila. */
  aguardando: number;
}

/**
 * Evento em foco de uma solicitação (ADR-010): o mais antigo ainda não ENVIADO, que segura a fila
 * pela ordem estrita de envio; se todos foram enviados, o mais recente. `eventos` vem em ordem
 * cronológica. Sem eventos, não há foco.
 */
export function eventoEmFoco<T extends { status: StatusOutbox }>(
  eventos: readonly T[],
): Foco<T> | null {
  const indice = eventos.findIndex((evento) => evento.status !== 'ENVIADO');
  if (indice === -1) {
    const ultimo = eventos.at(-1);
    return ultimo ? { evento: ultimo, aguardando: 0 } : null;
  }
  const aguardando = eventos
    .slice(indice + 1)
    .filter((evento) => evento.status !== 'ENVIADO').length;
  return { evento: eventos[indice]!, aguardando };
}
