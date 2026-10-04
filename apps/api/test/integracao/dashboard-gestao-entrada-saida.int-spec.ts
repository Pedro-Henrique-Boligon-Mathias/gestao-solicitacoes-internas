import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import { EMAILS_SEED, entrarComSeed, type Sessao } from './api-solicitacoes';
import { conectar } from './banco';
import {
  HORA,
  areasDoSeed,
  diasAtras,
  formatarCodigo,
  gestao,
  inserirComHistorico,
  limparSolicitacoes,
  momentoDeHoje,
} from './dashboard-gestao';

/*
 * PR 4C · Entrada e saída (decisões 1 e 4 e revisão de 04/10/2026): entraram = eventos CRIADA e
 * REABERTA; saíram = APROVADA e REJEITADA, contados no histórico por data do evento. Banco próprio
 * com o seed; antes de cada teste as solicitações do seed são apagadas e o cenário abaixo é gravado
 * com datas controladas (dN = agora menos N dias):
 *
 *   A  Financeiro  ALTA   CRIADA d10, análise d9,5, APROVADA d8 (Carla), REABERTA d2 (Diego) → ABERTA
 *   B  Tecnologia  MEDIA  CRIADA d3, análise d2,5, REJEITADA d1 (Carla)                     → REJEITADA
 *   C  Comercial   BAIXA  CRIADA d5, análise d4,5, APROVADA d1 (Rafael)                     → APROVADA
 *   D  Financeiro  ALTA   CRIADA hoje                                                         → ABERTA
 *   E  Comercial   MEDIA  CRIADA d20                                                          → ABERTA
 *   H  Tecnologia  BAIXA  CRIADA d45, análise d44 (Rafael)                                   → EM_ANALISE
 */
