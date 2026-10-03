import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { SQLSTATE, conectar, criarPessoas, type Pessoas } from './banco';

describe('ADR-004: sessões (refresh token)', () => {
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

  async function criarSessao(refreshHash: string, familiaId = randomUUID()): Promise<string> {
    const resultado = await runtime.query<{ id: string }>(
      `INSERT INTO sessoes (usuario_id, familia_id, refresh_hash, expira_em, ip, user_agent)
       VALUES ($1, $2, $3, now() + interval '7 days', '127.0.0.1', 'jest')
       RETURNING id`,
      [pessoas.solicitanteId, familiaId, refreshHash],
    );
    return resultado.rows[0]!.id;
  }

  it('ADR-004: app_runtime cria, lê e atualiza uma sessão', async () => {
    const id = await criarSessao(`hash-${randomUUID()}`);

    const lida = await runtime.query('SELECT id FROM sessoes WHERE id = $1', [id]);
    expect(lida.rowCount).toBe(1);

    const atualizada = await runtime.query(
      `UPDATE sessoes SET usado_em = now(), revogada_em = now(), motivo_revogacao = 'LOGOUT'
        WHERE id = $1`,
      [id],
    );
    expect(atualizada.rowCount).toBe(1);
  });

  it('ADR-004: refresh_hash duplicado é recusado', async () => {
    const hash = `hash-${randomUUID()}`;
    await criarSessao(hash);
    await expect(criarSessao(hash)).rejects.toMatchObject({ code: SQLSTATE.violacaoUnica });
  });

  it('ADR-004: DELETE em sessoes dá erro de permissão para app_runtime', async () => {
    const id = await criarSessao(`hash-${randomUUID()}`);
    await expect(runtime.query('DELETE FROM sessoes WHERE id = $1', [id])).rejects.toMatchObject({
      code: SQLSTATE.semPermissao,
    });
  });
});
