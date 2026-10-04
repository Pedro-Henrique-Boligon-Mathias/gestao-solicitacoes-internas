import { createZodDto } from '../../common/zod/create-zod-dto';
import { z } from 'zod';
import { PERIODOS } from './domain/periodo';

const contagem = z.int().min(0);

export const valorDoPeriodo = z.enum(PERIODOS, 'O período deve ser hoje, 7d, 30d ou tudo.');

export const consultaResumoSchema = z.object({
  periodo: valorDoPeriodo
    .default('tudo')
    .describe(
      'Janela móvel no fuso America/Sao_Paulo: hoje (desde a meia-noite), 7d, 30d ou tudo (padrão)',
    ),
});

export const periodoAplicadoSchema = z
  .object({
    valor: valorDoPeriodo,
    inicio: z.iso
      .datetime()
      .nullable()
      .describe('Início inclusivo; null em tudo')
      .meta({ example: '2026-09-27T10:15:00.000Z' }),
    fim: z.iso
      .datetime()
      .describe('Instante da consulta')
      .meta({ example: '2026-10-04T10:15:00.000Z' }),
  })
  .describe('Período aplicado a total, porStatus e porPrioridade');

export const resumoSchema = z.object({
  escopo: z
    .enum(['GERAL', 'PROPRIAS'])
    .describe('GERAL para analista e administrador; PROPRIAS para o solicitante')
    .meta({ example: 'GERAL' }),
  total: contagem
    .describe('Solicitações no escopo com dataSolicitacao no período')
    .meta({ example: 42 }),
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
  periodo: periodoAplicadoSchema.meta({
    example: { valor: '7d', inicio: '2026-09-27T10:15:00.000Z', fim: '2026-10-04T10:15:00.000Z' },
  }),
  filaAlta: contagem
    .describe('ABERTA de prioridade ALTA no escopo (ignora o período)')
    .meta({ example: 3 }),
  aberturaMaisAntiga: z.iso
    .datetime()
    .nullable()
    .describe('dataSolicitacao da ABERTA mais antiga no escopo, ou null (ignora o período)')
    .meta({ example: '2026-09-20T09:00:00.000Z' }),
  geradoEm: z.iso.datetime().meta({ example: '2026-10-03T10:15:00.000Z' }),
});

export class ConsultaResumoDto extends createZodDto(consultaResumoSchema) {}
export class ResumoDto extends createZodDto(resumoSchema) {}
