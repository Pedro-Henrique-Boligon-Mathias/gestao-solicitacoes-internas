import type { Client } from 'pg';
import { SQLSTATE, conectar, criarPessoas, inserirSolicitacao, type Pessoas } from './banco';

describe('Histórico de solicitações', () => {
  let owner: Client;
  let runtime: Client;
  let pessoas: Pessoas;
  let solicitacaoId: string;

  beforeAll(async () => {
    owner = await conectar('owner');
    runtime = await conectar('runtime');
    pessoas = await criarPessoas(owner);
    solicitacaoId = await inserirSolicitacao(owner, pessoas);
  });

  afterAll(async () => {
    await runtime.end();
    await owner.end();
  });

  // app_owner: a política de INSERT da Fase 2 não pode mascarar a violação de CHECK.
  async function registrarEvento(tipo: string, comentario: string | null): Promise<string> {
    const resultado = await owner.query<{ id: string }>(
      `INSERT INTO solicitacao_historico (solicitacao_id, tipo, comentario, autor_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [solicitacaoId, tipo, comentario, pessoas.analistaId],
    );
    return resultado.rows[0]!.id;
  }

  describe('RN-06 / RN-16: comentário obrigatório em decisão e reabertura', () => {
    it.each(['APROVADA', 'REJEITADA', 'REABERTA'])(
      'RN-06 / RN-16: o histórico recusa %s sem comentário',
      async (tipo) => {
        await expect(registrarEvento(tipo, null)).rejects.toMatchObject({
          code: SQLSTATE.violacaoCheck,
        });
      },
    );

    it.each(['APROVADA', 'REJEITADA', 'REABERTA'])(
      'RN-06 / RN-16: o histórico aceita %s com comentário',
      async (tipo) => {
        await expect(
          registrarEvento(tipo, 'Justificativa registrada com o evento.'),
        ).resolves.toEqual(expect.any(String));
      },
    );

    it('RN-06 / RN-16: o histórico aceita EDITADA sem comentário', async () => {
      await expect(registrarEvento('EDITADA', null)).resolves.toEqual(expect.any(String));
    });
  });

  describe('RN-10: histórico imutável para app_runtime', () => {
    let eventoId: string;

    beforeAll(async () => {
      eventoId = await registrarEvento('CRIADA', null);
    });

    // Com RLS, o app_runtime só lê dentro de uma transação com contexto (aqui, de analista).
    it('RN-10: app_runtime lê o histórico', async () => {
      await runtime.query('BEGIN');
      try {
        await runtime.query(
          "SELECT set_config('app.usuario_id', $1, true), set_config('app.cargo', 'ANALISTA', true)",
          [pessoas.analistaId],
        );
        const resultado = await runtime.query(
          'SELECT id FROM solicitacao_historico WHERE id = $1',
          [eventoId],
        );
        expect(resultado.rowCount).toBe(1);
      } finally {
        await runtime.query('ROLLBACK');
      }
    });

    it('RN-10: UPDATE em solicitacao_historico dá erro de permissão para app_runtime', async () => {
      await expect(
        runtime.query("UPDATE solicitacao_historico SET comentario = 'alterado' WHERE id = $1", [
          eventoId,
        ]),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
    });

    it('RN-10: DELETE em solicitacao_historico dá erro de permissão para app_runtime', async () => {
      await expect(
        runtime.query('DELETE FROM solicitacao_historico WHERE id = $1', [eventoId]),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });

      const ainda = await owner.query('SELECT 1 FROM solicitacao_historico WHERE id = $1', [
        eventoId,
      ]);
      expect(ainda.rowCount).toBe(1);
    });
  });
});
