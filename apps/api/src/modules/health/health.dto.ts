import { createZodDto } from '../../common/zod/create-zod-dto';
import { z } from 'zod';

export const estadoComponenteSchema = z.enum(['up', 'down']);
export type EstadoComponente = z.infer<typeof estadoComponenteSchema>;

export const respostaVivacidadeSchema = z.object({
  status: z.literal('ok').meta({ example: 'ok' }),
});

export const respostaProntidaoSchema = z.object({
  status: z.enum(['ok', 'error']).meta({ example: 'ok' }),
  details: z
    .object({
      database: z.object({ status: estadoComponenteSchema }),
    })
    .meta({ example: { database: { status: 'up' } } }),
});

export type RespostaProntidao = z.infer<typeof respostaProntidaoSchema>;

export class RespostaVivacidadeDto extends createZodDto(respostaVivacidadeSchema) {}
export class RespostaProntidaoDto extends createZodDto(respostaProntidaoSchema) {}
