import { z } from 'zod';

// Resposta de GET /health/ready (formato do @nestjs/terminus).
export const estadoComponenteSchema = z.looseObject({
  status: z.enum(['up', 'down']),
});

export const respostaProntidaoSchema = z.looseObject({
  status: z.enum(['ok', 'error', 'shutting_down']),
  details: z.record(z.string(), estadoComponenteSchema),
});

export type RespostaProntidao = z.infer<typeof respostaProntidaoSchema>;
