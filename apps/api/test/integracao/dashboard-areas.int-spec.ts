import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  DIA,
  ISO_UTC,
  api,
  definirData,
  entrarComSeed,
  entrarComSolicitanteNovo,
  resumo,
  solicitacaoEm,
  type Resumo,
  type Sessao,
} from './api-solicitacoes';
import { conectar } from './banco';

/*
 * Banco próprio deste arquivo (migrations + seed). O escopo PROPRIAS é conferido com um
 * solicitante criado pelo teste (números exatos). O escopo GERAL inclui as 40 do seed: ele é
 * comparado com contagens feitas direto no banco (app_owner) no mesmo instante.
 */
describe('RF-04: GET /dashboard/resumo e GET /areas', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let ana: Sessao;
  let carla: Sessao;
  let diego: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('dashboard');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
    ({ ana, carla, diego } = await entrarComSeed(app, ['ana', 'carla', 'diego'] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  /** O resumo esperado calculado no banco, para um solicitante ou para todos. */
  async function esperadoNoBanco(
    solicitanteId?: string,
  ): Promise<Omit<Resumo, 'escopo' | 'geradoEm'>> {
    const filtro = solicitanteId ? 'AND solicitante_id = $1' : '';
    const parametros = solicitanteId ? [solicitanteId] : [];
    const grupos = await owner.query<{ status: string; prioridade: string; total: number }>(
      `SELECT status::text AS status, prioridade::text AS prioridade, count(*)::int AS total
         FROM solicitacoes WHERE excluido_em IS NULL ${filtro}
        GROUP BY status, prioridade`,
      parametros,
    );
    const abertas = await owner.query<{ mais_antiga: Date | null; fila_alta: number }>(
      `SELECT min(data_solicitacao) AS mais_antiga,
              (count(*) FILTER (WHERE prioridade = 'ALTA'))::int AS fila_alta
         FROM solicitacoes WHERE excluido_em IS NULL AND status = 'ABERTA' ${filtro}`,
      parametros,
    );
    const porStatus = { ABERTA: 0, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0 };
    const porPrioridade = { BAIXA: 0, MEDIA: 0, ALTA: 0 };
    let total = 0;
    for (const grupo of grupos.rows) {
      porStatus[grupo.status as keyof typeof porStatus] += grupo.total;
      porPrioridade[grupo.prioridade as keyof typeof porPrioridade] += grupo.total;
      total += grupo.total;
    }
    return {
      total,
      porStatus,
      porPrioridade,
      filaAlta: abertas.rows[0]!.fila_alta,
      aberturaMaisAntiga: abertas.rows[0]!.mais_antiga?.toISOString() ?? null,
    };
  }

  it('RF-04: solicitante sem nenhuma solicitação → PROPRIAS com tudo zerado e aberturaMaisAntiga null', async () => {
    const pessoa = await entrarComSolicitanteNovo(app, owner);
    const antes = Date.now();
    const corpo = await resumo(app, pessoa);
    expect(corpo).toEqual({
      escopo: 'PROPRIAS',
      total: 0,
      porStatus: { ABERTA: 0, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0 },
      porPrioridade: { BAIXA: 0, MEDIA: 0, ALTA: 0 },
      filaAlta: 0,
      aberturaMaisAntiga: null,
      // PR 4C: sem o parâmetro, o período é tudo
      periodo: { valor: 'tudo', inicio: null, fim: expect.stringMatching(ISO_UTC) },
      geradoEm: expect.stringMatching(ISO_UTC),
    });
    expect(Date.parse(corpo.geradoEm)).toBeGreaterThanOrEqual(antes - 1000);
  });

  it('RF-04: PROPRIAS conta só as do solicitante, com zeros, filaAlta e aberturaMaisAntiga', async () => {
    const pessoa = await entrarComSolicitanteNovo(app, owner);
    const agora = Date.now();
    const plano = [
      ['ABERTA', 'ALTA', 3],
      ['ABERTA', 'ALTA', 1],
      ['ABERTA', 'BAIXA', 5],
      ['EM_ANALISE', 'MEDIA', 10],
    ] as const;
    const datas: string[] = [];
    for (const [status, prioridade, dias] of plano) {
      const criada = await solicitacaoEm(
        app,
        status,
        { dono: pessoa, analista: carla },
        { prioridade },
      );
      datas.push(await definirData(owner, criada.id, new Date(agora - dias * DIA)));
    }

    expect(await resumo(app, pessoa)).toEqual({
      escopo: 'PROPRIAS',
      total: 4,
      porStatus: { ABERTA: 3, EM_ANALISE: 1, APROVADA: 0, REJEITADA: 0 },
      porPrioridade: { BAIXA: 1, MEDIA: 1, ALTA: 2 },
      filaAlta: 2,
      // A EM_ANALISE é mais antiga, mas só ABERTA conta
      aberturaMaisAntiga: datas[2],
      // PR 4C: sem o parâmetro, o período é tudo
      periodo: { valor: 'tudo', inicio: null, fim: expect.stringMatching(ISO_UTC) },
      geradoEm: expect.stringMatching(ISO_UTC),
    });
  });

  it('RF-04: Ana (seed) tem escopo PROPRIAS com os números só dela', async () => {
    const corpo = await resumo(app, ana);
    expect(corpo).toMatchObject({ escopo: 'PROPRIAS', ...(await esperadoNoBanco(ana.id)) });
  });

  it.each(['carla', 'diego'] as const)(
    'RF-04: %s tem escopo GERAL com os números de todas as solicitações',
    async (quem) => {
      const sessao = quem === 'carla' ? carla : diego;
      const corpo = await resumo(app, sessao);
      expect(corpo).toEqual({
        escopo: 'GERAL',
        ...(await esperadoNoBanco()),
        // PR 4C: sem o parâmetro, o período é tudo
        periodo: { valor: 'tudo', inicio: null, fim: expect.stringMatching(ISO_UTC) },
        geradoEm: expect.stringMatching(ISO_UTC),
      });
      expect(corpo.total).toBeGreaterThan(0);
    },
  );

  it('RF-04: o total é a soma de porStatus e de porPrioridade', async () => {
    const corpo = await resumo(app, carla);
    const soma = (valores: Record<string, number>) =>
      Object.values(valores).reduce((total, valor) => total + valor, 0);
    expect(soma(corpo.porStatus)).toBe(corpo.total);
    expect(soma(corpo.porPrioridade)).toBe(corpo.total);
  });

  it('sem token → 401', async () => {
    expect((await api(app).get('/dashboard/resumo')).status).toBe(401);
  });

  describe('GET /areas', () => {
    it('devolve as 6 áreas ativas em ordem de nome, só com id e nome', async () => {
      await owner.query(
        "INSERT INTO areas (nome, ativo) VALUES ('Área desativada', false) ON CONFLICT DO NOTHING",
      );
      const resposta = await api(app, ana).get('/areas').expect(200);
      expect(resposta.body).toEqual(
        ['Comercial', 'Financeiro', 'Jurídico', 'Operações', 'Recursos Humanos', 'Tecnologia'].map(
          (nome) => ({ id: expect.any(String), nome }),
        ),
      );
    });

    it('ADR-012: é pública — sem token → 200 com as mesmas áreas', async () => {
      const comToken = await api(app, ana).get('/areas').expect(200);
      const semToken = await api(app).get('/areas').expect(200);
      expect(semToken.body).toEqual(comToken.body);
    });

    it('ADR-012: com token inválido também responde 200 (a rota ignora a autenticação)', async () => {
      const resposta = await api(app, { ...ana, token: 'token-invalido' }).get('/areas');
      expect(resposta.status).toBe(200);
    });
  });
});
