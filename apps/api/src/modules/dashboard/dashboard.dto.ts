import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const contagem = z.int().min(0);

export const resumoSchema = z.object({
  escopo: z
    .enum(['GERAL', 'PROPRIAS'])
    .describe('GERAL para analista e administrador; PROPRIAS para o solicitante'),
  total: contagem,
  porStatus: z.object({
    ABERTA: contagem,
    EM_ANALISE: contagem,
    APROVADA: contagem,
    REJEITADA: contagem,
  }),
  porPrioridade: z.object({ BAIXA: contagem, MEDIA: contagem, ALTA: contagem }),
  filaAlta: contagem.describe('ABERTA de prioridade ALTA no escopo'),
  aberturaMaisAntiga: z.iso
    .datetime()
    .nullable()
    .describe('dataSolicitacao da ABERTA mais antiga no escopo, ou null'),
  geradoEm: z.iso.datetime(),
});

export class ResumoDto extends createZodDto(resumoSchema) {}
