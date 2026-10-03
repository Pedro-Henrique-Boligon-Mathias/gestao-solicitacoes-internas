import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { hash } from '@node-rs/argon2';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { urlBanco } from './ambiente';
import { criarBancoMigrado } from './banco';
import { rodarBinario } from './prisma-cli';

/** Senha dos usuários do seed nos testes (equivale ao SEED_PASSWORD). */
export const SENHA_SEED = 'Senha-de-teste@2026';

/** Usuária do seed usada nos fluxos de login (nota de usuários e permissões). */
export const CARLA = {
  nome: 'Carla Mendes',
  email: 'carla.mendes@demo.test',
  cargo: 'ANALISTA',
  area: 'Tecnologia',
} as const;

/** Cria um banco só para o arquivo de teste, aplica as migrations e roda o seed. */
export async function criarBancoComSeed(prefixo: string): Promise<string> {
  const nome = `${prefixo}_${randomUUID().replaceAll('-', '')}`;
  await criarBancoMigrado(nome);
  const resultado = rodarBinario('tsx', ['prisma/seed.ts'], {
    MIGRATION_DATABASE_URL: urlBanco('owner', nome),
    SEED_PASSWORD: SENHA_SEED,
  });
  if (resultado.status !== 0) {
    throw new Error(`O seed falhou:\n${resultado.saida}`);
  }
  return nome;
}

/**
 * Sobe a API completa (AppModule + configurarApp) conectada como app_runtime no banco informado.
 * As variáveis entram antes do import, porque o ConfigModule valida o ambiente ao carregar o módulo.
 */
export async function subirApi(
  banco: string,
  variaveis: Record<string, string> = {},
): Promise<INestApplication<App>> {
  process.env.DATABASE_URL = urlBanco('runtime', banco);
  Object.assign(process.env, variaveis);

  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../../src/app.module.js');
  const { configurarApp } = await import('../../src/configurar-app.js');

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication<INestApplication<App>>();
  configurarApp(app, { origemWeb: 'http://localhost:3000' });
  await app.init();
  return app;
}

let ultimoIp = 0;

/**
 * Um IP de rede interna diferente a cada chamada, enviado em X-Forwarded-For. O rate limit não usa
 * o IP (login é por e-mail, refresh é por token): trocar o IP serve para provar isso e para
 * conferir o IP gravado na sessão, nunca para isolar um teste do outro.
 */
export function ipNovo(): string {
  ultimoIp += 1;
  return `10.20.${Math.floor(ultimoIp / 250)}.${(ultimoIp % 250) + 1}`;
}

export function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

export interface LinhaSessao {
  id: string;
  usuario_id: string;
  familia_id: string;
  refresh_hash: string;
  expira_em: Date;
  usado_em: Date | null;
  revogada_em: Date | null;
  motivo_revogacao: string | null;
  ip: string | null;
  user_agent: string | null;
}

/** Sessão gravada para um refresh token (procurada pelo SHA-256 dele). */
export async function sessaoDoRefresh(owner: Client, refreshToken: string): Promise<LinhaSessao> {
  const resultado = await owner.query<LinhaSessao>(
    'SELECT * FROM sessoes WHERE refresh_hash = $1',
    [sha256Hex(refreshToken)],
  );
  if (resultado.rowCount !== 1) {
    throw new Error('Nenhuma sessão gravada com o hash desse refresh token.');
  }
  return resultado.rows[0]!;
}

export async function sessoesDaFamilia(owner: Client, familiaId: string): Promise<LinhaSessao[]> {
  const resultado = await owner.query<LinhaSessao>(
    'SELECT * FROM sessoes WHERE familia_id = $1 ORDER BY criado_em',
    [familiaId],
  );
  return resultado.rows;
}

/** Usuário próprio do teste (e-mail único), com senha real em argon2id. */
export async function criarUsuarioComSenha(
  owner: Client,
  senha: string,
): Promise<{ id: string; email: string }> {
  const email = `pessoa.${randomUUID().slice(0, 8)}@teste.local`;
  const area = await owner.query<{ id: string }>("SELECT id FROM areas WHERE nome = 'Financeiro'");
  const resultado = await owner.query<{ id: string }>(
    `INSERT INTO usuarios (nome, email, senha_hash, cargo, area_id)
     VALUES ('Pessoa de teste', $1, $2, 'SOLICITANTE', $3) RETURNING id`,
    [email, await hash(senha), area.rows[0]!.id],
  );
  return { id: resultado.rows[0]!.id, email };
}
