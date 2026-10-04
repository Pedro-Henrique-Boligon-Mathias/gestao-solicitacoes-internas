import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvWorker } from '../../../config/env-worker';
import type { TipoEventoIntegracao } from '../domain/tipos';
import { RepositorioOutbox, type Desfecho, type EventoOutbox } from '../application/portas';
import { PrismaWorkerService } from './prisma-worker.service';

interface LinhaOutbox {
  id: string;
  tipo: TipoEventoIntegracao;
  agregado_id: string;
  payload: unknown;
  tentativas: number;
  correlation_id: string | null;
}

/** Folga da transação além do timeout do envio (consultas e gravação do desfecho). */
const FOLGA_TRANSACAO_MS = 15_000;

/**
 * Outbox no Postgres, como app_worker. A transação segura a trava do evento durante o envio:
 * outra réplica que rodar ao mesmo tempo pula a linha (SKIP LOCKED) em vez de enviá-la de novo.
 */
@Injectable()
export class RepositorioOutboxPrisma extends RepositorioOutbox {
  private readonly timeoutTransacaoMs: number;

  constructor(
    private readonly prisma: PrismaWorkerService,
    config: ConfigService<EnvWorker, true>,
  ) {
    super();
    this.timeoutTransacaoMs = config.get('OUTBOX_TIMEOUT_MS', { infer: true }) + FOLGA_TRANSACAO_MS;
  }

  processarProximo(tentar: (evento: EventoOutbox) => Promise<Desfecho>): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        // Ordem estrita por solicitação: um evento só sai depois que todos os anteriores da mesma
        // solicitação foram enviados. Um anterior em FALHOU segura os seguintes até o
        // reprocessamento.
        const [linha] = await tx.$queryRaw<LinhaOutbox[]>`
          SELECT e.id, e.tipo, e.agregado_id, e.payload, e.tentativas, e.correlation_id
            FROM outbox_eventos e
           WHERE e.status = 'PENDENTE'
             AND e.proxima_tentativa_em <= now()
             AND NOT EXISTS (
                   SELECT 1 FROM outbox_eventos a
                    WHERE a.agregado_id = e.agregado_id
                      AND a.status <> 'ENVIADO'
                      AND (a.criado_em, a.id) < (e.criado_em, e.id))
           ORDER BY e.criado_em, e.id
           LIMIT 1
             FOR UPDATE SKIP LOCKED`;
        if (!linha) return false;

        const desfecho = await tentar({
          id: linha.id,
          tipo: linha.tipo,
          agregadoId: linha.agregado_id,
          payload: linha.payload,
          tentativas: linha.tentativas,
          correlationId: linha.correlation_id,
        });

        // ultima_tentativa_em vai na mesma atualização do desfecho, com a hora real (fim da
        // tentativa), como enviado_em; now() seria o início da transação, antes da chamada HTTP.
        switch (desfecho.status) {
          case 'ENVIADO':
            await tx.$executeRaw`
              UPDATE outbox_eventos
                 SET status = 'ENVIADO', enviado_em = clock_timestamp(), tentativas = tentativas + 1,
                     ultima_tentativa_em = clock_timestamp()
               WHERE id = ${linha.id}::uuid`;
            break;
          case 'PENDENTE':
            await tx.$executeRaw`
              UPDATE outbox_eventos
                 SET tentativas = tentativas + 1, ultimo_erro = ${desfecho.erro},
                     ultima_tentativa_em = clock_timestamp(),
                     proxima_tentativa_em = clock_timestamp()
                       + ${desfecho.atrasoMs}::int * interval '1 millisecond'
               WHERE id = ${linha.id}::uuid`;
            break;
          case 'FALHOU':
            await tx.$executeRaw`
              UPDATE outbox_eventos
                 SET status = 'FALHOU', tentativas = tentativas + 1, ultimo_erro = ${desfecho.erro},
                     ultima_tentativa_em = clock_timestamp()
               WHERE id = ${linha.id}::uuid`;
            break;
        }
        return true;
      },
      { maxWait: 10_000, timeout: this.timeoutTransacaoMs },
    );
  }
}
