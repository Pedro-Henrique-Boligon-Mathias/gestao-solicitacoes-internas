import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger, PinoLogger } from 'nestjs-pino';
import type { EnvWorker } from './config/env-worker';
import { ProcessadorOutbox } from './modules/integracoes/application/processador-outbox';
import { WorkerModule } from './worker.module';

/**
 * Worker da outbox: `node dist/worker.js`. Roda um ciclo a cada OUTBOX_INTERVALO_MS. No SIGTERM
 * (ou SIGINT), termina o ciclo em andamento, fecha as conexões e sai.
 */
async function iniciar(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const logger = await app.resolve(PinoLogger);
  logger.setContext('Worker');

  const config = app.get<ConfigService<EnvWorker, true>>(ConfigService);
  const intervaloMs = config.get('OUTBOX_INTERVALO_MS', { infer: true });
  const processador = app.get(ProcessadorOutbox);

  let encerrando = false;
  let acordar: (() => void) | undefined;
  const encerrar = (sinal: NodeJS.Signals): void => {
    if (encerrando) return;
    encerrando = true;
    logger.info({ sinal }, 'Encerrando o worker depois do ciclo em andamento');
    acordar?.();
  };
  process.once('SIGTERM', encerrar);
  process.once('SIGINT', encerrar);

  logger.info(
    {
      extUrl: config.get('EXT_URL', { infer: true }),
      intervaloMs,
      lote: config.get('OUTBOX_LOTE', { infer: true }),
      maxTentativas: config.get('OUTBOX_MAX_TENTATIVAS', { infer: true }),
      backoffBaseMs: config.get('OUTBOX_BACKOFF_BASE_MS', { infer: true }),
      backoffMaxMs: config.get('OUTBOX_BACKOFF_MAX_MS', { infer: true }),
    },
    'Worker da outbox iniciado',
  );

  while (!encerrando) {
    try {
      const { processados } = await processador.processarCiclo();
      if (processados > 0) logger.debug({ processados }, 'Ciclo concluído');
    } catch (erro) {
      // Sem heartbeat neste ciclo: se o erro persistir (banco fora do ar), o healthcheck acusa
      logger.error({ err: erro }, 'Falha no ciclo do worker');
    }
    if (encerrando) break;
    await new Promise<void>((resolve) => {
      const espera = setTimeout(resolve, intervaloMs);
      acordar = () => {
        clearTimeout(espera);
        resolve();
      };
    });
  }

  await app.close();
  logger.info('Worker encerrado');
}

iniciar().catch((erro: unknown) => {
  process.stderr.write(`Falha ao iniciar o worker: ${String(erro)}\n`);
  process.exit(1);
});
