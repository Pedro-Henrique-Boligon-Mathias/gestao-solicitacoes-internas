import type { Client } from 'pg';
import { criarBancoComSeed } from './api-http';
import { EMAILS_SEED } from './api-solicitacoes';
import { SQLSTATE, conectar } from './banco';

interface Contexto {
  usuarioId: string;
  cargo: 'SOLICITANTE' | 'ANALISTA' | 'ADMIN';
}

/*
 * RLS conectando direto como app_runtime, com o contexto gravado por set_config(..., true), como a
 * API faz. Cada teste roda numa transação desfeita no fim. Banco próprio com o seed: os usuários
 * são os do seed e as contagens são comparadas com o que o app_owner (que ignora a RLS) enxerga.
 */
describe('ADR-005 / RN-13: RLS em solicitacoes e solicitacao_historico', () => {
  let owner: Client;
  let runtime: Client;
  const ids = {} as Record<'ana' | 'bruno' | 'carla' | 'diego', string>;
  let areaAna: string;
  let daAna: string;
  let doBruno: string;

  async function inserirComoOwner(solicitanteId: string, areaId: string): Promise<string> {
    const resultado = await owner.query<{ id: string }>(
      `INSERT INTO solicitacoes (titulo, descricao, prioridade, solicitante_id, area_id)
       VALUES ('Acesso ao sistema de cobrança', 'Preciso de acesso de leitura ao módulo.', 'MEDIA', $1, $2)
       RETURNING id`,
      [solicitanteId, areaId],
    );
    const id = resultado.rows[0]!.id;
    await owner.query(
      `INSERT INTO solicitacao_historico (solicitacao_id, tipo, status_novo, autor_id)
       VALUES ($1, 'CRIADA', 'ABERTA', $2)`,
      [id, solicitanteId],
    );
    return id;
  }

  beforeAll(async () => {
    const banco = await criarBancoComSeed('rls');
    owner = await conectar('owner', banco);
    runtime = await conectar('runtime', banco);

    for (const apelido of ['ana', 'bruno', 'carla', 'diego'] as const) {
      const resultado = await owner.query<{ id: string; area_id: string }>(
        'SELECT id, area_id FROM usuarios WHERE email = $1',
        [EMAILS_SEED[apelido]],
      );
      ids[apelido] = resultado.rows[0]!.id;
      if (apelido === 'ana') areaAna = resultado.rows[0]!.area_id;
    }
    daAna = await inserirComoOwner(ids.ana, areaAna);
    doBruno = await inserirComoOwner(ids.bruno, areaAna);
  });

  afterAll(async () => {
    await runtime?.end();
    await owner?.end();
  });

  /** Roda `fn` numa transação do app_runtime com o contexto informado (ou nenhum) e desfaz no fim. */
  async function emTransacao<T>(contexto: Contexto | null, fn: () => Promise<T>): Promise<T> {
    await runtime.query('BEGIN');
    try {
      if (contexto) {
        await runtime.query(
          "SELECT set_config('app.usuario_id', $1, true), set_config('app.cargo', $2, true)",
          [contexto.usuarioId, contexto.cargo],
        );
      }
      return await fn();
    } finally {
      await runtime.query('ROLLBACK');
    }
  }

  const comoAna = (): Contexto => ({ usuarioId: ids.ana, cargo: 'SOLICITANTE' });
  const comoCarla = (): Contexto => ({ usuarioId: ids.carla, cargo: 'ANALISTA' });

  async function contarNoOwner(sql: string, parametros: unknown[] = []): Promise<number> {
    const resultado = await owner.query<{ total: number }>(sql, parametros);
    return resultado.rows[0]!.total;
  }

  async function contarNoRuntime(sql: string, parametros: unknown[] = []): Promise<number> {
    const resultado = await runtime.query<{ total: number }>(sql, parametros);
    return resultado.rows[0]!.total;
  }

  describe('Estrutura', () => {
    it.each(['solicitacoes', 'solicitacao_historico'])(
      'ADR-005: RLS habilitada em %s, sem FORCE (o seed roda como dono)',
      async (tabela) => {
        const resultado = await owner.query<{ habilitada: boolean; forcada: boolean }>(
          `SELECT relrowsecurity AS habilitada, relforcerowsecurity AS forcada
             FROM pg_class WHERE oid = $1::regclass`,
          [`public.${tabela}`],
        );
        expect(resultado.rows[0]).toEqual({ habilitada: true, forcada: false });
      },
    );

    it('ADR-005: as políticas da nota de permissões existem, sem política de DELETE', async () => {
      const resultado = await owner.query<{ tabela: string; nome: string; comando: string }>(
        `SELECT tablename AS tabela, policyname AS nome, cmd AS comando
           FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`,
      );
      expect(resultado.rows).toEqual([
        { tabela: 'solicitacao_historico', nome: 'historico_insert', comando: 'INSERT' },
        { tabela: 'solicitacao_historico', nome: 'historico_select', comando: 'SELECT' },
        { tabela: 'solicitacoes', nome: 'solicitacoes_insert', comando: 'INSERT' },
        { tabela: 'solicitacoes', nome: 'solicitacoes_select', comando: 'SELECT' },
        { tabela: 'solicitacoes', nome: 'solicitacoes_update', comando: 'UPDATE' },
      ]);
    });
  });

  describe('Leitura', () => {
    it('ADR-005: sem contexto → 0 linhas em solicitacoes e no histórico (fail-closed)', async () => {
      expect(
        await contarNoOwner('SELECT count(*)::int AS total FROM solicitacoes'),
      ).toBeGreaterThan(0);

      await emTransacao(null, async () => {
        expect(await contarNoRuntime('SELECT count(*)::int AS total FROM solicitacoes')).toBe(0);
        expect(
          await contarNoRuntime('SELECT count(*)::int AS total FROM solicitacao_historico'),
        ).toBe(0);
      });
      // Fora de transação também
      expect(await contarNoRuntime('SELECT count(*)::int AS total FROM solicitacoes')).toBe(0);
    });

    it('RN-13: com o contexto da Ana, SELECT sem WHERE traz só as dela', async () => {
      const esperado = await contarNoOwner(
        'SELECT count(*)::int AS total FROM solicitacoes WHERE solicitante_id = $1',
        [ids.ana],
      );
      expect(esperado).toBeGreaterThan(0);

      await emTransacao(comoAna(), async () => {
        const resultado = await runtime.query<{ solicitante_id: string }>(
          'SELECT solicitante_id FROM solicitacoes',
        );
        expect(resultado.rowCount).toBe(esperado);
        expect(new Set(resultado.rows.map((linha) => linha.solicitante_id))).toEqual(
          new Set([ids.ana]),
        );
      });
    });

    it.each([
      ['ANALISTA', 'carla'],
      ['ADMIN', 'diego'],
    ] as const)('RN-13: com o contexto de %s, SELECT sem WHERE traz todas', async (cargo, quem) => {
      const total = await contarNoOwner('SELECT count(*)::int AS total FROM solicitacoes');
      await emTransacao({ usuarioId: ids[quem], cargo }, async () => {
        expect(await contarNoRuntime('SELECT count(*)::int AS total FROM solicitacoes')).toBe(
          total,
        );
      });
    });

    it('ADR-005: o histórico herda a visibilidade (Ana não vê os eventos da do Bruno)', async () => {
      await emTransacao(comoAna(), async () => {
        expect(
          await contarNoRuntime(
            'SELECT count(*)::int AS total FROM solicitacao_historico WHERE solicitacao_id = $1',
            [doBruno],
          ),
        ).toBe(0);
        expect(
          await contarNoRuntime(
            'SELECT count(*)::int AS total FROM solicitacao_historico WHERE solicitacao_id = $1',
            [daAna],
          ),
        ).toBe(1);
      });

      await emTransacao(comoCarla(), async () => {
        expect(
          await contarNoRuntime(
            'SELECT count(*)::int AS total FROM solicitacao_historico WHERE solicitacao_id = $1',
            [doBruno],
          ),
        ).toBe(1);
      });
    });

    it('RF-04: a consulta agrupada do dashboard, sem filtro, conta só as da Ana no contexto dela', async () => {
      const consulta = `SELECT status, prioridade, count(*)::int AS total
                          FROM solicitacoes WHERE excluido_em IS NULL
                         GROUP BY status, prioridade`;
      const soma = (linhas: { total: number }[]) => linhas.reduce((t, l) => t + l.total, 0);

      const daAnaNoBanco = await contarNoOwner(
        'SELECT count(*)::int AS total FROM solicitacoes WHERE excluido_em IS NULL AND solicitante_id = $1',
        [ids.ana],
      );
      const todasNoBanco = await contarNoOwner(
        'SELECT count(*)::int AS total FROM solicitacoes WHERE excluido_em IS NULL',
      );
      expect(todasNoBanco).toBeGreaterThan(daAnaNoBanco);

      await emTransacao(comoAna(), async () => {
        expect(soma((await runtime.query<{ total: number }>(consulta)).rows)).toBe(daAnaNoBanco);
      });
      await emTransacao(comoCarla(), async () => {
        expect(soma((await runtime.query<{ total: number }>(consulta)).rows)).toBe(todasNoBanco);
      });
    });
  });

  describe('Escrita', () => {
    it('ADR-005: solicitante não consegue UPDATE status = APROVADA na própria', async () => {
      await emTransacao(comoAna(), async () => {
        // Decisão completa e analista definido: só a política pode recusar
        await expect(
          runtime.query(
            `UPDATE solicitacoes
                SET status = 'APROVADA', analista_id = $2, decisao_comentario = 'Aprovada por mim mesma.',
                    decidido_em = now(), decidido_por_id = $2
              WHERE id = $1`,
            [daAna, ids.carla],
          ),
        ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
      });
      const linha = await owner.query<{ status: string }>(
        'SELECT status::text AS status FROM solicitacoes WHERE id = $1',
        [daAna],
      );
      expect(linha.rows[0]!.status).toBe('ABERTA');
    });

    it('RN-13: Ana não altera a do Bruno (0 linhas afetadas)', async () => {
      await emTransacao(comoAna(), async () => {
        const resultado = await runtime.query(
          "UPDATE solicitacoes SET titulo = 'Título alterado pela Ana' WHERE id = $1",
          [doBruno],
        );
        expect(resultado.rowCount).toBe(0);
      });
    });

    it('ADR-005: solicitante não faz INSERT com solicitante_id de outra pessoa', async () => {
      await emTransacao(comoAna(), async () => {
        await expect(
          runtime.query(
            `INSERT INTO solicitacoes (titulo, descricao, prioridade, solicitante_id, area_id)
             VALUES ('Pedido em nome do Bruno', 'Tentativa de abrir em nome de outra pessoa.', 'MEDIA', $1, $2)`,
            [ids.bruno, areaAna],
          ),
        ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
      });
    });

    it('ADR-005: solicitante não faz INSERT com status diferente de ABERTA', async () => {
      await emTransacao(comoAna(), async () => {
        await expect(
          runtime.query(
            `INSERT INTO solicitacoes (titulo, descricao, prioridade, status, analista_id, solicitante_id, area_id)
             VALUES ('Pedido já em análise', 'Tentativa de nascer fora de ABERTA.', 'MEDIA', 'EM_ANALISE', $2, $1, $3)`,
            [ids.ana, ids.carla, areaAna],
          ),
        ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
      });
    });

    it('ADR-005: solicitante faz INSERT da própria ABERTA', async () => {
      await emTransacao(comoAna(), async () => {
        const resultado = await runtime.query(
          `INSERT INTO solicitacoes (titulo, descricao, prioridade, solicitante_id, area_id)
           VALUES ('Pedido da própria Ana', 'Abertura normal pela própria solicitante.', 'MEDIA', $1, $2)
           RETURNING id`,
          [ids.ana, areaAna],
        );
        expect(resultado.rowCount).toBe(1);
      });
    });

    it('ADR-005: INSERT no histórico com autor_id de outra pessoa é recusado', async () => {
      await emTransacao(comoAna(), async () => {
        await expect(
          runtime.query(
            `INSERT INTO solicitacao_historico (solicitacao_id, tipo, autor_id) VALUES ($1, 'EDITADA', $2)`,
            [daAna, ids.bruno],
          ),
        ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
      });
      await emTransacao(comoAna(), async () => {
        const resultado = await runtime.query(
          `INSERT INTO solicitacao_historico (solicitacao_id, tipo, autor_id) VALUES ($1, 'EDITADA', $2)`,
          [daAna, ids.ana],
        );
        expect(resultado.rowCount).toBe(1);
      });
    });

    it('RN-12: soft delete (UPDATE ... SET excluido_em) com RETURNING funciona para o dono', async () => {
      await emTransacao(comoAna(), async () => {
        const resultado = await runtime.query<{ id: string; excluido_em: Date }>(
          `UPDATE solicitacoes SET excluido_em = now(), versao = versao + 1
            WHERE id = $1 AND excluido_em IS NULL
           RETURNING id, excluido_em`,
          [daAna],
        );
        expect(resultado.rows).toEqual([{ id: daAna, excluido_em: expect.any(Date) }]);
      });
    });

    it('RN-10: UPDATE e DELETE no histórico continuam proibidos, mesmo com contexto de ADMIN', async () => {
      for (const sql of [
        "UPDATE solicitacao_historico SET comentario = 'alterado' WHERE solicitacao_id = $1",
        'DELETE FROM solicitacao_historico WHERE solicitacao_id = $1',
      ]) {
        await emTransacao({ usuarioId: ids.diego, cargo: 'ADMIN' }, async () => {
          await expect(runtime.query(sql, [daAna])).rejects.toMatchObject({
            code: SQLSTATE.semPermissao,
          });
        });
      }
    });
  });
});
