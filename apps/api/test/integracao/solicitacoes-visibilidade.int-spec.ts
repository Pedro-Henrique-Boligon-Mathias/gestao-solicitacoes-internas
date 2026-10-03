import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  api,
  criarSolicitacao,
  decidir,
  detalhe,
  entrarComSeed,
  entrarComSolicitanteNovo,
  esperarProblema,
  iniciarAnalise,
  listar,
  marcador,
  reabrir,
  resumo,
  solicitacaoEm,
  type Sessao,
} from './api-solicitacoes';
import { conectar } from './banco';

/*
 * Banco próprio deste arquivo (migrations + seed). As listas são recortadas por um marcador único
 * na busca (q) ou conferidas por propriedade (todas as linhas da Ana são da Ana), então as 40
 * solicitações do seed não alteram o resultado.
 */
describe('Visibilidade e exclusão lógica', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let ana: Sessao;
  let bruno: Sessao;
  let carla: Sessao;
  let rafael: Sessao;
  let diego: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('visibilidade');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
    ({ ana, bruno, carla, rafael, diego } = await entrarComSeed(app, [
      'ana',
      'bruno',
      'carla',
      'rafael',
      'diego',
    ] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  describe('RN-13 / P-13: o solicitante vê só as próprias', () => {
    it('RN-13: Ana não vê a do Bruno: detalhe 404, histórico 404 e fora da lista', async () => {
      const marca = marcador();
      const doBruno = await criarSolicitacao(app, bruno, { titulo: `Troca de cadeira ${marca}` });

      esperarProblema(
        await api(app, ana).get(`/solicitacoes/${doBruno.id}`),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
      esperarProblema(
        await api(app, ana).get(`/solicitacoes/${doBruno.id}/historico`),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );

      const lista = await listar(app, ana, `q=${marca}`);
      expect(lista.data).toEqual([]);
      expect(lista.meta.total).toBe(0);
    });

    it('RN-13: na lista da Ana, todas as linhas são da Ana', async () => {
      await criarSolicitacao(app, ana);
      await criarSolicitacao(app, bruno);
      const lista = await listar(app, ana, 'pageSize=100');
      expect(lista.data.length).toBeGreaterThan(0);
      for (const item of lista.data) {
        expect(item.solicitante.id).toBe(ana.id);
      }

      const contagem = await owner.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM solicitacoes WHERE solicitante_id = $1 AND excluido_em IS NULL',
        [ana.id],
      );
      expect(lista.meta.total).toBe(contagem.rows[0]!.total);
    });

    it('P-13: Ana não edita, não exclui e não comanda a do Bruno (404) e nada muda', async () => {
      const doBruno = await criarSolicitacao(app, bruno);
      const comoAna = api(app, ana);
      const tentativas = [
        comoAna.patch(`/solicitacoes/${doBruno.id}`).send({ titulo: 'Título alterado', versao: 1 }),
        comoAna.delete(`/solicitacoes/${doBruno.id}`),
        iniciarAnalise(app, ana, doBruno.id),
        decidir(app, ana, doBruno.id),
        reabrir(app, ana, doBruno.id),
      ];
      for (const resposta of await Promise.all(tentativas)) {
        esperarProblema(resposta, 404, 'SOLICITACAO_NAO_ENCONTRADA');
      }

      expect(await detalhe(app, bruno, doBruno.id)).toMatchObject({
        titulo: doBruno.titulo,
        status: 'ABERTA',
        versao: 1,
      });
    });

    it('RN-13: Carla (ANALISTA) e Diego (ADMIN) veem a do Bruno no detalhe, no histórico e na lista', async () => {
      const marca = marcador();
      const doBruno = await criarSolicitacao(app, bruno, { titulo: `Troca de cadeira ${marca}` });

      for (const sessao of [carla, diego]) {
        expect(await detalhe(app, sessao, doBruno.id)).toMatchObject({ id: doBruno.id });
        await api(app, sessao).get(`/solicitacoes/${doBruno.id}/historico`).expect(200);
        const lista = await listar(app, sessao, `q=${marca}`);
        expect(lista.data.map((item) => item.id)).toEqual([doBruno.id]);
      }
    });

    it('RN-13: a lista da Carla traz solicitações de várias pessoas', async () => {
      await criarSolicitacao(app, ana);
      await criarSolicitacao(app, bruno);
      const lista = await listar(app, carla, 'pageSize=100');
      const solicitantes = new Set(lista.data.map((item) => item.solicitante.id));
      expect(solicitantes.has(ana.id) && solicitantes.has(bruno.id)).toBe(true);

      const contagem = await owner.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM solicitacoes WHERE excluido_em IS NULL',
      );
      expect(lista.meta.total).toBe(contagem.rows[0]!.total);
    });
  });

  describe('RN-12: excluída some de tudo', () => {
    it('RN-12: excluída some da lista, do detalhe (404) e do histórico (404), para o dono e para a analista', async () => {
      const marca = marcador();
      const criada = await criarSolicitacao(app, ana, { titulo: `Monitor extra ${marca}` });
      expect((await listar(app, carla, `q=${marca}`)).meta.total).toBe(1);

      await api(app, ana).delete(`/solicitacoes/${criada.id}`).expect(204);

      for (const sessao of [ana, carla, diego]) {
        const lista = await listar(app, sessao, `q=${marca}`);
        expect(lista).toMatchObject({ data: [], meta: { total: 0 } });
        esperarProblema(
          await api(app, sessao).get(`/solicitacoes/${criada.id}`),
          404,
          'SOLICITACAO_NAO_ENCONTRADA',
        );
        esperarProblema(
          await api(app, sessao).get(`/solicitacoes/${criada.id}/historico`),
          404,
          'SOLICITACAO_NAO_ENCONTRADA',
        );
      }
    });

    it('RN-12: comandos sobre uma excluída → 404 SOLICITACAO_NAO_ENCONTRADA', async () => {
      const criada = await criarSolicitacao(app, ana);
      await api(app, ana).delete(`/solicitacoes/${criada.id}`).expect(204);

      esperarProblema(
        await iniciarAnalise(app, rafael, criada.id),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
      esperarProblema(
        await api(app, ana)
          .patch(`/solicitacoes/${criada.id}`)
          .send({ titulo: 'Título alterado', versao: 2 }),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
      esperarProblema(
        await api(app, diego).delete(`/solicitacoes/${criada.id}`),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
    });

    it('RN-12: excluída não conta no dashboard (escopo próprio e geral)', async () => {
      const pessoa = await entrarComSolicitanteNovo(app, owner);
      await criarSolicitacao(app, pessoa, { prioridade: 'ALTA' });
      const aExcluir = await criarSolicitacao(app, pessoa, { prioridade: 'ALTA' });
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: pessoa, analista: carla });

      const geralAntes = await resumo(app, carla);
      await api(app, pessoa).delete(`/solicitacoes/${aExcluir.id}`).expect(204);
      const geralDepois = await resumo(app, carla);

      expect(await resumo(app, pessoa)).toMatchObject({
        escopo: 'PROPRIAS',
        total: 2,
        porStatus: { ABERTA: 1, EM_ANALISE: 1, APROVADA: 0, REJEITADA: 0 },
        porPrioridade: { ALTA: 1, MEDIA: 1, BAIXA: 0 },
        filaAlta: 1,
      });
      expect(emAnalise.status).toBe('EM_ANALISE');

      expect(geralDepois.total).toBe(geralAntes.total - 1);
      expect(geralDepois.porStatus.ABERTA).toBe(geralAntes.porStatus.ABERTA - 1);
      expect(geralDepois.porPrioridade.ALTA).toBe(geralAntes.porPrioridade.ALTA - 1);
      expect(geralDepois.filaAlta).toBe(geralAntes.filaAlta - 1);
    });
  });
});
