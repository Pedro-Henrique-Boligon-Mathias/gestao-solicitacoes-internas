import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Fora do Docker, as variáveis vêm do .env da raiz do repositório.
config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations e seed rodam com o papel dono do schema (app_owner), nunca com o da API.
    url: process.env.MIGRATION_DATABASE_URL ?? '',
  },
});
