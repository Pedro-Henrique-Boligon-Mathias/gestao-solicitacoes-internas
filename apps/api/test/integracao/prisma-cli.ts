import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { RAIZ_API } from './ambiente';

const BIN = path.join(RAIZ_API, 'node_modules', '.bin');

export interface ResultadoComando {
  status: number | null;
  saida: string;
}

/** Roda um binário do pacote da API (prisma, tsx) com a MIGRATION_DATABASE_URL informada. */
export function rodarBinario(
  binario: 'prisma' | 'tsx',
  argumentos: string[],
  ambiente: Record<string, string>,
): ResultadoComando {
  const resultado = spawnSync(path.join(BIN, binario), argumentos, {
    cwd: RAIZ_API,
    env: { ...process.env, ...ambiente },
    encoding: 'utf8',
  });
  return {
    status: resultado.status,
    saida: `${resultado.stdout ?? ''}${resultado.stderr ?? ''}${resultado.error?.message ?? ''}`,
  };
}

/** `prisma migrate deploy` como app_owner; falha alto se alguma migration não aplicar. */
export function aplicarMigrations(urlOwner: string): void {
  const resultado = rodarBinario('prisma', ['migrate', 'deploy'], {
    MIGRATION_DATABASE_URL: urlOwner,
  });
  if (resultado.status !== 0) {
    throw new Error(`prisma migrate deploy falhou:\n${resultado.saida}`);
  }
}
