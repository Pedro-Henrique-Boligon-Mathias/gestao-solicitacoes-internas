import type { Client } from 'pg';
import { SQLSTATE, conectar, criarPessoas, inserirSolicitacao, type Pessoas } from './banco';

describe('Permissões do papel da API (app_runtime)', () => {
  let owner: Client;
  let runtime: Client;
  let pessoas: Pessoas;

  beforeAll(async () => {
    owner = await conectar('owner');
    runtime = await conectar('runtime');
    pessoas = await criarPessoas(owner);
  });

  afterAll(async () => {
    await runtime.end();
    await owner.end();
  });

  it('RN-09: DELETE em solicitacoes dá erro de permissão para app_runtime', async () => {
    const id = await inserirSolicitacao(owner, pessoas);

    await expect(
      runtime.query('DELETE FROM solicitacoes WHERE id = $1', [id]),
    ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });

    const ainda = await owner.query('SELECT 1 FROM solicitacoes WHERE id = $1', [id]);
    expect(ainda.rowCount).toBe(1);
  });

  it('ADR-005: app_runtime não lê _prisma_migrations', async () => {
    await expect(runtime.query('SELECT * FROM _prisma_migrations')).rejects.toMatchObject({
      code: SQLSTATE.semPermissao,
    });
  });

  it('ADR-005: app_runtime não cria tabela em public', async () => {
    await expect(
      runtime.query('CREATE TABLE public.tabela_intrusa (id int)'),
    ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
  });
});
