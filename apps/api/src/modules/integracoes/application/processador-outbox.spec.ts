import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import type { EnvWorker } from '../../../config/env-worker';
import {
  Heartbeat,
  RepositorioOutbox,
  SistemaExterno,
  type Desfecho,
  type EventoOutbox,
  type RespostaEnvio,
} from './portas';
import { ProcessadorOutbox } from './processador-outbox';

const CONFIG: Partial<EnvWorker> = {
  OUTBOX_LOTE: 10,
  OUTBOX_MAX_TENTATIVAS: 8,
  OUTBOX_BACKOFF_BASE_MS: 1000,
  OUTBOX_BACKOFF_MAX_MS: 60000,
};

function evento(indice: number): EventoOutbox {
  return {
    id: `evento-${indice}`,
    tipo: 'SolicitacaoAprovada',
    agregadoId: `solicitacao-${indice}`,
    payload: {},
    tentativas: 0,
    correlationId: null,
  };
}

class HeartbeatFalso extends Heartbeat {
  registros = 0;
  registrar(): Promise<void> {
    this.registros += 1;
    return Promise.resolve();
  }
}

/** Entrega os eventos em fila e anota quantos heartbeats já tinham sido gravados antes de cada um. */
class RepositorioFalso extends RepositorioOutbox {
  heartbeatsAntesDeCada: number[] = [];
  constructor(
    private readonly fila: EventoOutbox[],
    private readonly heartbeat: HeartbeatFalso,
  ) {
    super();
  }
  async processarProximo(tentar: (evento: EventoOutbox) => Promise<Desfecho>): Promise<boolean> {
    const proximo = this.fila.shift();
    if (!proximo) return false;
    this.heartbeatsAntesDeCada.push(this.heartbeat.registros);
    await tentar(proximo);
    return true;
  }
}

class SistemaExternoFalso extends SistemaExterno {
  enviar(): Promise<RespostaEnvio> {
    return Promise.resolve({ statusHttp: 201, latenciaMs: 1 });
  }
}

function montar(fila: EventoOutbox[]) {
  const heartbeat = new HeartbeatFalso();
  const repositorio = new RepositorioFalso(fila, heartbeat);
  const config = { get: (chave: keyof EnvWorker) => CONFIG[chave] } as ConfigService<
    EnvWorker,
    true
  >;
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as PinoLogger;
  const processador = new ProcessadorOutbox(
    repositorio,
    new SistemaExternoFalso(),
    heartbeat,
    config,
    logger,
  );
  return { processador, heartbeat, repositorio };
}

describe('ADR-010: heartbeat do worker', () => {
  it('ADR-010: ciclo sem eventos grava o heartbeat uma vez', async () => {
    const { processador, heartbeat } = montar([]);
    await expect(processador.processarCiclo()).resolves.toEqual({ processados: 0 });
    expect(heartbeat.registros).toBe(1);
  });

  it('ADR-010: o heartbeat é gravado a cada evento, para um ciclo longo não parecer worker parado', async () => {
    const { processador, heartbeat, repositorio } = montar([evento(1), evento(2), evento(3)]);

    await expect(processador.processarCiclo()).resolves.toEqual({ processados: 3 });

    // Antes do 2º e do 3º evento o heartbeat já tinha sido renovado pelos anteriores
    expect(repositorio.heartbeatsAntesDeCada).toEqual([0, 1, 2]);
    expect(heartbeat.registros).toBeGreaterThanOrEqual(3);
  });
});
