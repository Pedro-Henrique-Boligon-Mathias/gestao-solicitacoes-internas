import './config/zod';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validarEnvWorker, type EnvWorker } from './config/env-worker';
import {
  Heartbeat,
  RepositorioOutbox,
  SistemaExterno,
} from './modules/integracoes/application/portas';
import { ProcessadorOutbox } from './modules/integracoes/application/processador-outbox';
import { ClienteHttpSistemaExterno } from './modules/integracoes/infra/cliente-http';
import { HeartbeatEmArquivo } from './modules/integracoes/infra/heartbeat-arquivo';
import { PrismaWorkerService } from './modules/integracoes/infra/prisma-worker.service';
import { RepositorioOutboxPrisma } from './modules/integracoes/infra/repositorio-outbox.prisma';

/**
 * Contexto do worker da outbox (sem HTTP): conecta como app_worker e entrega os eventos ao
 * sistema externo. O `init()` não inicia nenhum laço; os ciclos rodam pelo `worker.ts`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEnvWorker,
      envFilePath: ['.env', '../../.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvWorker, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          base: { servico: 'worker' },
          ...(config.get('NODE_ENV', { infer: true }) === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
  providers: [
    PrismaWorkerService,
    { provide: RepositorioOutbox, useClass: RepositorioOutboxPrisma },
    { provide: SistemaExterno, useClass: ClienteHttpSistemaExterno },
    { provide: Heartbeat, useClass: HeartbeatEmArquivo },
    ProcessadorOutbox,
  ],
})
export class WorkerModule {}
