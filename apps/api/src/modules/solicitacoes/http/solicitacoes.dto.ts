import { createZodDto } from '../../../common/zod/create-zod-dto';
import { z } from 'zod';
import { EXEMPLO } from '../../../openapi/exemplos';
import { STATUS_OUTBOX, TIPOS_EVENTO_INTEGRACAO } from '../../integracoes/domain/tipos';
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
  .strictObject({
    titulo: titulo.meta({ example: EXEMPLO.titulo }),
    descricao: descricao.meta({ example: EXEMPLO.descricao }),
    prioridade: prioridade.meta({ example: 'ALTA' }),
  })
  .describe('Solicitante, área, data e status vêm do servidor e não são aceitos');

export const editarSolicitacaoSchema = z
  .strictObject({
    titulo: titulo.optional().meta({ example: 'Acesso de leitura ao sistema de cobrança' }),
    descricao: descricao.optional().meta({ example: EXEMPLO.descricao }),
    prioridade: prioridade.optional().meta({ example: 'MEDIA' }),
    versao: z
      .int('Informe a versão atual da solicitação.')
      .min(1, 'Informe a versão atual da solicitação.')
      .describe('Versão lida; se outra pessoa alterou antes, a resposta é 409 CONFLITO_DE_VERSAO')
      .meta({ example: 1 }),
  })
  .refine(
    (corpo) =>
      corpo.titulo !== undefined || corpo.descricao !== undefined || corpo.prioridade !== undefined,
    { message: 'Informe ao menos um campo para alterar: título, descrição ou prioridade.' },
  )
  .describe('Só título, descrição e prioridade; o status muda pelos comandos');

export const decisaoSchema = z.strictObject({
  resultado: z
    .enum(RESULTADOS, 'O resultado deve ser APROVADA ou REJEITADA.')
    .meta({ example: 'APROVADA' }),
  comentario: textoObrigatorio('O comentário').meta({ example: EXEMPLO.comentario }),
});

