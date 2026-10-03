import type { Client } from 'pg';
import { conectar, criarPessoas, inserirSolicitacao, type Pessoas } from './banco';

// Expressão de busca da nota do modelo de dados (P-12).
const CONDICAO_BUSCA =
  "app.sem_acento(lower(titulo || ' ' || descricao)) LIKE '%' || app.sem_acento(lower($1)) || '%'";

describe('P-12: busca sem acento', () => {
  let owner: Client;
  let runtime: Client;
  let pessoas: Pessoas;
  let solicitacaoId: string;

  beforeAll(async () => {
    owner = await conectar('owner');
    runtime = await conectar('runtime');
    pessoas = await criarPessoas(owner);
    solicitacaoId = await inserirSolicitacao(owner, pessoas, {
      titulo: 'Solicitação de acesso',
      descricao: 'Liberar o acesso de leitura ao relatório de conciliação.',
    });
  });

  afterAll(async () => {
    await runtime.end();
    await owner.end();
  });

  it("P-12: app.sem_acento(lower('Solicitação')) devolve 'solicitacao' para app_runtime", async () => {
    const resultado = await runtime.query<{ valor: string }>(
      "SELECT app.sem_acento(lower('Solicitação')) AS valor",
    );
    expect(resultado.rows[0]?.valor).toBe('solicitacao');
  });

  it('P-12: app.sem_acento é IMMUTABLE, PARALLEL SAFE e STRICT', async () => {
    const resultado = await owner.query<{
      volatilidade: string;
      paralelismo: string;
      estrita: boolean;
    }>(
      `SELECT p.provolatile AS volatilidade, p.proparallel AS paralelismo, p.proisstrict AS estrita
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'app' AND p.proname = 'sem_acento'`,
    );
    expect(resultado.rows).toEqual([{ volatilidade: 'i', paralelismo: 's', estrita: true }]);
  });

  it.each(['solicitacao', 'SOLICITAÇÃO', 'conciliacao'])(
    'P-12: buscar "%s" encontra o título "Solicitação de acesso"',
    async (termo) => {
      const resultado = await owner.query<{ id: string }>(
        `SELECT id FROM solicitacoes WHERE ${CONDICAO_BUSCA}`,
        [termo],
      );
      expect(resultado.rows.map((linha) => linha.id)).toContain(solicitacaoId);
    },
  );

  it('P-12: buscar um termo ausente não encontra a solicitação', async () => {
    const resultado = await owner.query<{ id: string }>(
      `SELECT id FROM solicitacoes WHERE ${CONDICAO_BUSCA}`,
      ['impressora'],
    );
    expect(resultado.rows.map((linha) => linha.id)).not.toContain(solicitacaoId);
  });

  it('P-12: com enable_seqscan = off, o plano da busca usa idx_solicitacoes_busca', async () => {
    await owner.query('BEGIN');
    try {
      await owner.query('SET LOCAL enable_seqscan = off');
      const plano = await owner.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT id FROM solicitacoes
          WHERE app.sem_acento(lower(titulo || ' ' || descricao))
                LIKE '%' || app.sem_acento(lower('solicitacao')) || '%'`,
      );
      const texto = plano.rows.map((linha) => linha['QUERY PLAN']).join('\n');
      expect(texto).toContain('idx_solicitacoes_busca');
    } finally {
      await owner.query('ROLLBACK');
    }
  });
});
