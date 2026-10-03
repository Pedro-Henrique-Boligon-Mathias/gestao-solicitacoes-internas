import path from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import {
  BANCO_PRINCIPAL,
  IMAGEM_POSTGRES,
  RAIZ_REPOSITORIO,
  SENHA_OWNER,
  SENHA_RUNTIME,
  SENHA_SUPERUSUARIO,
  SENHA_WORKER,
  VARIAVEIS,
  urlBanco,
} from './ambiente';
import { aplicarMigrations } from './prisma-cli';

/**
 * Sobe um Postgres real, cria os papéis com o mesmo script do compose e aplica as migrations
 * como app_owner. Os testes conectam como app_runtime, salvo indicação.
 */
export default async function setupGlobal(): Promise<void> {
  const container = await new PostgreSqlContainer(IMAGEM_POSTGRES)
    .withDatabase(BANCO_PRINCIPAL)
    .withUsername('postgres')
    .withPassword(SENHA_SUPERUSUARIO)
    .withEnvironment({
      APP_OWNER_PASSWORD: SENHA_OWNER,
      APP_RUNTIME_PASSWORD: SENHA_RUNTIME,
      APP_WORKER_PASSWORD: SENHA_WORKER,
    })
    .withCopyFilesToContainer([
      {
        source: path.join(RAIZ_REPOSITORIO, 'infra', 'db', 'init', '01-papeis.sh'),
        target: '/docker-entrypoint-initdb.d/01-papeis.sh',
        mode: 0o755,
      },
    ])
    .start();

  (globalThis as { __containerPostgres__?: unknown }).__containerPostgres__ = container;

  process.env[VARIAVEIS.host] = container.getHost();
  process.env[VARIAVEIS.porta] = String(container.getPort());
  // Usadas pelo AppModule (ConfigModule) e pelo prisma.config.ts dentro dos testes.
  process.env.DATABASE_URL = urlBanco('runtime');
  process.env.MIGRATION_DATABASE_URL = urlBanco('owner');

  aplicarMigrations(urlBanco('owner'));
}