export const reaberturaSchema = z.strictObject({
  justificativa: textoObrigatorio('A justificativa').meta({ example: EXEMPLO.justificativa }),
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
    .enum(
      ['dataSolicitacao', 'prioridade', 'decididoEm'],
      'Ordene por dataSolicitacao, prioridade ou decididoEm.',
    )
    .default('dataSolicitacao')
    .describe(
      'prioridade: ALTA → MEDIA → BAIXA e, dentro, a mais antiga primeiro (ignora direcao). decididoEm: a decisão mais recente primeiro e as sem decisão no fim (ignora direcao)',
    ),
  direcao: z.enum(['asc', 'desc'], 'A direção deve ser asc ou desc.').default('desc'),
  analista: z
    .union([z.literal('eu'), z.uuid()], 'O filtro de analista aceita "eu" ou o id de um analista.')
    .optional()
    .describe(
      'eu: só as que têm o usuário atual como analista responsável; <id> (UUID): só as desse analista. Ignorado para o solicitante, que vê todas as próprias',
    ),
  area: z
    .union([z.uuid('Área inválida.'), z.array(z.uuid('Área inválida.'))])
    .transform((recebido) => (Array.isArray(recebido) ? recebido : [recebido]))
    .optional()
    .describe('Id da área (UUID); pode repetir: area=<id>&area=<id>'),
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

// Os exemplos de pessoa e área ficam em cada uso (solicitante, analista, área)
const pessoa = z.object({ id: z.uuid(), nome: z.string() });
const dataHora = z.iso.datetime();

/** Decisão vigente: a mesma no item da lista e no detalhe. */
const decisaoVigenteSchema = z
  .object({
    resultado: z.enum(RESULTADOS),
    comentario: z.string(),
    decididoEm: dataHora,
    decididoPor: pessoa,
  })
  .nullable()
  .describe('Decisão vigente; null enquanto não houver decisão ou depois de uma reabertura')
  .meta({
    example: {
      resultado: 'APROVADA',
      comentario: EXEMPLO.comentario,
      decididoEm: EXEMPLO.decididoEm,
      decididoPor: EXEMPLO.carla,
    },
  });

const resumoSolicitacaoSchema = z.object({
  id: z.uuid().meta({ example: EXEMPLO.solicitacaoId }),
  codigo: z
    .string()
    .describe('Código de exibição, ex.: SOL-000042')
    .meta({ example: EXEMPLO.codigo }),
  titulo: z.string().meta({ example: EXEMPLO.titulo }),
  prioridade: z.enum(PRIORIDADES).meta({ example: 'ALTA' }),
  status: z.enum(STATUS).meta({ example: 'APROVADA' }),
  solicitante: pessoa.meta({ example: EXEMPLO.ana }),
  area: pessoa.describe('Área do solicitante na criação').meta({ example: EXEMPLO.financeiro }),
  analista: pessoa
    .nullable()
    .describe('Analista responsável; null até a análise começar')
    .meta({ example: EXEMPLO.carla }),
  dataSolicitacao: dataHora.meta({ example: EXEMPLO.dataSolicitacao }),
  atualizadoEm: dataHora.meta({ example: EXEMPLO.decididoEm }),
});

export const itemListaSchema = resumoSolicitacaoSchema.extend({
  analiseIniciadaEm: dataHora
    .nullable()
    .describe(
      'Início da análise atual: o último ANALISE_INICIADA depois da última reabertura. Só em EM_ANALISE; null nos demais status',
    )
    .meta({ example: null }),
  decisao: decisaoVigenteSchema,
});

const EXEMPLO_EVENTOS_INTEGRACAO = [
  {
    id: EXEMPLO.eventoId,
    tipo: 'SolicitacaoAprovada',
    status: 'ENVIADO',
    tentativas: 2,
    criadoEm: EXEMPLO.decididoEm,
    enviadaEm: EXEMPLO.enviadaEm,
  },
];

export const eventoIntegracaoSchema = z.object({
  id: z.uuid().describe('Id do evento (também a chave de idempotência do envio)'),
  tipo: z.enum(TIPOS_EVENTO_INTEGRACAO),
  status: z.enum(STATUS_OUTBOX),
  tentativas: z.int().min(0),
  criadoEm: dataHora,
  enviadaEm: dataHora.nullable().describe('null enquanto não for entregue'),
});

export const integracaoSchema = z
  .object({
    status: z
      .enum(STATUS_OUTBOX)
      .describe(
        'Status do evento em foco: o mais antigo ainda não enviado (segura a fila da solicitação) ou, se todos foram enviados, o mais recente',
      )
      .meta({ example: 'ENVIADO' }),
    tipo: z
      .enum(TIPOS_EVENTO_INTEGRACAO)
      .describe('Tipo do evento em foco')
      .meta({ example: 'SolicitacaoAprovada' }),
    tentativas: z
      .int()
      .min(0)
      .describe('Tentativas já feitas para o evento em foco')
      .meta({ example: 2 }),
    maxTentativas: z
      .int()
      .min(1)
      .describe('Limite de tentativas automáticas (depois, FALHOU)')
      .meta({ example: 8 }),
    proximaTentativaEm: dataHora
      .describe('Quando o evento em foco será tentado (relevante só em PENDENTE)')
      .meta({ example: EXEMPLO.decididoEm }),
    enviadaEm: dataHora
      .nullable()
      .describe('Quando o evento em foco foi entregue; null se ainda não foi')
      .meta({ example: EXEMPLO.enviadaEm }),
    aguardando: z
      .int()
      .min(0)
      .describe('Eventos não enviados atrás do evento em foco')
      .meta({ example: 0 }),
    eventos: z
      .array(eventoIntegracaoSchema)
      .describe('Todos os eventos da solicitação, em ordem cronológica')
      .meta({ example: EXEMPLO_EVENTOS_INTEGRACAO }),
  })
  .describe('Integração com o sistema externo (ADR-010); null se a solicitação não tem evento');

export const solicitacaoSchema = resumoSolicitacaoSchema.extend({
  descricao: z.string().meta({ example: EXEMPLO.descricao }),
  decisao: decisaoVigenteSchema,
  versao: z.int().describe('Envie no PATCH para o controle de concorrência').meta({ example: 3 }),
  acoesPermitidas: z
    .array(z.enum(ACOES))
    .describe('O que o usuário atual pode fazer agora; a UI só mostra esses botões')
    .meta({ example: ['REABRIR'] }),
  integracao: integracaoSchema.nullable().meta({
    example: {
      status: 'ENVIADO',
      tipo: 'SolicitacaoAprovada',
      tentativas: 2,
      maxTentativas: 8,
      proximaTentativaEm: EXEMPLO.decididoEm,
      enviadaEm: EXEMPLO.enviadaEm,
      aguardando: 0,
      eventos: EXEMPLO_EVENTOS_INTEGRACAO,
    },
  }),
});

export const paginaSolicitacoesSchema = z.object({
  data: z.array(itemListaSchema),
  meta: z
    .object({
      page: z.int(),
      pageSize: z.int(),
      total: z.int(),
      totalPages: z.int().describe('0 quando não há resultados'),
    })
    .meta({ example: { page: 1, pageSize: 20, total: 42, totalPages: 3 } }),
});

export const eventoHistoricoSchema = z.object({
  id: z.uuid().meta({ example: EXEMPLO.historicoId }),
  tipo: z
    .enum([
      'CRIADA',
      'EDITADA',
      'ANALISE_INICIADA',
      'APROVADA',
      'REJEITADA',
      'REABERTA',
      'EXCLUIDA',
    ])
    .meta({ example: 'APROVADA' }),
  statusAnterior: z.enum(STATUS).nullable().meta({ example: 'EM_ANALISE' }),
  statusNovo: z
    .enum(STATUS)
    .nullable()
    .describe('null em eventos que não mudam status (EDITADA)')
    .meta({ example: 'APROVADA' }),
  comentario: z
    .string()
    .nullable()
    .describe('Comentário da decisão ou justificativa da reabertura')
    .meta({ example: EXEMPLO.comentario }),
  autor: pessoa.meta({ example: EXEMPLO.carla }),
  dados: z
    .record(z.string(), z.unknown())
    .nullable()
    .describe(
      'EDITADA: { campo: { antes, depois } }; REABERTA: { decisaoAnterior: { resultado, comentario, decididoEm, decididoPor, analista } }',
    )
    .meta({ example: null }),
  criadoEm: dataHora.meta({ example: EXEMPLO.decididoEm }),
});

export class ItemListaDto extends createZodDto(itemListaSchema) {}
export class SolicitacaoDto extends createZodDto(solicitacaoSchema) {}
export class PaginaSolicitacoesDto extends createZodDto(paginaSolicitacoesSchema) {}
export class EventoHistoricoDto extends createZodDto(eventoHistoricoSchema) {}

export type IntegracaoDto = z.infer<typeof integracaoSchema>;
