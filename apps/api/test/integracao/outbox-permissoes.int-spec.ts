import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import {
  SQLSTATE,
  conectar,
  criarPessoas,
  decisaoCompleta,
  inserirSolicitacao,
  type Pessoas,
} from './banco';
import { inserirEvento } from './outbox';

type Cargo = 'SOLICITANTE' | 'ANALISTA' | 'ADMIN';

interface Contexto {
  usuarioId: string;
  cargo: Cargo;
}

const VIOLACAO_FK = '23503';

/** Colunas que a API (app_runtime) pode ler: o status da integração, sem o conteúdo do evento. */
const COLUNAS_DE_STATUS =
  'id, tipo, agregado_id, status, tentativas, proxima_tentativa_em, criado_em, enviado_em';

/*
 * Permissões e RLS da outbox, conectando direto como cada papel no banco principal do container
 * (o mesmo script de init do compose cria app_worker). Pessoas e solicitações próprias deste
 * arquivo, criadas como app_owner. Transações do app_runtime são desfeitas no fim de cada uso.
 */
describe('ADR-005 / ADR-010: permissões e RLS de outbox_eventos', () => {
  let owner: Client;
  let runtime: Client;
  let worker: Client;
  let daAna: Pessoas;
  let doBruno: Pessoas;
  let solicitacaoDaAna: string;
  let solicitacaoDoBruno: string;
  let eventoDaAna: string;
  let eventoDoBruno: string;

  beforeAll(async () => {
    owner = await conectar('owner');
    runtime = await conectar('runtime');
    worker = await conectar('worker');
    daAna = await criarPessoas(owner);
    doBruno = await criarPessoas(owner);
    // APROVADA coerente com as CHECKs: analista definido e decisão completa
    const aprovada = (pessoas: Pessoas) => ({
      status: 'APROVADA',
      analista_id: pessoas.analistaId,
      ...decisaoCompleta(pessoas.analistaId),
    });
    solicitacaoDaAna = await inserirSolicitacao(owner, daAna, aprovada(daAna));
    solicitacaoDoBruno = await inserirSolicitacao(owner, doBruno, aprovada(doBruno));
    eventoDaAna = await inserirEvento(owner, solicitacaoDaAna);
    eventoDoBruno = await inserirEvento(owner, solicitacaoDoBruno);
  });

  afterAll(async () => {
    await worker?.end();
    await runtime?.end();
    await owner?.end();
  });

  const ana = (): Contexto => ({ usuarioId: daAna.solicitanteId, cargo: 'SOLICITANTE' });
  const analista = (): Contexto => ({ usuarioId: daAna.analistaId, cargo: 'ANALISTA' });
  const admin = (): Contexto => ({ usuarioId: daAna.outroAnalistaId, cargo: 'ADMIN' });

  /** Roda `fn` numa transação do app_runtime com o contexto informado (ou nenhum) e desfaz no fim. */
  async function comoRuntime<T>(contexto: Contexto | null, fn: () => Promise<T>): Promise<T> {
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

  /** Inserção como a API faria: sem RETURNING das colunas que ela não lê. */
  function inserirComoRuntime(agregadoId: string) {
    return runtime.query(
      `INSERT INTO outbox_eventos (id, tipo, agregado_id, payload, correlation_id)
       VALUES ($1, 'SolicitacaoAprovada', $2, '{"versao":1}'::jsonb, 'req-teste')`,
      [randomUUID(), agregadoId],
    );
  }

  describe('Estrutura', () => {
    it('ADR-005: app_worker faz login e não tem privilégio de administração nem bypass de RLS', async () => {
      const resultado = await owner.query(
        `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
           FROM pg_roles WHERE rolname = 'app_worker'`,
      );
      expect(resultado.rows).toEqual([
        {
          rolcanlogin: true,
          rolsuper: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolbypassrls: false,
        },
      ]);
    });

    it('ADR-005: RLS habilitada em outbox_eventos, sem FORCE', async () => {
      const resultado = await owner.query(
        `SELECT relrowsecurity AS habilitada, relforcerowsecurity AS forcada
           FROM pg_class WHERE oid = 'public.outbox_eventos'::regclass`,
      );
      expect(resultado.rows[0]).toEqual({ habilitada: true, forcada: false });
    });

    it('ADR-005: políticas da outbox (runtime: select, insert, update; worker: todas)', async () => {
      const resultado = await owner.query(
        `SELECT policyname AS nome, cmd AS comando, roles::text[] AS papeis
           FROM pg_policies WHERE schemaname = 'public' AND tablename = 'outbox_eventos'
          ORDER BY policyname`,
      );
      expect(resultado.rows).toEqual([
        { nome: 'outbox_insert', comando: 'INSERT', papeis: ['app_runtime'] },
        { nome: 'outbox_select', comando: 'SELECT', papeis: ['app_runtime'] },
        { nome: 'outbox_update', comando: 'UPDATE', papeis: ['app_runtime'] },
        { nome: 'outbox_worker', comando: 'ALL', papeis: ['app_worker'] },
      ]);
    });

    it('ADR-010: valores padrão de um evento novo (PENDENTE, 0 tentativas, pronto para envio)', async () => {
      const id = randomUUID();
      await owner.query(
        `INSERT INTO outbox_eventos (id, tipo, agregado_id, payload)
         VALUES ($1, 'SolicitacaoAprovada', $2, '{}'::jsonb)`,
        [id, solicitacaoDaAna],
      );
      const resultado = await owner.query(
        `SELECT status::text AS status, tentativas, ultimo_erro, enviado_em,
                proxima_tentativa_em <= clock_timestamp() AS pronto, criado_em IS NOT NULL AS criado
           FROM outbox_eventos WHERE id = $1`,
        [id],
      );
      expect(resultado.rows[0]).toEqual({
        status: 'PENDENTE',
        tentativas: 0,
        ultimo_erro: null,
        enviado_em: null,
        pronto: true,
        criado: true,
      });
      await owner.query('DELETE FROM outbox_eventos WHERE id = $1', [id]);
    });

    it.each([
      ['ENVIADO sem enviado_em', { status: 'ENVIADO' as const }],
      ['PENDENTE com enviado_em', { status: 'PENDENTE' as const, enviado_em: new Date() }],
      ['FALHOU com enviado_em', { status: 'FALHOU' as const, enviado_em: new Date() }],
    ])('ADR-010: CHECK enviado_em ⇔ ENVIADO recusa %s', async (_caso, campos) => {
      await expect(inserirEvento(owner, solicitacaoDaAna, campos)).rejects.toMatchObject({
        code: SQLSTATE.violacaoCheck,
      });
    });

    it('RN-14: coluna ultima_tentativa_em (timestamptz, aceita nulo, sem padrão)', async () => {
      const resultado = await owner.query(
        `SELECT data_type AS tipo, is_nullable AS nulo, column_default AS padrao
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'outbox_eventos'
            AND column_name = 'ultima_tentativa_em'`,
      );
      expect(resultado.rows).toEqual([
        { tipo: 'timestamp with time zone', nulo: 'YES', padrao: null },
      ]);
    });

    it('ADR-010: agregado_id precisa existir em solicitacoes (FK)', async () => {
      await expect(inserirEvento(owner, randomUUID())).rejects.toMatchObject({ code: VIOLACAO_FK });
    });

    it('ADR-010: índices de (status, proxima_tentativa_em) e (agregado_id, criado_em)', async () => {
      const resultado = await owner.query<{ definicao: string }>(
        `SELECT indexdef AS definicao FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'outbox_eventos'`,
      );
      const definicoes = resultado.rows.map((linha) => linha.definicao.replaceAll('"', ''));
      expect(definicoes).toEqual(
        expect.arrayContaining([
          expect.stringContaining('(status, proxima_tentativa_em)'),
          expect.stringContaining('(agregado_id, criado_em)'),
        ]),
      );
    });
  });

  describe('app_worker', () => {
    it.each(['solicitacoes', 'usuarios', 'sessoes', 'areas', 'solicitacao_historico'])(
      'ADR-005: app_worker não lê %s',
      async (tabela) => {
        await expect(worker.query(`SELECT 1 FROM ${tabela} LIMIT 1`)).rejects.toMatchObject({
          code: SQLSTATE.semPermissao,
        });
      },
    );

    it('ADR-005: app_worker lê a outbox inteira (com payload), sem contexto de usuário', async () => {
      const resultado = await worker.query<{ id: string; payload: unknown }>(
        'SELECT id, payload, ultimo_erro, correlation_id FROM outbox_eventos WHERE id = ANY($1)',
        [[eventoDaAna, eventoDoBruno]],
      );
      expect(resultado.rows.map((linha) => linha.id).sort()).toEqual(
        [eventoDaAna, eventoDoBruno].sort(),
      );
    });

    it('ADR-005: app_worker atualiza a outbox', async () => {
      const id = await inserirEvento(owner, solicitacaoDaAna);
      const resultado = await worker.query(
        `UPDATE outbox_eventos SET status = 'ENVIADO', enviado_em = now(), tentativas = 1
          WHERE id = $1`,
        [id],
      );
      expect(resultado.rowCount).toBe(1);
    });

    it.each([
      [
        'INSERT',
        (id: string) => `INSERT INTO outbox_eventos (id, tipo, agregado_id, payload)
          VALUES (gen_random_uuid(), 'SolicitacaoAprovada', '${id}', '{}'::jsonb)`,
      ],
      ['DELETE', (id: string) => `DELETE FROM outbox_eventos WHERE agregado_id = '${id}'`],
    ])('ADR-005: app_worker não faz %s na outbox', async (_comando, sql) => {
      await expect(worker.query(sql(solicitacaoDaAna))).rejects.toMatchObject({
        code: SQLSTATE.semPermissao,
      });
    });
  });

  describe('app_runtime: colunas', () => {
    // ultimo_erro saiu desta lista no PR 4C: agora o app_runtime lê (painel do admin)
    it.each(['payload', 'correlation_id', '*'])(
      'ADR-005: app_runtime não lê %s',
      async (coluna) => {
        await expect(
          comoRuntime(admin(), () => runtime.query(`SELECT ${coluna} FROM outbox_eventos`)),
        ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
      },
    );

    it('ADR-005: app_runtime lê as colunas de status', async () => {
      const linhas = await comoRuntime(
        admin(),
        async () =>
          (
            await runtime.query<{ id: string }>(
              `SELECT ${COLUNAS_DE_STATUS} FROM outbox_eventos WHERE id = $1`,
              [eventoDaAna],
            )
          ).rows,
      );
      expect(linhas).toHaveLength(1);
    });

    it('RN-14: app_runtime (ADMIN) lê ultimo_erro e ultima_tentativa_em', async () => {
      const quando = new Date('2026-10-04T12:00:00.000Z');
      await owner.query(
        `UPDATE outbox_eventos SET ultimo_erro = 'HTTP 503', ultima_tentativa_em = $2
          WHERE id = $1`,
        [eventoDaAna, quando],
      );
      const linhas = await comoRuntime(
        admin(),
        async () =>
          (
            await runtime.query<{ ultimo_erro: string; ultima_tentativa_em: Date }>(
              `SELECT ${COLUNAS_DE_STATUS}, ultimo_erro, ultima_tentativa_em
                 FROM outbox_eventos WHERE id = $1`,
              [eventoDaAna],
            )
          ).rows,
      );
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({ ultimo_erro: 'HTTP 503', ultima_tentativa_em: quando });
    });

    it.each([
      'payload',
      'ultimo_erro',
      'ultima_tentativa_em',
      'correlation_id',
      'enviado_em',
      'tipo',
    ])('ADR-005: app_runtime (ADMIN) não atualiza %s', async (coluna) => {
      const valor =
        coluna === 'payload'
          ? "'{}'::jsonb"
          : ['enviado_em', 'ultima_tentativa_em'].includes(coluna)
            ? 'now()'
            : "'x'";
      await expect(
        comoRuntime(admin(), () =>
          runtime.query(`UPDATE outbox_eventos SET ${coluna} = ${valor} WHERE id = $1`, [
            eventoDaAna,
          ]),
        ),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
    });

    it('ADR-005: app_runtime não apaga da outbox', async () => {
      await expect(
        comoRuntime(admin(), () =>
          runtime.query('DELETE FROM outbox_eventos WHERE id = $1', [eventoDaAna]),
        ),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
    });
  });

  describe('app_runtime: RLS', () => {
    async function idsVisiveis(contexto: Contexto | null): Promise<string[]> {
      return comoRuntime(contexto, async () => {
        const resultado = await runtime.query<{ id: string }>(
          'SELECT id FROM outbox_eventos WHERE id = ANY($1)',
          [[eventoDaAna, eventoDoBruno]],
        );
        return resultado.rows.map((linha) => linha.id).sort();
      });
    }

    it('ADR-005: sem contexto → nenhuma linha (fail-closed)', async () => {
      expect(await idsVisiveis(null)).toEqual([]);
    });

    it('ADR-005: com o contexto da Ana, a outbox da solicitação do Bruno não aparece; a dela sim', async () => {
      expect(await idsVisiveis(ana())).toEqual([eventoDaAna]);
    });

    it('ADR-005: analista e admin veem a outbox de todas as solicitações', async () => {
      const ambos = [eventoDaAna, eventoDoBruno].sort();
      expect(await idsVisiveis(analista())).toEqual(ambos);
      expect(await idsVisiveis(admin())).toEqual(ambos);
    });

    /** Ids visíveis lendo também as colunas liberadas no PR 4C. */
    async function idsComErro(contexto: Contexto | null): Promise<string[]> {
      return comoRuntime(contexto, async () => {
        const resultado = await runtime.query<{ id: string }>(
          `SELECT id, ultimo_erro, ultima_tentativa_em FROM outbox_eventos WHERE id = ANY($1)`,
          [[eventoDaAna, eventoDoBruno]],
        );
        return resultado.rows.map((linha) => linha.id).sort();
      });
    }

    it('RN-14: app_runtime lê ultimo_erro e ultima_tentativa_em com a RLS valendo: sem contexto → nenhuma linha', async () => {
      expect(await idsComErro(null)).toEqual([]);
    });

    it('RN-14: app_runtime lê ultimo_erro e ultima_tentativa_em com a RLS valendo: Admin vê todas, Ana só a dela', async () => {
      expect(await idsComErro(admin())).toEqual([eventoDaAna, eventoDoBruno].sort());
      expect(await idsComErro(ana())).toEqual([eventoDaAna]);
    });

    it('ADR-005: solicitante não insere na outbox (nem para a própria solicitação)', async () => {
      await expect(
        comoRuntime(ana(), () => inserirComoRuntime(solicitacaoDaAna)),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
    });

    it.each([
      ['ANALISTA', analista],
      ['ADMIN', admin],
    ])(
      'ADR-005: %s insere na outbox (sem RETURNING das colunas restritas)',
      async (_cargo, contexto) => {
        const resultado = await comoRuntime(contexto(), () =>
          inserirComoRuntime(solicitacaoDoBruno),
        );
        expect(resultado.rowCount).toBe(1);
      },
    );

    it('ADR-005: sem contexto, ninguém insere', async () => {
      await expect(
        comoRuntime(null, () => inserirComoRuntime(solicitacaoDaAna)),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
    });

    it.each([
      ['SOLICITANTE', ana],
      ['ANALISTA', analista],
    ])('ADR-005: %s não atualiza a outbox (0 linhas)', async (_cargo, contexto) => {
      const afetadas = await comoRuntime(
        contexto(),
        async () =>
          (
            await runtime.query(
              `UPDATE outbox_eventos SET status = 'PENDENTE', tentativas = 0,
                    proxima_tentativa_em = now() WHERE id = $1`,
              [eventoDaAna],
            )
          ).rowCount,
      );
      expect(afetadas).toBe(0);
    });

    it('ADR-005: só o ADMIN atualiza status, tentativas e proxima_tentativa_em (reprocessamento)', async () => {
      const afetadas = await comoRuntime(
        admin(),
        async () =>
          (
            await runtime.query(
              `UPDATE outbox_eventos SET status = 'PENDENTE', tentativas = 0,
                    proxima_tentativa_em = now() WHERE id = $1`,
              [eventoDoBruno],
            )
          ).rowCount,
      );
      expect(afetadas).toBe(1);
    });
  });
});
