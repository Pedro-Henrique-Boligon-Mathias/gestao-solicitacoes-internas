import { z } from 'zod';

const MINIMO_10 = 'Escreva pelo menos 10 caracteres.';

/** Validação de UX do formulário; a API é a autoridade. */
export const solicitacaoSchema = z.object({
  titulo: z
    .string({ error: 'Escreva o título.' })
    .trim()
    .min(5, 'Escreva pelo menos 5 caracteres.')
    .max(120, 'Use no máximo 120 caracteres.'),
  descricao: z
    .string({ error: 'Escreva a descrição.' })
    .max(5000, 'Use no máximo 5000 caracteres.')
    .refine((texto) => texto.replace(/\s/g, '').length >= 10, MINIMO_10),
  prioridade: z
    .enum(['BAIXA', 'MEDIA', 'ALTA'], { error: 'Escolha a prioridade.' })
    .default('MEDIA'),
});

export type DadosSolicitacao = z.output<typeof solicitacaoSchema>;
export type EntradaSolicitacao = z.input<typeof solicitacaoSchema>;

/** Comentário da decisão e justificativa da reabertura. */
export const comentarioSchema = z
  .string({ error: MINIMO_10 })
  .trim()
  .min(10, MINIMO_10)
  .max(2000, 'Use no máximo 2000 caracteres.');

const VERSAO_INVALIDA = 'Versão inválida. Recarregue a página e tente de novo.';

/** Corpo da criação recebido pela Server Action: os campos do formulário e nada mais. */
export const criacaoSchema = z.strictObject(solicitacaoSchema.shape);

/** Corpo da edição: campos do formulário opcionais (sem o padrão da prioridade) e a versão. */
export const edicaoSchema = z.strictObject({
  titulo: solicitacaoSchema.shape.titulo.optional(),
  descricao: solicitacaoSchema.shape.descricao.optional(),
  prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA'], { error: 'Escolha a prioridade.' }).optional(),
  versao: z.number({ error: VERSAO_INVALIDA }).int(VERSAO_INVALIDA).min(1, VERSAO_INVALIDA),
});

export const decisaoSchema = z.strictObject({
  resultado: z.enum(['APROVADA', 'REJEITADA'], { error: 'Escolha aprovar ou rejeitar.' }),
  comentario: comentarioSchema,
});

export const reaberturaSchema = z.strictObject({ justificativa: comentarioSchema });
