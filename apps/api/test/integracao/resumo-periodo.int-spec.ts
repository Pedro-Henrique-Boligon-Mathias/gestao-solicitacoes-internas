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
  esperarProblema,
  solicitacaoEm,
  type Prioridade,
  type Resumo,
  type Sessao,
  type Status,
} from './api-solicitacoes';
import { conectar } from './banco';

type Periodo = 'hoje' | '7d' | '30d' | 'tudo';

/** Resumo do PR 4C: o de sempre mais o período aplicado. */
type ResumoComPeriodo = Resumo & {
  periodo: { valor: Periodo; inicio: string | null; fim: string };
};

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;

/**
 * Meia-noite de hoje em America/Sao_Paulo, como instante UTC. O fuso não tem horário de verão
 * desde 2019, então o deslocamento é sempre -03:00.
 */
function meiaNoiteEmSaoPaulo(agora: Date): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
  return new Date(`${partes}T00:00:00-03:00`);
}

/*
 * RF-04 (PR 4C): GET /dashboard/resumo?periodo=hoje|7d|30d|tudo. Banco próprio (migrations +
 * seed). Os números exatos são conferidos com um solicitante criado pelo teste (PROPRIAS), com
 * `data_solicitacao` ajustada direto no banco (app_owner); o escopo GERAL é comparado com
 * contagens feitas no banco usando os limites que a própria API devolveu.
 *
 * Decisões documentadas aqui:
 * - `periodo` vem sempre na resposta; sem o parâmetro, é igual a `periodo=tudo`;
 * - em `tudo`, `periodo.inicio` é null (não há limite inferior) e `fim` é o instante da consulta;
 * - limites: `inicio` inclusivo, `fim` = agora; `7d`/`30d` têm exatamente 7 ou 30 dias.
 */
