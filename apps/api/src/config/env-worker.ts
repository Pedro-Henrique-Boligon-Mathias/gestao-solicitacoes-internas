import { z } from 'zod';
import { maxTentativasSchema } from './integracao';

const milissegundos = (padrao: number) => z.coerce.number().int().positive().default(padrao);

/**
 * Ambiente do worker da outbox (`node dist/worker.js`). Ele não sobe HTTP nem fala com as tabelas
 * da API: conecta como app_worker e lê só outbox_eventos. Os padrões de backoff são os de
 * produção (30 s, teto de 2 h); o Compose usa valores curtos para a demonstração.
 */
export const envWorkerSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WORKER_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  EXT_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, '')),
  OUTBOX_INTERVALO_MS: milissegundos(2_000),
  OUTBOX_LOTE: z.coerce.number().int().min(1).max(1_000).default(10),
  OUTBOX_TIMEOUT_MS: milissegundos(5_000),
  OUTBOX_BACKOFF_BASE_MS: milissegundos(30_000),
  OUTBOX_BACKOFF_MAX_MS: milissegundos(7_200_000),
  OUTBOX_MAX_TENTATIVAS: maxTentativasSchema,
  WORKER_HEARTBEAT_ARQUIVO: z.string().min(1).default('/tmp/worker-heartbeat'),
});

export type EnvWorker = z.infer<typeof envWorkerSchema>;

/** Usado pelo ConfigModule do worker: ele não sobe com configuração faltando ou inválida. */
export function validarEnvWorker(variaveis: Record<string, unknown>): EnvWorker {
  const resultado = envWorkerSchema.safeParse(variaveis);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração de ambiente inválida. ${problemas}`);
  }
  return resultado.data;
}
