import { z } from 'zod';
import { createZodDto } from '../../common/zod/create-zod-dto';
import { consultaResumoSchema, valorDoPeriodo } from './dashboard.dto';
import { GRANULARIDADES } from './domain/granularidade';

const contagem = z.int().min(0);
const instante = z.iso.datetime();
const referencia = z.object({ id: z.uuid(), nome: z.string() });
const porPrioridade = z.object({ BAIXA: contagem, MEDIA: contagem, ALTA: contagem });
const dias = z.number().min(0);

export const consultaGestaoSchema = consultaResumoSchema;

const periodoGestaoSchema = z
  .object({
    valor: valorDoPeriodo,
    inicio: instante
      .nullable()
      .describe('Início inclusivo; null em tudo')
      .meta({ example: '2026-09-27T10:15:00.000Z' }),
    fim: instante.describe('Instante da consulta').meta({ example: '2026-10-04T10:15:00.000Z' }),
    granularidade: z
      .enum(GRANULARIDADES)
      .meta({ id: 'Granularidade', example: 'dia' })
      .nullable()
      .describe('Balde da série: dia (7d), semana (30d e tudo até 16 semanas) ou mes; null em hoje')
      .meta({ example: 'dia' }),
  })
  .describe('Período aplicado à entrada e saída, por área e por analista');

const anteriorSchema = z
  .object({
    entraram: contagem,
    sairam: contagem,
    tempoMedioDecisaoDias: dias.nullable().describe('null sem decisões na janela anterior'),
  })
  .describe('Janela de mesmo tamanho logo antes do período (7d e 30d)');

const maisAntigaNaFilaSchema = z
  .object({
    id: z.uuid(),
    codigo: z.string().meta({ example: 'SOL-000009' }),
    area: referencia,
    desde: instante.describe('dataSolicitacao da solicitação'),
  })
  .describe('ABERTA mais antiga (estado atual, ignora o período)');

const baldeSchema = z.object({
  inicio: instante.describe('Início do balde no fuso America/Sao_Paulo'),
  entraram: contagem,
  sairam: contagem,
});

const entradaSaidaSchema = z
  .object({
    entraram: contagem.describe('Eventos CRIADA e REABERTA no período').meta({ example: 12 }),
    sairam: contagem.describe('Eventos APROVADA e REJEITADA no período').meta({ example: 10 }),
    aprovadas: contagem.meta({ example: 7 }),
    rejeitadas: contagem.meta({ example: 3 }),
    saldo: z.int().describe('entraram − saíram').meta({ example: 2 }),
    anterior: anteriorSchema.nullable().describe('null em hoje e tudo'),
    tempoMedioDecisaoDias: dias
      .nullable()
      .describe('Média, em dias, de (decisão − dataSolicitacao) das decisões do período')
      .meta({ example: 10 }),
    maisAntigaNaFila: maisAntigaNaFilaSchema.nullable(),
    prioridadeEntraram: porPrioridade.describe('Entradas do período pela prioridade'),
    pendentesPorPrioridade: porPrioridade.describe('ABERTA e EM_ANALISE agora (ignora o período)'),
    serie: z.array(baldeSchema).describe('Baldes do período, com zero onde não houve evento'),
  })
  .describe('Entrada e saída da fila, pelos eventos do histórico (excluídas ficam fora)');

const porAreaSchema = z.object({
  area: referencia,
  total: contagem.describe('Solicitações da área com dataSolicitacao no período'),
  porStatus: z.object({
    ABERTA: contagem,
    EM_ANALISE: contagem,
    APROVADA: contagem,
    REJEITADA: contagem,
  }),
});

const porAnalistaSchema = z.object({
  analista: referencia,
  emAnaliseAgora: contagem.describe('EM_ANALISE com a pessoa agora (ignora o período)'),
  decididas: contagem.describe('Eventos APROVADA e REJEITADA da pessoa no período'),
  aprovadas: contagem,
  taxaAprovacao: z
    .number()
    .min(0)
    .max(1)
    .nullable()
    .describe('aprovadas / decididas; null sem decisões')
    .meta({ example: 0.7 }),
});

const integracaoComFalhaSchema = z.object({
  solicitacao: z.object({
    id: z.uuid(),
    codigo: z.string().meta({ example: 'SOL-000024' }),
    titulo: z.string(),
    solicitante: referencia,
    area: referencia,
  }),
  tipo: z.string().describe('Tipo do evento em foco').meta({ example: 'SolicitacaoAprovada' }),
  tentativas: contagem.meta({ example: 5 }),
  maxTentativas: z.int().min(1).meta({ example: 5 }),
  ultimoErro: z
    .string()
    .nullable()
    .describe('Último erro do sistema externo, cortado em 300 caracteres')
    .meta({ example: 'Sistema externo respondeu 503' }),
  ultimaTentativaEm: instante.nullable().meta({ example: '2026-10-04T09:40:00.000Z' }),
});

export const gestaoSchema = z.object({
  periodo: periodoGestaoSchema,
  entradaSaida: entradaSaidaSchema,
  porArea: z.array(porAreaSchema).describe('Todas as áreas ativas, inclusive as zeradas'),
  porAnalista: z
    .array(porAnalistaSchema)
    .describe(
      'Analistas e admins ativos com análise agora ou decisão no período, por emAnaliseAgora desc e nome',
    ),
  integracoesComFalha: z
    .array(integracaoComFalhaSchema)
    .max(20)
    .describe('Evento em foco FALHOU, da tentativa mais recente para a mais antiga (estado atual)'),
  geradoEm: instante.meta({ example: '2026-10-04T10:15:00.000Z' }),
});

export class ConsultaGestaoDto extends createZodDto(consultaGestaoSchema) {}
export class GestaoDto extends createZodDto(gestaoSchema) {}
