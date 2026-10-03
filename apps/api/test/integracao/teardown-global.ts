import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export default async function teardownGlobal(): Promise<void> {
  const container = (globalThis as { __containerPostgres__?: StartedPostgreSqlContainer })
    .__containerPostgres__;
  await container?.stop();
}
