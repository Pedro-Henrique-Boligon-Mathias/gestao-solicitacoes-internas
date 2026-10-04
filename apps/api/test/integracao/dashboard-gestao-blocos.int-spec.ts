import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import { EMAILS_SEED, entrarComSeed, type Sessao } from './api-solicitacoes';
import { conectar } from './banco';
import {
  areasDoSeed,
  diasAtras,
  gestao,
  inserirComHistorico,
  inserirUsuario,
  limparSolicitacoes,
  type Gestao,
  type PlanoSolicitacao,
} from './dashboard-gestao';

/*
 * PR 4C · blocos Por área e Por analista do GET /dashboard/gestao. Banco próprio com o seed;
 * cada teste apaga as solicitações e grava o próprio cenário (dN = agora menos N dias).
 */
describe('RF-04: GET /dashboard/gestao · por área e por analista', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let diego: Sessao;
  let ids: { ana: string; carla: string; rafael: string; diego: string };
  let areas: Record<string, string>;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('gestao_blocos');
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

  beforeEach(async () => {
    await limparSolicitacoes(owner);
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  type Plano = Omit<PlanoSolicitacao, 'solicitanteId' | 'eventos'> & { criadaEm: Date };

  /** Solicitação da Ana com CRIADA em `criadaEm`; EM_ANALISE e decididas ganham os eventos. */
  async function solicitacao(plano: Plano, decididaEm?: Date): Promise<string> {
    const { criadaEm, ...resto } = plano;
    const eventos: PlanoSolicitacao['eventos'] = [{ tipo: 'CRIADA', em: criadaEm }];
    if (plano.status !== 'ABERTA') eventos.push({ tipo: 'ANALISE_INICIADA', em: criadaEm });
    if (plano.status === 'APROVADA' || plano.status === 'REJEITADA') {
      eventos.push({ tipo: plano.status, em: decididaEm ?? criadaEm });
    }
    const { id } = await inserirComHistorico(owner, { ...resto, solicitanteId: ids.ana, eventos });
    return id;
  }

  const ZERADO = { ABERTA: 0, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0 };

  function porNomeDaArea(corpo: Gestao): Record<string, Gestao['porArea'][number]> {
    return Object.fromEntries(corpo.porArea.map((linha) => [linha.area.nome, linha]));
  }

  describe('porArea', () => {
    let areaInativa: { id: string; nome: string };

    beforeEach(async () => {
      const nome = `Área desativada ${randomUUID().slice(0, 8)}`;
      const linha = await owner.query<{ id: string }>(
        'INSERT INTO areas (nome, ativo) VALUES ($1, false) RETURNING id',
        [nome],
      );
      areaInativa = { id: linha.rows[0]!.id, nome };
      const agora = new Date();
      const d = (dias: number) => diasAtras(dias, agora);
      const fin = areas.Financeiro!;
      await solicitacao({ areaId: fin, status: 'ABERTA', criadaEm: d(1) });
      await solicitacao(
        {
          areaId: fin,
          status: 'APROVADA',
          analistaId: ids.carla,
          decisorId: ids.carla,
          criadaEm: d(2),
        },
        d(1),
      );
      await solicitacao({
        areaId: areas.Tecnologia!,
        status: 'EM_ANALISE',
        analistaId: ids.carla,
        criadaEm: d(3),
      });
      await solicitacao(
        {
          areaId: fin,
          status: 'REJEITADA',
          analistaId: ids.carla,
          decisorId: ids.carla,
          criadaEm: d(20),
        },
        d(19),
      );
      await solicitacao({ areaId: fin, status: 'ABERTA', criadaEm: d(1), excluidaEm: d(0.5) });
      await solicitacao({ areaId: areaInativa.id, status: 'ABERTA', criadaEm: d(1) });
    });

    it('RF-04: todas as áreas ativas, inclusive as zeradas, e nenhuma inativa', async () => {
      const corpo = await gestao(app, diego, '7d');
      const ativas = await owner.query<{ id: string; nome: string }>(
        'SELECT id, nome FROM areas WHERE ativo ORDER BY nome',
      );
      const recebidas = corpo.porArea
        .map((linha) => linha.area)
        .sort((a, b) => a.nome.localeCompare(b.nome));
      expect(recebidas).toEqual(
        ativas.rows
          .sort((a, b) => a.nome.localeCompare(b.nome))
          .map(({ id, nome }) => ({ id, nome })),
      );
      expect(corpo.porArea.map((linha) => linha.area.id)).not.toContain(areaInativa.id);
      const linhas = porNomeDaArea(corpo);
      for (const nome of ['Comercial', 'Recursos Humanos', 'Jurídico', 'Operações']) {
        expect(linhas[nome]).toMatchObject({ total: 0, porStatus: ZERADO });
      }
    });

    it('RF-04: total e porStatus por área filtram por dataSolicitacao no período (7d)', async () => {
      const linhas = porNomeDaArea(await gestao(app, diego, '7d'));
      expect(linhas.Financeiro).toMatchObject({
        total: 2,
        porStatus: { ...ZERADO, ABERTA: 1, APROVADA: 1 },
      });
      expect(linhas.Tecnologia).toMatchObject({
        total: 1,
        porStatus: { ...ZERADO, EM_ANALISE: 1 },
      });
    });

    it('RN-12: porArea não conta excluídas (tudo)', async () => {
      const linhas = porNomeDaArea(await gestao(app, diego, 'tudo'));
      expect(linhas.Financeiro).toEqual({
        area: { id: areas.Financeiro, nome: 'Financeiro' },
        total: 3,
        porStatus: { ABERTA: 1, EM_ANALISE: 0, APROVADA: 1, REJEITADA: 1 },
      });
    });
  });

  describe('porAnalista', () => {
    let pessoas: {
      beatriz: string;
      wagner: string;
      inativo: string;
      novato: string;
      decisorExcluida: string;
    };

    beforeEach(async () => {
      const areaId = areas.Tecnologia!;
      const analista = (nome: string, ativo = true) =>
        inserirUsuario(owner, {
          nome: `${nome} ${randomUUID().slice(0, 4)}`,
          cargo: 'ANALISTA',
          areaId,
          ativo,
        });
      pessoas = {
        beatriz: await analista('Beatriz Teste'),
        wagner: await analista('Wagner Teste'),
        inativo: await analista('Ivo Inativo', false),
        novato: await analista('Nelson Novato'),
        decisorExcluida: await analista('Edson Excluida'),
      };
      const agora = new Date();
      const d = (dias: number) => diasAtras(dias, agora);
      const emAnalise = (analistaId: string) =>
        solicitacao({ areaId, status: 'EM_ANALISE', analistaId, criadaEm: d(3) });
      const decidida = (
        decisor: string,
        status: 'APROVADA' | 'REJEITADA',
        dias: number,
        excluidaEm?: Date,
      ) =>
        solicitacao(
          {
            areaId,
            status,
            analistaId: decisor,
            decisorId: decisor,
            criadaEm: d(dias + 1),
            excluidaEm,
          },
          d(dias),
        );
      await emAnalise(ids.carla);
      await emAnalise(ids.carla);
      await emAnalise(ids.rafael);
      await emAnalise(pessoas.beatriz);
      await emAnalise(pessoas.wagner);
      await emAnalise(pessoas.inativo);
      await decidida(ids.carla, 'APROVADA', 1);
      await decidida(ids.carla, 'REJEITADA', 2);
      await decidida(ids.rafael, 'APROVADA', 10); // fora de 7d
      await decidida(ids.diego, 'APROVADA', 1);
      await decidida(pessoas.decisorExcluida, 'APROVADA', 1, d(0.5));
      await decidida(pessoas.inativo, 'APROVADA', 1);
    });

    it('RF-04: 7d · analistas e admins ativos com análise agora ou decisão no período, ordenados', async () => {
      const { porAnalista } = await gestao(app, diego, '7d');
      expect(porAnalista.map((linha) => linha.analista.id)).toEqual([
        ids.carla,
        pessoas.beatriz,
        ids.rafael,
        pessoas.wagner,
        ids.diego,
      ]);
      expect(porAnalista[0]).toEqual({
        analista: { id: ids.carla, nome: 'Carla Mendes' },
        emAnaliseAgora: 2,
        decididas: 2,
        aprovadas: 1,
        taxaAprovacao: expect.closeTo(0.5, 5),
      });
      expect(porAnalista.find((linha) => linha.analista.id === ids.diego)).toMatchObject({
        emAnaliseAgora: 0,
        decididas: 1,
        aprovadas: 1,
        taxaAprovacao: expect.closeTo(1, 5),
      });
    });

    it('RF-04: porAnalista com taxa null quando não há decisão no período', async () => {
      const { porAnalista } = await gestao(app, diego, '7d');
      expect(porAnalista.find((linha) => linha.analista.id === ids.rafael)).toEqual({
        analista: { id: ids.rafael, nome: 'Rafael Costa' },
        emAnaliseAgora: 1,
        decididas: 0,
        aprovadas: 0,
        taxaAprovacao: null,
      });
      const tudo = await gestao(app, diego, 'tudo');
      expect(tudo.porAnalista.find((linha) => linha.analista.id === ids.rafael)).toMatchObject({
        decididas: 1,
        aprovadas: 1,
        taxaAprovacao: expect.closeTo(1, 5),
      });
    });

    it('RN-12: fora quem está inativo, quem não tem trabalho e quem só decidiu excluída', async () => {
      const { porAnalista } = await gestao(app, diego, 'tudo');
      const presentes = porAnalista.map((linha) => linha.analista.id);
      expect(presentes).not.toContain(pessoas.inativo);
      expect(presentes).not.toContain(pessoas.novato);
      expect(presentes).not.toContain(pessoas.decisorExcluida);
    });
  });
});
