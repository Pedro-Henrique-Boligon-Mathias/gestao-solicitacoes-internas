import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ACOES, PRIORIDADES, RESULTADOS, STATUS } from '../domain/tipos';

// Entrada ----------------------------------------------------------------------------------------

const titulo = z
  .string()
  .trim()
  .min(5, 'O título deve ter pelo menos 5 caracteres.')
  .max(120, 'O título deve ter no máximo 120 caracteres.')
  .describe('5 a 120 caracteres, sem contar os espaços nas pontas');

// Gravada como foi digitada (sem trim), mas precisa de 10 caracteres que não sejam espaço. O `\s` do
// JavaScript cobre mais caracteres que o do PostgreSQL, então o que passa aqui passa no CHECK.
const descricao = z
  .string()
  .min(10, 'A descrição deve ter pelo menos 10 caracteres.')
  .max(5000, 'A descrição deve ter no máximo 5000 caracteres.')
  .refine((texto) => texto.replace(/\s/g, '').length >= 10, {
    message: 'A descrição deve ter pelo menos 10 caracteres que não sejam espaço.',
  })
  .describe('10 a 5000 caracteres, com pelo menos 10 que não sejam espaço; gravada sem trim');

const prioridade = z.enum(PRIORIDADES, 'Escolha a prioridade: BAIXA, MEDIA ou ALTA.');

/** Comentário da decisão e justificativa da reabertura: 10 a 2000 caracteres (RN-06, RN-16). */
function textoObrigatorio(nome: string): z.ZodString {
  return z
    .string()
    .trim()
    .min(10, `${nome} deve ter pelo menos 10 caracteres.`)
    .max(2000, `${nome} deve ter no máximo 2000 caracteres.`);
}

// Corpos estritos: status, solicitante, área, data e afins no corpo → 400 (RN-01, RN-03)
export const criarSolicitacaoSchema = z
  .strictObject({ titulo, descricao, prioridade })
  .describe('Solicitante, área, data e status vêm do servidor e não são aceitos');

export const editarSolicitacaoSchema = z
  .strictObject({
    titulo: titulo.optional(),
    descricao: descricao.optional(),
    prioridade: prioridade.optional(),
    versao: z
      .int('Informe a versão atual da solicitação.')
      .min(1, 'Informe a versão atual da solicitação.')
      .describe('Versão lida; se outra pessoa alterou antes, a resposta é 409 CONFLITO_DE_VERSAO'),
  })
  .refine(
    (corpo) =>
      corpo.titulo !== undefined || corpo.descricao !== undefined || corpo.prioridade !== undefined,
    { message: 'Informe ao menos um campo para alterar: título, descrição ou prioridade.' },
  )
  .describe('Só título, descrição e prioridade; o status muda pelos comandos');

export const decisaoSchema = z.strictObject({
  resultado: z.enum(RESULTADOS, 'O resultado deve ser APROVADA ou REJEITADA.'),
  comentario: textoObrigatorio('O comentário'),
});

export const reaberturaSchema = z.strictObject({
  justificativa: textoObrigatorio('A justificativa'),
});

/** Aceita o parâmetro uma vez (`status=ABERTA`) ou repetido (`status=ABERTA&status=EM_ANALISE`). */
function variosValores<const T extends readonly [string, ...string[]]>(valores: T, nome: string) {
  const valor = z.enum(valores, `${nome} inválido.`);
  return z
    .union([valor, z.array(valor)])
    .transform((recebido) => (Array.isArray(recebido) ? recebido : [recebido]))
    .optional();
}