describe('RF-04: GET /dashboard/gestao · entrada e saída', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let diego: Sessao;
  let ids: { ana: string; carla: string; rafael: string; diego: string };
  let areas: Record<string, string>;
  let cenario: { E: { id: string; codigo: number; data: Date } };

  beforeAll(async () => {
    const banco = await criarBancoComSeed('gestao_es');
    owner = await conectar('owner', banco);
    app = await subirApi(banco, { OUTBOX_MAX_TENTATIVAS: '5' });
    ({ diego } = await entrarComSeed(app, ['diego'] as const));
    const linhas = await owner.query<{ email: string; id: string }>(
      'SELECT email, id FROM usuarios WHERE email = ANY($1)',
      [[EMAILS_SEED.ana, EMAILS_SEED.carla, EMAILS_SEED.rafael, EMAILS_SEED.diego]],
    );
    const porEmail = new Map(linhas.rows.map((linha) => [linha.email, linha.id]));
    ids = {
      ana: porEmail.get(EMAILS_SEED.ana)!,
      carla: porEmail.get(EMAILS_SEED.carla)!,
      rafael: porEmail.get(EMAILS_SEED.rafael)!,
      diego: porEmail.get(EMAILS_SEED.diego)!,
    };
    areas = await areasDoSeed(owner);
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  beforeEach(async () => {
    await limparSolicitacoes(owner);
    const agora = new Date();
    const d = (dias: number) => diasAtras(dias, agora);
    const base = { solicitanteId: ids.ana };
    await inserirComHistorico(owner, {
      ...base,
      areaId: areas.Financeiro!,
      prioridade: 'ALTA',
      status: 'ABERTA',
      analistaId: ids.carla,
      eventos: [
        { tipo: 'CRIADA', em: d(10) },
        { tipo: 'ANALISE_INICIADA', em: d(9.5) },
        { tipo: 'APROVADA', em: d(8) },
        { tipo: 'REABERTA', em: d(2), autorId: ids.diego },
      ],
    });
    await inserirComHistorico(owner, {
      ...base,
      areaId: areas.Tecnologia!,
      prioridade: 'MEDIA',
      status: 'REJEITADA',
      analistaId: ids.carla,
      decisorId: ids.carla,
      eventos: [
        { tipo: 'CRIADA', em: d(3) },
        { tipo: 'ANALISE_INICIADA', em: d(2.5) },
        { tipo: 'REJEITADA', em: d(1) },
      ],
    });
    await inserirComHistorico(owner, {
      ...base,
      areaId: areas.Comercial!,
      prioridade: 'BAIXA',
      status: 'APROVADA',
      analistaId: ids.rafael,
      decisorId: ids.rafael,
      eventos: [
        { tipo: 'CRIADA', em: d(5) },
        { tipo: 'ANALISE_INICIADA', em: d(4.5) },
        { tipo: 'APROVADA', em: d(1) },
      ],
    });
    await inserirComHistorico(owner, {
      ...base,
      areaId: areas.Financeiro!,
      prioridade: 'ALTA',
      status: 'ABERTA',
      eventos: [{ tipo: 'CRIADA', em: momentoDeHoje(agora) }],
    });
    const E = await inserirComHistorico(owner, {
      ...base,
      areaId: areas.Comercial!,
      prioridade: 'MEDIA',
      status: 'ABERTA',
      eventos: [{ tipo: 'CRIADA', em: d(20) }],
    });
    cenario = { E: { ...E, data: d(20) } };
    await inserirComHistorico(owner, {
      ...base,
      areaId: areas.Tecnologia!,
      prioridade: 'BAIXA',
      status: 'EM_ANALISE',
      analistaId: ids.rafael,
      eventos: [
        { tipo: 'CRIADA', em: d(45) },
        { tipo: 'ANALISE_INICIADA', em: d(44) },
      ],
    });
  });

  const PENDENTES = { BAIXA: 1, MEDIA: 1, ALTA: 2 };

  it('RF-04: 7d conta CRIADA e REABERTA como entrada e APROVADA e REJEITADA como saída', async () => {
    const { entradaSaida } = await gestao(app, diego, '7d');
    expect(entradaSaida).toMatchObject({
      entraram: 4,
      sairam: 2,
      aprovadas: 1,
      rejeitadas: 1,
      saldo: 2,
      prioridadeEntraram: { BAIXA: 1, MEDIA: 1, ALTA: 2 },
      pendentesPorPrioridade: PENDENTES,
    });
  });

  it('RF-04: 7d · período anterior é a janela de 7 dias logo antes, com tempo médio próprio', async () => {
    const { entradaSaida } = await gestao(app, diego, '7d');
    expect(entradaSaida.anterior).toEqual({
      entraram: 1,
      sairam: 1,
      tempoMedioDecisaoDias: expect.any(Number),
    });
    expect(entradaSaida.anterior!.tempoMedioDecisaoDias).toBeCloseTo(2, 1);
  });

  it('RF-04: 7d · tempo médio até a decisão = média de (decisão − dataSolicitacao) em dias', async () => {
    const { entradaSaida } = await gestao(app, diego, '7d');
    // B: 3 − 1 = 2 dias; C: 5 − 1 = 4 dias
    expect(entradaSaida.tempoMedioDecisaoDias).toBeCloseTo(3, 1);
  });

  it('RF-04: 30d · a decisão desfeita por reabertura continua contando como saída (decisão 4)', async () => {
    const { entradaSaida } = await gestao(app, diego, '30d');
    expect(entradaSaida).toMatchObject({
      entraram: 6,
      sairam: 3,
      aprovadas: 2,
      rejeitadas: 1,
      saldo: 3,
      anterior: { entraram: 1, sairam: 0, tempoMedioDecisaoDias: null },
    });
    // A: 10 − 8 = 2; B: 2; C: 4 → 8/3
    expect(entradaSaida.tempoMedioDecisaoDias).toBeCloseTo(8 / 3, 1);
  });

  it('RF-04: tudo · sem período anterior e saldo igual aos pendentes', async () => {
    const { entradaSaida } = await gestao(app, diego, 'tudo');
    expect(entradaSaida).toMatchObject({
      entraram: 7,
      sairam: 3,
      aprovadas: 2,
      rejeitadas: 1,
      saldo: 4,
      anterior: null,
      prioridadeEntraram: { BAIXA: 2, MEDIA: 2, ALTA: 3 },
      pendentesPorPrioridade: PENDENTES,
    });
    const pendentes = Object.values(entradaSaida.pendentesPorPrioridade).reduce((a, b) => a + b);
    expect(entradaSaida.saldo).toBe(pendentes);
  });

  it('RF-04: hoje · só o que entrou hoje, sem anterior, sem série e com pendentes atuais', async () => {
    const { periodo, entradaSaida } = await gestao(app, diego, 'hoje');
    expect(periodo.granularidade).toBeNull();
    expect(entradaSaida).toMatchObject({
      entraram: 1,
      sairam: 0,
      aprovadas: 0,
      rejeitadas: 0,
      saldo: 1,
      anterior: null,
      tempoMedioDecisaoDias: null,
      prioridadeEntraram: { BAIXA: 0, MEDIA: 0, ALTA: 1 },
      pendentesPorPrioridade: PENDENTES,
      serie: [],
    });
  });

  it.each(['hoje', '7d', 'tudo'] as const)(
    'RF-04: maisAntigaNaFila é a ABERTA mais antiga (estado atual, ignora periodo=%s)',
    async (periodo) => {
      const { entradaSaida } = await gestao(app, diego, periodo);
      expect(entradaSaida.maisAntigaNaFila).toEqual({
        id: cenario.E.id,
        codigo: formatarCodigo(cenario.E.codigo),
        area: { id: areas.Comercial, nome: 'Comercial' },
        desde: cenario.E.data.toISOString(),
      });
    },
  );

  it('RF-04: maisAntigaNaFila null e tempo médio null sem fila e sem decisões', async () => {
    await limparSolicitacoes(owner);
    const { entradaSaida } = await gestao(app, diego, '30d');
    expect(entradaSaida).toMatchObject({
      entraram: 0,
      sairam: 0,
      saldo: 0,
      tempoMedioDecisaoDias: null,
      maisAntigaNaFila: null,
      prioridadeEntraram: { BAIXA: 0, MEDIA: 0, ALTA: 0 },
      pendentesPorPrioridade: { BAIXA: 0, MEDIA: 0, ALTA: 0 },
      anterior: { entraram: 0, sairam: 0, tempoMedioDecisaoDias: null },
    });
  });

  it('RN-12: eventos de excluída não contam em entraram, saíram nem por analista', async () => {
    const antes = { tudo: await gestao(app, diego, 'tudo'), d7: await gestao(app, diego, '7d') };
    const agora = new Date();
    const base = { solicitanteId: ids.ana, areaId: areas.Financeiro!, prioridade: 'ALTA' as const };
    // Decidida por Carla na janela e depois excluída
    await inserirComHistorico(owner, {
      ...base,
      status: 'APROVADA',
      analistaId: ids.carla,
      decisorId: ids.carla,
      excluidaEm: new Date(agora.getTime() - HORA),
      eventos: [
        { tipo: 'CRIADA', em: diasAtras(2, agora) },
        { tipo: 'ANALISE_INICIADA', em: diasAtras(1.8, agora) },
        { tipo: 'APROVADA', em: diasAtras(1.5, agora) },
      ],
    });
    // Reaberta na janela e excluída; e uma ABERTA antiga excluída (seria a mais antiga da fila)
    await inserirComHistorico(owner, {
      ...base,
      status: 'ABERTA',
      analistaId: ids.rafael,
      excluidaEm: new Date(agora.getTime() - HORA),
      eventos: [
        { tipo: 'CRIADA', em: diasAtras(6, agora) },
        { tipo: 'ANALISE_INICIADA', em: diasAtras(5.5, agora) },
        { tipo: 'REJEITADA', em: diasAtras(5, agora) },
        { tipo: 'REABERTA', em: diasAtras(4, agora), autorId: ids.diego },
      ],
    });
    await inserirComHistorico(owner, {
      ...base,
      status: 'ABERTA',
      excluidaEm: diasAtras(39, agora),
      eventos: [{ tipo: 'CRIADA', em: diasAtras(40, agora) }],
    });

    for (const [periodo, anterior] of [
      ['tudo', antes.tudo],
      ['7d', antes.d7],
    ] as const) {
      const depois = await gestao(app, diego, periodo);
      expect({ ...depois.entradaSaida, serie: null }).toEqual({
        ...anterior.entradaSaida,
        serie: null,
      });
      expect(depois.entradaSaida.serie.map(({ entraram, sairam }) => [entraram, sairam])).toEqual(
        anterior.entradaSaida.serie.map(({ entraram, sairam }) => [entraram, sairam]),
      );
      expect(depois.porAnalista).toEqual(anterior.porAnalista);
    }
  });
});
