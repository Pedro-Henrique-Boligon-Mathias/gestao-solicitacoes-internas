import { createZodDto } from '../zod/create-zod-dto';
import { z } from 'zod';
import { EXEMPLO } from '../../openapi/exemplos';

export const erroDeCampoSchema = z.object({
  campo: z.string().describe('Caminho do campo, com "." nos aninhados (ex.: item.quantidade)'),
  mensagem: z.string(),
});

export const problemDetailsSchema = z
  .object({
    type: z.url().meta({ example: 'https://solicitacoes.local/erros/transicao-invalida' }),
    title: z.string().meta({ example: 'Transição de status inválida' }),
    status: z.int().min(400).max(599).meta({ example: 409 }),
    detail: z.string().optional().describe('Ausente em erros 5xx').meta({
      example:
        'Uma solicitação com status Aberta não pode ser aprovada. Inicie a análise primeiro.',
    }),
    instance: z
      .string()
      .describe('Caminho da requisição')
      .meta({ example: `/api/v1/solicitacoes/${EXEMPLO.solicitacaoId}/decisao` }),
    code: z
      .string()
      .describe('Código estável para o front (ex.: NAO_ENCONTRADO)')
      .meta({ example: 'TRANSICAO_INVALIDA' }),
    requestId: z
      .string()
      .optional()
      .describe('Mesmo valor do header X-Request-Id')
      .meta({ example: EXEMPLO.requestId }),
    errors: z
      .array(erroDeCampoSchema)
      .optional()
      .describe('Erros por campo (DADOS_INVALIDOS)')
      .meta({
        example: [{ campo: 'titulo', mensagem: 'O título deve ter pelo menos 5 caracteres.' }],
      }),
  })
  .describe('Erro no formato RFC 9457 (application/problem+json)');

export type ErroDeCampo = z.infer<typeof erroDeCampoSchema>;

// O nome da classe vira o nome do componente no OpenAPI (components.schemas.ProblemDetails).
export class ProblemDetails extends createZodDto(problemDetailsSchema) {}
