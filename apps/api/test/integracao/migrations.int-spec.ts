import { randomUUID } from 'node:crypto';
import { urlBanco } from './ambiente';
import { criarBancoMigrado } from './banco';
import { rodarBinario } from './prisma-cli';

describe('ADR-003: migrations e schema.prisma', () => {
  it('ADR-003: prisma migrate diff entre as migrations aplicadas e o schema.prisma não encontra diferença', async () => {
    const banco = `drift_${randomUUID().replaceAll('-', '')}`;
    await criarBancoMigrado(banco);

    const resultado = rodarBinario(
      'prisma',
      [
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      { MIGRATION_DATABASE_URL: urlBanco('owner', banco) },
    );

    // --exit-code: 0 = sem diferença, 2 = há diferença, 1 = erro
    expect({ status: resultado.status, saida: resultado.saida }).toEqual({
      status: 0,
      saida: expect.any(String),
    });
  });
});
