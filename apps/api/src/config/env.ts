import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_SECRET: z.string().min(32, 'Use pelo menos 32 caracteres.'),
  // Duração no formato <número><unidade>, com unidade s, m, h ou d (ex.: 15m)
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^[1-9]\d*[smhd]$/, 'Use um número seguido de s, m, h ou d (ex.: 15m).')
    .default('15m'),
  REFRESH_TOKEN_DIAS: z.coerce.number().int().positive().default(7),
  REFRESH_GRACA_SEGUNDOS: z.coerce.number().int().nonnegative().default(10),
});

export type Env = z.infer<typeof envSchema>;

/** Usado pelo ConfigModule: a API não sobe com configuração faltando ou inválida. */
export function validarEnv(variaveis: Record<string, unknown>): Env {
  const resultado = envSchema.safeParse(variaveis);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração de ambiente inválida. ${problemas}`);
  }
  return resultado.data;
}
