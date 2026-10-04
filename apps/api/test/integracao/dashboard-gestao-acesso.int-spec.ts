import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import { DIA, ISO_UTC, api, entrarComSeed, esperarProblema, type Sessao } from './api-solicitacoes';
import { conectar } from './banco';
import { gestao, meiaNoiteSP, pedirGestao, type Periodo } from './dashboard-gestao';

/*
 * PR 4C · GET /dashboard/gestao: permissões, validação do período e forma da resposta.
 * Banco próprio com o seed; as contagens exatas ficam nos outros arquivos dashboard-gestao-*.
 */
describe('RF-04: GET /dashboard/gestao · acesso e contrato', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let ana: Sessao;
  let carla: Sessao;
  let diego: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('gestao_acesso');
    owner = await conectar('owner', banco);
    app = await subirApi(banco, { OUTBOX_MAX_TENTATIVAS: '5' });
    ({ ana, carla, diego } = await entrarComSeed(app, ['ana', 'carla', 'diego'] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  it('ADR-001: sem token → 401 NAO_AUTENTICADO', async () => {
    esperarProblema(await api(app).get('/dashboard/gestao'), 401, 'NAO_AUTENTICADO');
  });

  it.each([
    ['Analista', () => carla],
    ['Solicitante', () => ana],
  ])('RF-04: gestao só para Admin · %s recebe 403 ACESSO_NEGADO', async (_cargo, sessao) => {
    esperarProblema(await pedirGestao(app, sessao()), 403, 'ACESSO_NEGADO');
    esperarProblema(await pedirGestao(app, sessao(), '7d'), 403, 'ACESSO_NEGADO');
  });

  it.each(['90d', 'TUDO', 'ontem', ''])(
    'RF-04: periodo inválido (%j) → 400 DADOS_INVALIDOS',
    async (periodo) => {
      esperarProblema(await pedirGestao(app, diego, periodo), 400, 'DADOS_INVALIDOS');
    },
  );

  it('RF-04: Admin recebe 200 com todos os blocos, nesta forma', async () => {
    const antes = Date.now();
    const corpo = await gestao(app, diego, '7d');
    expect(Object.keys(corpo).sort()).toEqual(
      [
        'entradaSaida',
        'geradoEm',
        'integracoesComFalha',
        'periodo',
        'porAnalista',
        'porArea',
      ].sort(),
    );
    expect(Object.keys(corpo.entradaSaida).sort()).toEqual(
      [
        'anterior',
        'aprovadas',
        'entraram',
        'maisAntigaNaFila',
        'pendentesPorPrioridade',
        'prioridadeEntraram',
        'rejeitadas',
        'saldo',
        'sairam',
        'serie',
        'tempoMedioDecisaoDias',
      ].sort(),
    );
    expect(corpo.geradoEm).toMatch(ISO_UTC);
    expect(Date.parse(corpo.geradoEm)).toBeGreaterThanOrEqual(antes - 1000);
    expect(Array.isArray(corpo.porArea)).toBe(true);
    expect(Array.isArray(corpo.porAnalista)).toBe(true);
    expect(Array.isArray(corpo.integracoesComFalha)).toBe(true);
  });

  it('RF-04: sem periodo vale tudo (padrão)', async () => {
    const corpo = await gestao(app, diego);
    expect(corpo.periodo.valor).toBe('tudo');
    expect(corpo.entradaSaida.anterior).toBeNull();
  });

  /** Janela esperada calculada no teste; tolera a diferença entre o relógio do teste e o da API. */
  it.each([
    ['7d', 7, 'dia'],
    ['30d', 30, 'semana'],
  ] as const)(
    'RF-04: periodo=%s → janela móvel de %i dias até agora, por %s',
    async (valor, dias, granularidade) => {
      const antes = Date.now();
      const corpo = await gestao(app, diego, valor);
      const depois = Date.now();
      expect(corpo.periodo).toEqual({
        valor,
        inicio: expect.stringMatching(ISO_UTC),
        fim: expect.stringMatching(ISO_UTC),
        granularidade,
      });
      const fim = Date.parse(corpo.periodo.fim);
      expect(fim).toBeGreaterThanOrEqual(antes - 1000);
      expect(fim).toBeLessThanOrEqual(depois + 1000);
      expect(fim - Date.parse(corpo.periodo.inicio!)).toBe(dias * DIA);
    },
  );

  it('RF-04: periodo=hoje → da meia-noite de São Paulo até agora, sem granularidade', async () => {
    const corpo = await gestao(app, diego, 'hoje');
    const fim = new Date(corpo.periodo.fim);
    expect(corpo.periodo).toMatchObject({ valor: 'hoje', granularidade: null });
    expect(corpo.periodo.inicio).toMatch(ISO_UTC);
    expect(Date.parse(corpo.periodo.inicio!)).toBe(meiaNoiteSP(fim).getTime());
  });

  it('RF-04: periodo=tudo → inicio null (sem limite inferior) e fim agora', async () => {
    const corpo = await gestao(app, diego, 'tudo' satisfies Periodo);
    expect(corpo.periodo.valor).toBe('tudo');
    expect(corpo.periodo.fim).toMatch(ISO_UTC);
    expect(corpo.periodo.inicio).toBeNull();
    expect(['semana', 'mes']).toContain(corpo.periodo.granularidade);
  });
});
