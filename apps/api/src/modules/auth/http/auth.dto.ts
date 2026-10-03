import { createZodDto } from '../../../common/zod/create-zod-dto';
import { z } from 'zod';
import { EXEMPLO } from '../../../openapi/exemplos';

export const loginSchema = z.object({
  email: z
    .string()
    .max(320)
    .trim()
    .toLowerCase()
    .pipe(z.email('Informe um e-mail válido.').max(254))
    .describe('Aceita maiúsculas e espaços nas pontas (normalizado antes da busca)')
    .meta({ example: 'ana.souza@demo.test' }),
  senha: z.string().min(1, 'Informe a senha.').max(256).meta({ example: 'Demo@2026' }),
});

export const refreshSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Informe o refresh token.')
    .max(512)
    .meta({ example: 'q9fV3kz8Lw1mT0rB6yHc2pNs5uXa7dGe4jQiOtRlUvW' }),
});

export const usuarioAtualSchema = z.object({
  id: z.uuid().meta({ example: EXEMPLO.ana.id }),
  nome: z.string().meta({ example: EXEMPLO.ana.nome }),
  email: z.string().meta({ example: 'ana.souza@demo.test' }),
  cargo: z.enum(['SOLICITANTE', 'ANALISTA', 'ADMIN']).meta({ example: 'SOLICITANTE' }),
  area: z.object({ id: z.uuid(), nome: z.string() }).meta({ example: EXEMPLO.financeiro }),
});

export const respostaSessaoSchema = z.object({
  accessToken: z
    .string()
    .describe('JWT (HS256) para o header Authorization: Bearer')
    .meta({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIuLi4ifQ.assinatura' }),
  accessExpiraEm: z.iso
    .datetime()
    .describe('Fim da validade do access token (UTC)')
    .meta({ example: '2026-10-03T13:15:00.000Z' }),
  refreshToken: z
    .string()
    .describe('Token opaco, de uso único, para POST /auth/refresh')
    .meta({ example: 'q9fV3kz8Lw1mT0rB6yHc2pNs5uXa7dGe4jQiOtRlUvW' }),
  refreshExpiraEm: z.iso
    .datetime()
    .describe('Fim da validade do refresh token (UTC)')
    .meta({ example: '2026-10-10T13:00:00.000Z' }),
  usuario: usuarioAtualSchema.meta({
    example: {
      id: EXEMPLO.ana.id,
      nome: EXEMPLO.ana.nome,
      email: 'ana.souza@demo.test',
      cargo: 'SOLICITANTE',
      area: EXEMPLO.financeiro,
    },
  }),
});

export class LoginDto extends createZodDto(loginSchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class UsuarioAtualDto extends createZodDto(usuarioAtualSchema) {}
export class RespostaSessaoDto extends createZodDto(respostaSessaoSchema) {}