describe('RF-04: GET /dashboard/resumo?periodo=', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let carla: Sessao;
  let diego: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('resumo_periodo');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
    ({ carla, diego } = await entrarComSeed(app, ['carla', 'diego'] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  async function resumoNo(sessao: Sessao, periodo?: Periodo): Promise<ResumoComPeriodo> {
    const url = periodo ? `/dashboard/resumo?periodo=${periodo}` : '/dashboard/resumo';
    const resposta = await api(app, sessao).get(url).expect(200);
    return resposta.body as ResumoComPeriodo;
  }

  describe('limites do período (servidor, fuso America/Sao_Paulo)', () => {
    it('RF-04: hoje → inicio na meia-noite de hoje em São Paulo e fim = agora', async () => {
      const antes = Date.now();
      const { periodo } = await resumoNo(carla, 'hoje');
      const depois = Date.now();

      expect(periodo).toEqual({
        valor: 'hoje',
        inicio: expect.stringMatching(ISO_UTC),
        fim: expect.stringMatching(ISO_UTC),
      });
      const fim = Date.parse(periodo.fim);
      expect(fim).toBeGreaterThanOrEqual(antes - 1000);
      expect(fim).toBeLessThanOrEqual(depois + 1000);
      expect(Date.parse(periodo.inicio!)).toBe(meiaNoiteEmSaoPaulo(new Date(fim)).getTime());
    });

    it.each([
      ['7d', 7],
      ['30d', 30],
    ] as const)('RF-04: %s → janela móvel de %i dias terminando agora', async (valor, dias) => {
      const antes = Date.now();
      const { periodo } = await resumoNo(carla, valor);
      const depois = Date.now();

      expect(periodo).toMatchObject({ valor });
      const fim = Date.parse(periodo.fim);
      expect(fim).toBeGreaterThanOrEqual(antes - 1000);
      expect(fim).toBeLessThanOrEqual(depois + 1000);
      expect(fim - Date.parse(periodo.inicio!)).toBe(dias * DIA);
    });

    it('RF-04: tudo → inicio null e fim = agora', async () => {
      const antes = Date.now();
      const { periodo } = await resumoNo(carla, 'tudo');

      expect(periodo).toEqual({ valor: 'tudo', inicio: null, fim: expect.stringMatching(ISO_UTC) });
      expect(Date.parse(periodo.fim)).toBeGreaterThanOrEqual(antes - 1000);
    });

    it('RF-04: sem o parâmetro → periodo tudo (comportamento atual)', async () => {
      const { periodo } = await resumoNo(carla);
      expect(periodo).toEqual({ valor: 'tudo', inicio: null, fim: expect.stringMatching(ISO_UTC) });
    });

    it.each(['semana', '7D', 'HOJE', '90d', '1d', 'todos'])(
      'RF-04: periodo=%s → 400 DADOS_INVALIDOS (Problem Details)',
      async (valor) => {
        const resposta = await api(app, carla).get(`/dashboard/resumo?periodo=${valor}`);
        esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
      },
    );

    it('sem token, mesmo com período → 401', async () => {
      expect((await api(app).get('/dashboard/resumo?periodo=7d')).status).toBe(401);
    });
  });

  describe('PROPRIAS com datas controladas', () => {
    let pessoa: Sessao;
    let maisAntiga: string;

    /*
     * Oito solicitações do solicitante do teste. "ontem 23:30" em São Paulo já é hoje em UTC
     * (02:30Z): precisa ficar fora de `hoje`. A de "hoje" fica no meio do dia corrente em SP.
     */
    beforeAll(async () => {
      pessoa = await entrarComSolicitanteNovo(app, owner);
      const agora = Date.now();
      const meiaNoite = meiaNoiteEmSaoPaulo(new Date(agora)).getTime();
      const plano: [Status, Prioridade, number][] = [
        ['ABERTA', 'MEDIA', meiaNoite + (agora - meiaNoite) / 2], // hoje
        ['EM_ANALISE', 'ALTA', meiaNoite - 30 * MINUTO], // ontem 23:30 em SP
        ['APROVADA', 'BAIXA', agora - 3 * DIA],
        ['ABERTA', 'ALTA', agora - 7 * DIA + HORA], // ainda dentro de 7d
        ['REJEITADA', 'MEDIA', agora - 8 * DIA],
        ['ABERTA', 'BAIXA', agora - 29 * DIA],
        ['ABERTA', 'ALTA', agora - 31 * DIA],
        ['ABERTA', 'ALTA', agora - 400 * DIA],
      ];
      for (const [status, prioridade, quando] of plano) {
        const criada = await solicitacaoEm(
          app,
          status,
          { dono: pessoa, analista: carla },
          { prioridade },
        );
        maisAntiga = await definirData(owner, criada.id, new Date(quando));
      }
    });

    // O que não depende do período: estado atual da fila do solicitante
    const estadoAtual = () => ({ filaAlta: 3, aberturaMaisAntiga: maisAntiga });

    it('RF-04: resumo respeita periodo=hoje (ontem 23:30 em SP fica fora, mesmo sendo hoje em UTC)', async () => {
      expect(await resumoNo(pessoa, 'hoje')).toMatchObject({
        escopo: 'PROPRIAS',
        total: 1,
        porStatus: { ABERTA: 1, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0 },
        porPrioridade: { BAIXA: 0, MEDIA: 1, ALTA: 0 },
        ...estadoAtual(),
      });
    });

    it('RF-04: resumo respeita periodo=7d', async () => {
      expect(await resumoNo(pessoa, '7d')).toMatchObject({
        total: 4,
        porStatus: { ABERTA: 2, EM_ANALISE: 1, APROVADA: 1, REJEITADA: 0 },
        porPrioridade: { BAIXA: 1, MEDIA: 1, ALTA: 2 },
        ...estadoAtual(),
      });
    });

    it('RF-04: resumo respeita periodo=30d', async () => {
      expect(await resumoNo(pessoa, '30d')).toMatchObject({
        total: 6,
        porStatus: { ABERTA: 3, EM_ANALISE: 1, APROVADA: 1, REJEITADA: 1 },
        porPrioridade: { BAIXA: 2, MEDIA: 2, ALTA: 2 },
        ...estadoAtual(),
      });
    });

    it.each([['tudo'], [undefined]] as const)(
      'RF-04: resumo respeita periodo=%s (todas as oito)',
      async (periodo) => {
        expect(await resumoNo(pessoa, periodo)).toMatchObject({
          total: 8,
          porStatus: { ABERTA: 5, EM_ANALISE: 1, APROVADA: 1, REJEITADA: 1 },
          porPrioridade: { BAIXA: 2, MEDIA: 2, ALTA: 4 },
          ...estadoAtual(),
        });
      },
    );
  });

  describe('GERAL (analista e admin)', () => {
    /** Contagem no banco (app_owner) com data_solicitacao entre os limites devolvidos. */
    async function noBanco(periodo: ResumoComPeriodo['periodo']) {
      const resultado = await owner.query<{
        status: Status;
        prioridade: Prioridade;
        total: number;
      }>(
        `SELECT status::text AS status, prioridade::text AS prioridade, count(*)::int AS total
           FROM solicitacoes
          WHERE excluido_em IS NULL
            AND ($1::timestamptz IS NULL OR data_solicitacao >= $1)
            AND data_solicitacao <= $2
          GROUP BY status, prioridade`,
        [periodo.inicio, periodo.fim],
      );
      const porStatus = { ABERTA: 0, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0 };
      const porPrioridade = { BAIXA: 0, MEDIA: 0, ALTA: 0 };
      let total = 0;
      for (const grupo of resultado.rows) {
        porStatus[grupo.status] += grupo.total;
        porPrioridade[grupo.prioridade] += grupo.total;
        total += grupo.total;
      }
      return { total, porStatus, porPrioridade };
    }

    it.each([
      ['carla', 'hoje'],
      ['carla', '7d'],
      ['diego', '30d'],
      ['diego', 'tudo'],
    ] as const)(
      'RF-04: %s com periodo=%s → indicadores do banco no mesmo intervalo',
      async (quem, valor) => {
        const corpo = await resumoNo(quem === 'carla' ? carla : diego, valor);
        expect(corpo.escopo).toBe('GERAL');
        expect(corpo.periodo).toMatchObject({ valor });
        expect(corpo).toMatchObject(await noBanco(corpo.periodo));
      },
    );

    it('RF-04: 7d conta menos que tudo no seed (o filtro realmente corta)', async () => {
      const semana = await resumoNo(diego, '7d');
      const tudo = await resumoNo(diego, 'tudo');
      expect(semana.total).toBeLessThan(tudo.total);
    });

    it('RF-04: filaAlta e aberturaMaisAntiga não mudam com o período', async () => {
      const semPeriodo = await resumoNo(diego);
      expect(semPeriodo.aberturaMaisAntiga).not.toBeNull();
      for (const valor of ['hoje', '7d', '30d', 'tudo'] as const) {
        const corpo = await resumoNo(diego, valor);
        expect({ valor, filaAlta: corpo.filaAlta, maisAntiga: corpo.aberturaMaisAntiga }).toEqual({
          valor,
          filaAlta: semPeriodo.filaAlta,
          maisAntiga: semPeriodo.aberturaMaisAntiga,
        });
      }
    });
  });
});
