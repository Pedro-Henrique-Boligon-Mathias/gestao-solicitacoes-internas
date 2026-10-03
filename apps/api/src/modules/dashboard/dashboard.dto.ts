import { createZodDto } from '../../common/zod/create-zod-dto';
import { z } from 'zod';

const contagem = z.int().min(0);

export const resumoSchema = z.object({
  escopo: z
    .enum(['GERAL', 'PROPRIAS'])
    .describe('GERAL para analista e administrador; PROPRIAS para o solicitante')
    .meta({ example: 'GERAL' }),
  total: contagem.meta({ example: 42 }),
  porStatus: z
    .object({
      ABERTA: contagem,
      EM_ANALISE: contagem,
      APROVADA: contagem,
      REJEITADA: contagem,
    })
    .meta({ example: { ABERTA: 10, EM_ANALISE: 7, APROVADA: 18, REJEITADA: 7 } }),
  porPrioridade: z
    .object({ BAIXA: contagem, MEDIA: contagem, ALTA: contagem })
    .meta({ example: { BAIXA: 12, MEDIA: 20, ALTA: 10 } }),
  filaAlta: contagem.describe('ABERTA de prioridade ALTA no escopo').meta({ example: 3 }),
  aberturaMaisAntiga: z.iso
    .datetime()
    .nullable()
    .describe('dataSolicitacao da ABERTA mais antiga no escopo, ou null')
    .meta({ example: '2026-09-20T09:00:00.000Z' }),
  geradoEm: z.iso.datetime().meta({ example: '2026-10-03T10:15:00.000Z' }),
});

export class ResumoDto extends createZodDto(resumoSchema) {}
