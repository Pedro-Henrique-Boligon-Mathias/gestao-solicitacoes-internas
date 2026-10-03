import { createZodDto } from '../zod/create-zod-dto';
import { z } from 'zod';

export const erroDeCampoSchema = z.object({
  campo: z.string().describe('Caminho do campo, com "." nos aninhados (ex.: item.quantidade)'),
  mensagem: z.string(),
});

export const problemDetailsSchema = z
  .object({
    type: z.url(),
    title: z.string(),
    status: z.int().min(400).max(599),
    detail: z.string().optional().describe('Ausente em erros 5xx'),
    instance: z.string().describe('Caminho da requisição'),
    code: z.string().describe('Código estável para o front (ex.: NAO_ENCONTRADO)'),
    requestId: z.string().optional().describe('Mesmo valor do header X-Request-Id'),
    errors: z.array(erroDeCampoSchema).optional().describe('Erros por campo (DADOS_INVALIDOS)'),
  })
  .describe('Erro no formato RFC 9457 (application/problem+json)');

export type ErroDeCampo = z.infer<typeof erroDeCampoSchema>;

// O nome da classe vira o nome do componente no OpenAPI (components.schemas.ProblemDetails).
export class ProblemDetails extends createZodDto(problemDetailsSchema) {}
