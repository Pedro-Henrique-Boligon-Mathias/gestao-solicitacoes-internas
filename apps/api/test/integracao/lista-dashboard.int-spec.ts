import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  COMENTARIO,
  DIA,
  ISO_UTC,
  detalhe,
  entrarComSeed,
  entrarComSolicitanteNovo,
  historico,
  iniciarAnalise,
  listar,
  ordenar,
  reabrir,
  solicitacaoEm,
  type ItemLista,
  type Sessao,
  type Solicitacao,
} from './api-solicitacoes';
import { conectar } from './banco';

/** Item da lista com os campos do dashboard por cargo (PR 4B). */
type ItemDashboard = ItemLista & {
  analiseIniciadaEm: string | null;
  decisao: Solicitacao['decisao'];
};

/*
 * Banco próprio deste arquivo (migrations + seed). Cada bloco usa um solicitante criado pelo
 * teste: pela visibilidade (RN-13), a lista dele só tem o que o teste criou.
 */
describe('GET /solicitacoes: campos do dashboard por cargo (PR 4B)', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let carla: Sessao;
  let rafael: Sessao;
  let diego: Sessao;
  let ana: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('dashboard');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
    ({ carla, rafael, diego, ana } = await entrarComSeed(app, [
      'carla',
      'rafael',
      'diego',
      'ana',
    ] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  async function itensDe(sessao: Sessao, query = 'pageSize=100'): Promise<ItemDashboard[]> {
    return (await listar(app, sessao, query)).data as ItemDashboard[];
  }

  function item(itens: ItemDashboard[], id: string): ItemDashboard {
    const achado = itens.find((candidato) => candidato.id === id);
    expect(achado).toBeDefined();
    return achado!;
  }

  /** Datas de ANALISE_INICIADA no histórico, em ordem cronológica. */
  async function iniciosDeAnalise(id: string): Promise<string[]> {
    const eventos = await historico(app, diego, id);
    return eventos
      .filter((evento) => evento.tipo === 'ANALISE_INICIADA')
      .map((evento) => evento.criadoEm)
      .sort();
  }

  describe('RF-02/RF-03: analiseIniciadaEm e decisao no item da lista', () => {
    let pessoa: Sessao;
    const s: Record<string, Solicitacao> = {};

    beforeAll(async () => {
      pessoa = await entrarComSolicitanteNovo(app, owner);
      const pessoas = { dono: pessoa, analista: carla };
      s.aberta = await solicitacaoEm(app, 'ABERTA', pessoas);
      s.emAnalise = await solicitacaoEm(app, 'EM_ANALISE', pessoas);
      s.aprovada = await solicitacaoEm(app, 'APROVADA', pessoas);
      s.rejeitada = await solicitacaoEm(app, 'REJEITADA', { dono: pessoa, analista: rafael });

      // Reaberta e ainda na fila: voltou a ABERTA depois de aprovada.
      s.reabertaNaFila = await solicitacaoEm(app, 'APROVADA', pessoas);
      await reabrir(app, diego, s.reabertaNaFila.id).expect(200);

      // Reaberta e analisada de novo (por outro analista).
      s.reanalisada = await solicitacaoEm(app, 'APROVADA', pessoas);
      await reabrir(app, diego, s.reanalisada.id).expect(200);
      await iniciarAnalise(app, rafael, s.reanalisada.id).expect(200);
    });

    it('RF-02: item da lista traz analiseIniciadaEm do último início de análise', async () => {
      const itens = await itensDe(pessoa);
      const [inicio] = await iniciosDeAnalise(s.emAnalise!.id);
      expect(inicio).toMatch(ISO_UTC);
      expect(item(itens, s.emAnalise!.id).analiseIniciadaEm).toBe(inicio);
    });

    it('RF-02: reaberta e analisada de novo → analiseIniciadaEm do segundo início', async () => {
      const inicios = await iniciosDeAnalise(s.reanalisada!.id);
      expect(inicios).toHaveLength(2);
      const reanalisada = item(await itensDe(pessoa), s.reanalisada!.id);
      expect(reanalisada.status).toBe('EM_ANALISE');
      expect(reanalisada.analiseIniciadaEm).toBe(inicios[1]);
      expect(reanalisada.analiseIniciadaEm).not.toBe(inicios[0]);
    });

    it('RF-02: reaberta e ainda na fila → analiseIniciadaEm null', async () => {
      const reaberta = item(await itensDe(pessoa), s.reabertaNaFila!.id);
      expect(reaberta.status).toBe('ABERTA');
      expect(reaberta).toHaveProperty('analiseIniciadaEm', null);
    });

    it.each(['aberta', 'aprovada', 'rejeitada'])(
      'RF-02: %s (fora de EM_ANALISE) → analiseIniciadaEm null',
      async (nome) => {
        expect(item(await itensDe(pessoa), s[nome]!.id)).toHaveProperty('analiseIniciadaEm', null);
      },
    );

    it('RF-03: item da lista traz a decisão das decididas e null nas outras', async () => {
      const itens = await itensDe(pessoa);
      for (const nome of ['aprovada', 'rejeitada']) {
        const doDetalhe = (await detalhe(app, pessoa, s[nome]!.id)).decisao;
        expect(doDetalhe).not.toBeNull();
        expect(item(itens, s[nome]!.id).decisao).toEqual(doDetalhe);
      }
      expect(item(itens, s.aprovada!.id).decisao).toEqual({
        resultado: 'APROVADA',
        comentario: COMENTARIO,
        decididoEm: expect.stringMatching(ISO_UTC),
        decididoPor: { id: carla.id, nome: 'Carla Mendes' },
      });
      expect(item(itens, s.rejeitada!.id).decisao).toMatchObject({
        resultado: 'REJEITADA',
        decididoPor: { id: rafael.id, nome: 'Rafael Costa' },
      });
      for (const nome of ['aberta', 'emAnalise', 'reabertaNaFila', 'reanalisada']) {
        expect(item(itens, s[nome]!.id)).toHaveProperty('decisao', null);
      }
    });
  });

  describe('RF-02: ordenarPor=decididoEm', () => {
    let pessoa: Sessao;
    const s: Record<string, Solicitacao> = {};

    /** Muda a data da decisão direto no banco (app_owner), para a ordem ser conhecida. */
    async function definirDecisao(id: string, data: Date): Promise<void> {
      await owner.query('UPDATE solicitacoes SET decidido_em = $2 WHERE id = $1', [id, data]);
    }

    beforeAll(async () => {
      pessoa = await entrarComSolicitanteNovo(app, owner);
      const agora = Date.now();
      const plano = [
        ['d3dias', 'APROVADA', 3],
        ['d1dia', 'REJEITADA', 1],
        ['d2dias', 'APROVADA', 2],
      ] as const;
      for (const [nome, status, dias] of plano) {
        s[nome] = await solicitacaoEm(app, status, { dono: pessoa, analista: carla });
        await definirDecisao(s[nome].id, new Date(agora - dias * DIA));
      }
      s.aberta = await solicitacaoEm(app, 'ABERTA', { dono: pessoa, analista: carla });
      s.emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: pessoa, analista: carla });
    });

    function nomes(itens: ItemLista[]): string[] {
      return itens.map((item) => Object.keys(s).find((nome) => s[nome]!.id === item.id) ?? item.id);
    }

    it('RF-02: ordenarPor=decididoEm ordena da decisão mais recente', async () => {
      const lista = await listar(
        app,
        pessoa,
        'status=APROVADA&status=REJEITADA&ordenarPor=decididoEm',
      );
      expect(nomes(lista.data)).toEqual(['d1dia', 'd2dias', 'd3dias']);
      expect(lista.meta.total).toBe(3);
    });

    it('RF-02: ordenarPor=decididoEm deixa as sem decisão no fim', async () => {
      const lista = await listar(app, pessoa, 'ordenarPor=decididoEm');
      const ordem = nomes(lista.data);
      expect(ordem.slice(0, 3)).toEqual(['d1dia', 'd2dias', 'd3dias']);
      expect(ordenar(ordem.slice(3))).toEqual(['aberta', 'emAnalise']);
    });
  });

  describe('RN-13: visibilidade dos campos novos (RLS)', () => {
    let pessoa: Sessao;
    let outra: Sessao;
    let propria: Solicitacao;
    const deOutra: string[] = [];

    beforeAll(async () => {
      pessoa = await entrarComSolicitanteNovo(app, owner);
      outra = await entrarComSolicitanteNovo(app, owner);
      propria = await solicitacaoEm(app, 'APROVADA', { dono: pessoa, analista: carla });
      for (const status of ['APROVADA', 'REJEITADA', 'EM_ANALISE'] as const) {
        deOutra.push((await solicitacaoEm(app, status, { dono: outra, analista: rafael })).id);
      }
    });

    it('RN-13: solicitante não recebe decisão nem analista de solicitações de outros', async () => {
      for (const query of [
        'pageSize=100',
        'status=APROVADA&status=REJEITADA&ordenarPor=decididoEm&pageSize=100',
      ]) {
        const itens = await itensDe(pessoa, query);
        expect(itens.map((candidato) => candidato.id)).toEqual([propria.id]);
        expect(item(itens, propria.id).decisao).toMatchObject({
          decididoPor: { id: carla.id, nome: 'Carla Mendes' },
        });
      }
      const daOutra = await itensDe(outra, 'ordenarPor=decididoEm&pageSize=100');
      expect(ordenar(daOutra.map((candidato) => candidato.id))).toEqual(ordenar(deOutra));
    });

    it('RN-13: Ana (seed) vê as próprias decididas, com decisão, e nada de outros', async () => {
      const itens = await itensDe(
        ana,
        'status=APROVADA&status=REJEITADA&ordenarPor=decididoEm&pageSize=100',
      );
      expect(itens.length).toBeGreaterThan(0);
      for (const decidida of itens) {
        expect(decidida.solicitante.id).toBe(ana.id);
        expect(decidida.decisao).toEqual(
          expect.objectContaining({ comentario: expect.any(String) }),
        );
      }
      const datas = itens.map((decidida) => decidida.decisao!.decididoEm);
      expect(datas).toEqual([...datas].sort().reverse());
    });
  });
});
