import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import { DIA, EMAILS_SEED, entrarComSeed, type Sessao } from './api-solicitacoes';
import { conectar } from './banco';
import {
  HORA,
  areasDoSeed,
  diaDaSemanaSP,
  diasAtras,
  gestao,
  inicioDoMesSP,
  inserirComHistorico,
  limparSolicitacoes,
  meiaNoiteSP,
  proximoMesSP,
  segundaSP,
  type Gestao,
} from './dashboard-gestao';

/*
 * PR 4C · série da Entrada e saída: hoje sem série; 7d por dia; 30d por semana; tudo por semana,
 * ou por mês quando o intervalo passa de 16 semanas. Semana começa na segunda, tudo no fuso
 * America/Sao_Paulo, baldes vazios com zero. Banco próprio com o seed; cada teste apaga as
 * solicitações e grava só os eventos que precisa.
 */
describe('RF-04: GET /dashboard/gestao · série por período', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let diego: Sessao;
  let anaId: string;
  let carlaId: string;
  let areaId: string;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('gestao_serie');
    owner = await conectar('owner', banco);
    app = await subirApi(banco, { OUTBOX_MAX_TENTATIVAS: '5' });
    ({ diego } = await entrarComSeed(app, ['diego'] as const));
    const linhas = await owner.query<{ email: string; id: string }>(
      'SELECT email, id FROM usuarios WHERE email = ANY($1)',
      [[EMAILS_SEED.ana, EMAILS_SEED.carla]],
    );
    const porEmail = new Map(linhas.rows.map((linha) => [linha.email, linha.id]));
    anaId = porEmail.get(EMAILS_SEED.ana)!;
    carlaId = porEmail.get(EMAILS_SEED.carla)!;
    areaId = (await areasDoSeed(owner)).Financeiro!;
  });

  beforeEach(async () => {
    await limparSolicitacoes(owner);
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  /** Uma solicitação criada em `criadaEm` e, se `aprovadaEm` vier, aprovada por Carla nessa data. */
  async function evento(criadaEm: Date, aprovadaEm?: Date): Promise<void> {
    await inserirComHistorico(owner, {
      solicitanteId: anaId,
      areaId,
      status: aprovadaEm ? 'APROVADA' : 'ABERTA',
      analistaId: carlaId,
      decisorId: carlaId,
      eventos: [
        { tipo: 'CRIADA', em: criadaEm },
        ...(aprovadaEm
          ? [
              { tipo: 'ANALISE_INICIADA' as const, em: criadaEm },
              { tipo: 'APROVADA' as const, em: aprovadaEm },
            ]
          : []),
      ],
    });
  }

  /** Mapa início do balde (ms) → [entraram, saíram]. */
  function baldes(corpo: Gestao): Map<number, [number, number]> {
    return new Map(
      corpo.entradaSaida.serie.map((b) => [Date.parse(b.inicio), [b.entraram, b.sairam]]),
    );
  }

  /** Inícios esperados: de `primeiro` até `ultimo`, inclusive, avançando com `proximo`. */
  function inicios(primeiro: Date, ultimo: Date, proximo: (data: Date) => Date): number[] {
    const lista: number[] = [];
    for (let atual = primeiro; atual.getTime() <= ultimo.getTime(); atual = proximo(atual)) {
      lista.push(atual.getTime());
    }
    return lista;
  }

  const maisUmDia = (data: Date) => new Date(data.getTime() + DIA);
  const maisUmaSemana = (data: Date) => new Date(data.getTime() + 7 * DIA);

  it('RF-04: hoje não tem série (granularidade null e serie vazia)', async () => {
    await evento(new Date(meiaNoiteSP(new Date()).getTime() + 1000));
    const corpo = await gestao(app, diego, 'hoje');
    expect(corpo.periodo.granularidade).toBeNull();
    expect(corpo.entradaSaida.serie).toEqual([]);
  });

  it('RF-04: 7d é por dia · 8 baldes da meia-noite (São Paulo) do início até hoje', async () => {
    const corpo = await gestao(app, diego, '7d');
    const fim = new Date(corpo.periodo.fim);
    expect(corpo.periodo.granularidade).toBe('dia');
    const esperados = inicios(meiaNoiteSP(diasAtras(7, fim)), meiaNoiteSP(fim), maisUmDia);
    expect(esperados).toHaveLength(8);
    expect(corpo.entradaSaida.serie.map((b) => Date.parse(b.inicio))).toEqual(esperados);
  });

  it('RF-04: baldes vazios voltam com zero e cada evento cai no dia certo (fuso São Paulo)', async () => {
    const agora = new Date();
    const criada = diasAtras(3, agora);
    const aprovada = diasAtras(2, agora);
    await evento(criada, aprovada);
    await evento(diasAtras(3, agora));
    await evento(diasAtras(10, agora)); // fora da janela
    const corpo = await gestao(app, diego, '7d');
    const mapa = baldes(corpo);
    expect(mapa.get(meiaNoiteSP(criada).getTime())).toEqual([2, 0]);
    expect(mapa.get(meiaNoiteSP(aprovada).getTime())).toEqual([0, 1]);
    const outros = [...mapa.entries()].filter(
      ([inicio]) =>
        inicio !== meiaNoiteSP(criada).getTime() && inicio !== meiaNoiteSP(aprovada).getTime(),
    );
    expect(outros).toHaveLength(6);
    for (const [, valores] of outros) expect(valores).toEqual([0, 0]);
    expect(corpo.entradaSaida).toMatchObject({ entraram: 2, sairam: 1 });
  });

  it('RF-04: 30d é por semana · baldes de segunda a segunda cobrindo a janela', async () => {
    const corpo = await gestao(app, diego, '30d');
    const fim = new Date(corpo.periodo.fim);
    expect(corpo.periodo.granularidade).toBe('semana');
    const esperados = inicios(segundaSP(diasAtras(30, fim)), segundaSP(fim), maisUmaSemana);
    const recebidos = corpo.entradaSaida.serie.map((b) => Date.parse(b.inicio));
    expect(recebidos).toEqual(esperados);
    for (const inicio of recebidos) {
      expect(diaDaSemanaSP(new Date(inicio))).toBe(1);
      expect(meiaNoiteSP(new Date(inicio)).getTime()).toBe(inicio);
    }
  });

  it('RF-04: semana começa na segunda · domingo 23h30 e segunda 00h30 caem em baldes diferentes', async () => {
    const segundaPassada = new Date(segundaSP(new Date()).getTime() - 7 * DIA);
    const domingo = new Date(segundaPassada.getTime() - HORA / 2);
    const segunda = new Date(segundaPassada.getTime() + HORA / 2);
    await evento(domingo);
    await evento(segunda);
    await evento(new Date(segundaPassada.getTime() + 3 * DIA));
    const mapa = baldes(await gestao(app, diego, '30d'));
    expect(mapa.get(segundaPassada.getTime() - 7 * DIA)).toEqual([1, 0]);
    expect(mapa.get(segundaPassada.getTime())).toEqual([2, 0]);
  });

  it('RF-04: tudo é por semana quando o intervalo tem até 16 semanas', async () => {
    const agora = new Date();
    const primeiro = diasAtras(100, agora);
    await evento(primeiro, diasAtras(99, agora));
    await evento(diasAtras(1, agora));
    const corpo = await gestao(app, diego, 'tudo');
    const fim = new Date(corpo.periodo.fim);
    expect(corpo.periodo.granularidade).toBe('semana');
    const esperados = inicios(segundaSP(primeiro), segundaSP(fim), maisUmaSemana);
    expect(corpo.entradaSaida.serie.map((b) => Date.parse(b.inicio))).toEqual(esperados);
    const mapa = baldes(corpo);
    expect(mapa.get(segundaSP(primeiro).getTime())).toEqual([1, 1]);
    const soma = corpo.entradaSaida.serie.reduce((total, b) => total + b.entraram, 0);
    expect(soma).toBe(2);
  });

  it('RF-04: tudo vira mês quando o intervalo passa de 16 semanas (meses de São Paulo)', async () => {
    const agora = new Date();
    const primeiro = diasAtras(200, agora);
    await evento(primeiro);
    await evento(diasAtras(30, agora), diasAtras(29, agora));
    const corpo = await gestao(app, diego, 'tudo');
    const fim = new Date(corpo.periodo.fim);
    expect(corpo.periodo.granularidade).toBe('mes');
    const esperados = inicios(inicioDoMesSP(primeiro), inicioDoMesSP(fim), proximoMesSP);
    expect(corpo.entradaSaida.serie.map((b) => Date.parse(b.inicio))).toEqual(esperados);
    const mapa = baldes(corpo);
    expect(mapa.get(inicioDoMesSP(primeiro).getTime())).toEqual([1, 0]);
    const serie = corpo.entradaSaida.serie;
    expect(serie.reduce((total, b) => total + b.entraram, 0)).toBe(2);
    expect(serie.reduce((total, b) => total + b.sairam, 0)).toBe(1);
  });
});