export const consultaListaSchema = z.object({
  q: z
    .string()
    .trim()
    .refine((termo) => termo.length === 0 || termo.length >= 2, {
      message: 'A busca precisa de pelo menos 2 caracteres.',
    })
    .pipe(z.string().max(200, 'A busca deve ter no máximo 200 caracteres.'))
    .transform((termo) => termo || undefined)
    .optional()
    .describe(
      'Título, descrição ou código (SOL-000042 ou 42), sem diferenciar maiúsculas e acentos. Depois de tirar os espaços nas pontas: vazio (ignorado) ou de 2 a 200 caracteres',
    ),
  status: variosValores(STATUS, 'Status'),
  prioridade: variosValores(PRIORIDADES, 'Prioridade'),
  ordenarPor: z
    .enum(['dataSolicitacao', 'prioridade'], 'Ordene por dataSolicitacao ou prioridade.')
    .default('dataSolicitacao')
    .describe(
      'prioridade: ALTA → MEDIA → BAIXA e, dentro, a mais antiga primeiro (ignora direcao)',
    ),
  direcao: z.enum(['asc', 'desc'], 'A direção deve ser asc ou desc.').default('desc'),
  analista: z
    .enum(['eu'], 'O filtro de analista aceita só "eu".')
    .optional()
    .describe('eu: só as que têm o usuário atual como analista responsável'),
  page: z.coerce
    .number()
    .int('A página deve ser um número inteiro.')
    .min(1, 'A página começa em 1.')
    .default(1),
  pageSize: z.coerce
    .number()
    .int('O tamanho da página deve ser um número inteiro.')
    .min(1, 'O tamanho da página deve ser de 1 a 100.')
    .max(100, 'O tamanho da página deve ser de 1 a 100.')
    .default(20),
});

export class CriarSolicitacaoDto extends createZodDto(criarSolicitacaoSchema) {}
export class EditarSolicitacaoDto extends createZodDto(editarSolicitacaoSchema) {}
export class DecisaoDto extends createZodDto(decisaoSchema) {}
export class ReaberturaDto extends createZodDto(reaberturaSchema) {}
export class ConsultaListaDto extends createZodDto(consultaListaSchema) {}

// Saída ------------------------------------------------------------------------------------------

const pessoa = z.object({ id: z.uuid(), nome: z.string() });
const dataHora = z.iso.datetime();

export const itemListaSchema = z.object({
  id: z.uuid(),
  codigo: z.string().describe('Código de exibição, ex.: SOL-000042'),
  titulo: z.string(),
  prioridade: z.enum(PRIORIDADES),
  status: z.enum(STATUS),
  solicitante: pessoa,
  area: pessoa.describe('Área do solicitante na criação'),
  analista: pessoa.nullable().describe('Analista responsável; null até a análise começar'),
  dataSolicitacao: dataHora,
  atualizadoEm: dataHora,
});

export const solicitacaoSchema = itemListaSchema.extend({
  descricao: z.string(),
  decisao: z
    .object({
      resultado: z.enum(RESULTADOS),
      comentario: z.string(),
      decididoEm: dataHora,
      decididoPor: pessoa,
    })
    .nullable()
    .describe('Decisão vigente; null enquanto não houver decisão ou depois de uma reabertura'),
  versao: z.int().describe('Envie no PATCH para o controle de concorrência'),
  acoesPermitidas: z
    .array(z.enum(ACOES))
    .describe('O que o usuário atual pode fazer agora; a UI só mostra esses botões'),
});

export const paginaSolicitacoesSchema = z.object({
  data: z.array(itemListaSchema),
  meta: z.object({
    page: z.int(),
    pageSize: z.int(),
    total: z.int(),
    totalPages: z.int().describe('0 quando não há resultados'),
  }),
});

export const eventoHistoricoSchema = z.object({
  id: z.uuid(),
  tipo: z.enum([
    'CRIADA',
    'EDITADA',
    'ANALISE_INICIADA',
    'APROVADA',
    'REJEITADA',
    'REABERTA',
    'EXCLUIDA',
  ]),
  statusAnterior: z.enum(STATUS).nullable(),
  statusNovo: z.enum(STATUS).nullable().describe('null em eventos que não mudam status (EDITADA)'),
  comentario: z
    .string()
    .nullable()
    .describe('Comentário da decisão ou justificativa da reabertura'),
  autor: pessoa,
  dados: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe(
      'EDITADA: { campo: { antes, depois } }; REABERTA: { decisaoAnterior: { resultado, comentario, decididoEm, decididoPor, analista } }',
    ),
  criadoEm: dataHora,
});

export class ItemListaDto extends createZodDto(itemListaSchema) {}
export class SolicitacaoDto extends createZodDto(solicitacaoSchema) {}
export class PaginaSolicitacoesDto extends createZodDto(paginaSolicitacoesSchema) {}
export class EventoHistoricoDto extends createZodDto(eventoHistoricoSchema) {}
