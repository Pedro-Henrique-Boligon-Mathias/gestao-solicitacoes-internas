import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .max(320)
    .trim()
    .toLowerCase()
    .pipe(z.email('Informe um e-mail válido.').max(254))
    .describe('Aceita maiúsculas e espaços nas pontas (normalizado antes da busca)'),
  senha: z.string().min(1, 'Informe a senha.').max(256),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Informe o refresh token.').max(512),
});

export const usuarioAtualSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.string(),
  cargo: z.enum(['SOLICITANTE', 'ANALISTA', 'ADMIN']),
  area: z.object({ id: z.uuid(), nome: z.string() }),
});

export const respostaSessaoSchema = z.object({
  accessToken: z.string().describe('JWT (HS256) para o header Authorization: Bearer'),
  accessExpiraEm: z.iso.datetime().describe('Fim da validade do access token (UTC)'),
  refreshToken: z.string().describe('Token opaco, de uso único, para POST /auth/refresh'),
  refreshExpiraEm: z.iso.datetime().describe('Fim da validade do refresh token (UTC)'),
  usuario: usuarioAtualSchema,
});

export class LoginDto extends createZodDto(loginSchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class UsuarioAtualDto extends createZodDto(usuarioAtualSchema) {}
export class RespostaSessaoDto extends createZodDto(respostaSessaoSchema) {}
