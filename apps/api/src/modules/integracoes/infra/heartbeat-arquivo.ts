import { writeFile } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvWorker } from '../../../config/env-worker';
import { Heartbeat } from '../application/portas';

/**
 * Grava o horário do último ciclo concluído (ISO-8601 UTC) em WORKER_HEARTBEAT_ARQUIVO. O
 * healthcheck do container considera o worker vivo se esse horário tiver menos de 30 s.
 */
@Injectable()
export class HeartbeatEmArquivo extends Heartbeat {
  private readonly arquivo: string;

  constructor(config: ConfigService<EnvWorker, true>) {
    super();
    this.arquivo = config.get('WORKER_HEARTBEAT_ARQUIVO', { infer: true });
  }

  async registrar(agora: Date): Promise<void> {
    await writeFile(this.arquivo, agora.toISOString());
  }
}
