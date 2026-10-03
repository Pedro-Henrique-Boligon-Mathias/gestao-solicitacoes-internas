import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { EnvWorker } from '../../../config/env-worker';
import { PrismaClient } from '../../../generated/prisma/client';

/** Conexão do worker: papel app_worker, que só lê e atualiza outbox_eventos. */
@Injectable()
export class PrismaWorkerService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvWorker, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('WORKER_DATABASE_URL', { infer: true }),
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
