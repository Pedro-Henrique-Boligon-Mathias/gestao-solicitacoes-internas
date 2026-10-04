import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  api,
  entrarComSeed,
  entrarComSolicitanteNovo,
  esperarProblema,
  listar,
  solicitacaoEm,
  type Sessao,
} from './api-solicitacoes';
import { conectar } from './banco';

/*
 * PR 4C: GET /solicitacoes?analista=<uuid>, além de `eu`. Banco próprio (migrations + seed): os
 * totais de Analista e Admin são comparados com contagens feitas direto no banco (app_owner).
 * Decisão do teste: um uuid válido de quem não é responsável por nada devolve lista vazia (200),
 * não 404 — é um filtro, como `area`.
 */
describe('RF-02 / RN-13: GET /solicitacoes?analista=<uuid>', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let carla: Sessao;
  let rafael: Sessao;
  let diego: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('lista_analista');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
    ({ carla, rafael, diego } = await entrarComSeed(app, ['carla', 'rafael', 'diego'] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  /** Solicitações não excluídas com esse analista responsável (app_owner, sem RLS). */
  async function totalDoAnalista(analistaId: string, status?: string): Promise<number> {
    const resultado = await owner.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM solicitacoes
        WHERE excluido_em IS NULL AND analista_id = $1
          AND ($2::text IS NULL OR status::text = $2)`,
      [analistaId, status ?? null],
    );
    return resultado.rows[0]!.total;
  }

  it.each([
    ['Analista (Carla) filtrando pelo Rafael', 'carla', 'rafael'],
    ['Admin (Diego) filtrando pela Carla', 'diego', 'carla'],
    ['Analista (Rafael) filtrando por si mesmo pelo id', 'rafael', 'rafael'],
  ] as const)(
    'RF-02: %s → só as que têm esse analista, com o total do banco',
    async (_caso, quem, alvo) => {
      const sessoes = { carla, rafael, diego };
      const analistaId = sessoes[alvo].id;

      const lista = await listar(app, sessoes[quem], `analista=${analistaId}&pageSize=100`);

      expect(lista.meta.total).toBe(await totalDoAnalista(analistaId));
      expect(lista.meta.total).toBeGreaterThan(0);
      expect(new Set(lista.data.map((item) => item.analista?.id))).toEqual(new Set([analistaId]));
    },
  );

  it('RF-02: analista=<id> combinado com status', async () => {
    const lista = await listar(app, diego, `analista=${carla.id}&status=EM_ANALISE&pageSize=100`);

    expect(lista.meta.total).toBe(await totalDoAnalista(carla.id, 'EM_ANALISE'));
    for (const item of lista.data) {
      expect(item).toMatchObject({ status: 'EM_ANALISE', analista: { id: carla.id } });
    }
  });

  it('RF-02: analista=<id> de quem não é responsável por nada → 200 com lista vazia', async () => {
    const lista = await listar(app, diego, `analista=${randomUUID()}`);
    expect(lista).toMatchObject({ data: [], meta: { total: 0, totalPages: 0 } });
  });

  it('RN-13: para o solicitante, analista=<id> é ignorado — vê todas as próprias, e só elas', async () => {
    const pessoa = await entrarComSolicitanteNovo(app, owner);
    const daCarla = await solicitacaoEm(app, 'EM_ANALISE', { dono: pessoa, analista: carla });
    const doRafael = await solicitacaoEm(app, 'APROVADA', { dono: pessoa, analista: rafael });
    const naFila = await solicitacaoEm(app, 'ABERTA', { dono: pessoa, analista: carla });

    const lista = await listar(app, pessoa, `analista=${carla.id}&pageSize=100`);

    expect(lista.data.map((item) => item.id).sort()).toEqual(
      [daCarla.id, doRafael.id, naFila.id].sort(),
    );
    expect(lista.meta.total).toBe(3);
  });

  it('RN-13: o solicitante filtrando pelo id de um analista não vê solicitações de outras pessoas', async () => {
    const pessoa = await entrarComSolicitanteNovo(app, owner);

    const lista = await listar(app, pessoa, `analista=${carla.id}`);

    expect(lista).toMatchObject({ data: [], meta: { total: 0 } });
  });

  it.each(['analista=abc', 'analista=123', `analista=${randomUUID().slice(0, 30)}`])(
    'RF-02: %s (nem "eu" nem UUID) → 400 DADOS_INVALIDOS',
    async (query) => {
      esperarProblema(await api(app, diego).get(`/solicitacoes?${query}`), 400, 'DADOS_INVALIDOS');
    },
  );

  it('RF-02: analista=eu continua valendo (só as do usuário atual)', async () => {
    const lista = await listar(app, carla, 'analista=eu&pageSize=100');
    expect(lista.meta.total).toBe(await totalDoAnalista(carla.id));
    expect(lista.data.every((item) => item.analista?.id === carla.id)).toBe(true);
  });
});
