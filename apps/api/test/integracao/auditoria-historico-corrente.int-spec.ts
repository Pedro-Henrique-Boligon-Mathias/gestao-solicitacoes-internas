import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  ISO_UTC,
  api,
  criarSolicitacao,
  decidir,
  entrarComSeed,
  esperarProblema,
  iniciarAnalise,
  reabrir,
  type Sessao,
} from './api-solicitacoes';
import {
  HASH_HEX,
  SEMENTE,
  corrente,
  pedirIntegridade,
  totaisDoHistorico,
  verificar,
} from './auditoria';
import { SQLSTATE, conectar } from './banco';

/*
 * Auditoria do histórico com hash encadeado (doc 16), parte 1: a corrente gravada pelo trigger,
 * o acesso ao GET /auditoria/integridade e o seed íntegro. Banco próprio, sem adulteração: as
 * adulterações ficam em auditoria-historico-adulteracao.int-spec.ts.
 */
describe('RN-10: auditoria do histórico · corrente e acesso', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let runtime: Client;
  let ana: Sessao;
  let carla: Sessao;
  let diego: Sessao;
  let solicitacaoId: string;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('auditoria_corrente');
    owner = await conectar('owner', banco);
    runtime = await conectar('runtime', banco);
    app = await subirApi(banco, { OUTBOX_MAX_TENTATIVAS: '5' });
    ({ ana, carla, diego } = await entrarComSeed(app, ['ana', 'carla', 'diego'] as const));

    // Ciclo completo pela API (app_runtime): criar, editar, analisar, decidir e reabrir.
    const criada = await criarSolicitacao(app, ana);
    solicitacaoId = criada.id;
    await api(app, ana)
      .patch(`/solicitacoes/${solicitacaoId}`)
      .send({ titulo: 'Acesso de leitura ao sistema de cobrança', prioridade: 'ALTA', versao: 1 })
      .expect(200);
    await iniciarAnalise(app, carla, solicitacaoId).expect(200);
    await decidir(app, carla, solicitacaoId, 'APROVADA').expect(200);
    await reabrir(app, diego, solicitacaoId).expect(200);
  });

  afterAll(async () => {
    await app?.close();
    await runtime?.end();
    await owner?.end();
  });

  describe('corrente gravada pelo trigger', () => {
    it('RN-10: o ciclo criar → editar → analisar → decidir → reabrir grava 5 eventos na ordem', async () => {
      const eventos = await corrente(owner, solicitacaoId);
      expect(eventos.map((evento) => evento.tipo)).toEqual([
        'CRIADA',
        'EDITADA',
        'ANALISE_INICIADA',
        'APROVADA',
        'REABERTA',
      ]);
    });

    it('RN-10: hash e hash_anterior são SHA-256 em hexadecimal (64 caracteres)', async () => {
      for (const evento of await corrente(owner, solicitacaoId)) {
        expect(evento.hash).toMatch(HASH_HEX);
        expect(evento.hash_anterior).toMatch(HASH_HEX);
      }
    });

    it('RN-10: o primeiro evento parte da semente (64 zeros) e cada um aponta para o anterior', async () => {
      const eventos = await corrente(owner, solicitacaoId);
      expect(eventos[0]!.hash_anterior).toBe(SEMENTE);
      for (let posicao = 1; posicao < eventos.length; posicao += 1) {
        expect(eventos[posicao]!.hash_anterior).toBe(eventos[posicao - 1]!.hash);
      }
    });

    it('RN-10: o hash gravado confere com o recálculo do conteúdo canônico em SQL', async () => {
      const eventos = await corrente(owner, solicitacaoId);
      expect(eventos.map((evento) => evento.hash)).toEqual(
        eventos.map((evento) => evento.recalculado),
      );
    });

    it('RN-10: a corrente é por solicitação: o primeiro evento de outra solicitação também parte da semente', async () => {
      const outra = await criarSolicitacao(app, ana);
      const eventos = await corrente(owner, outra.id);
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({ tipo: 'CRIADA', hash_anterior: SEMENTE });
      expect(eventos[0]!.hash).toBe(eventos[0]!.recalculado);
    });

    it('RN-10: os eventos do seed também estão encadeados e conferem com o recálculo', async () => {
      const resultado = await owner.query<{ id: string }>(
        `SELECT s.id FROM solicitacoes s
          WHERE (SELECT count(*) FROM solicitacao_historico h WHERE h.solicitacao_id = s.id) >= 3
          ORDER BY s.codigo LIMIT 1`,
      );
      const eventos = await corrente(owner, resultado.rows[0]!.id);
      expect(eventos[0]!.hash_anterior).toBe(SEMENTE);
      for (let posicao = 1; posicao < eventos.length; posicao += 1) {
        expect(eventos[posicao]!.hash_anterior).toBe(eventos[posicao - 1]!.hash);
      }
      expect(eventos.map((evento) => evento.hash)).toEqual(
        eventos.map((evento) => evento.recalculado),
      );
    });

    it('RN-10: quem insere não escolhe o hash: o trigger sobrescreve hash e hash_anterior informados', async () => {
      const antes = await corrente(owner, solicitacaoId);
      const inserido = await owner.query<{ id: string; hash_anterior: string; hash: string }>(
        `INSERT INTO solicitacao_historico
           (solicitacao_id, tipo, status_anterior, status_novo, autor_id, comentario,
            hash_anterior, hash)
         VALUES ($1, 'EDITADA', 'ABERTA', 'ABERTA', $2, 'Evento gravado direto no banco.', $3, $4)
         RETURNING id, hash_anterior, hash`,
        [solicitacaoId, ana.id, 'e'.repeat(64), 'f'.repeat(64)],
      );
      const linha = inserido.rows[0]!;
      expect(linha.hash_anterior).toBe(antes.at(-1)!.hash);
      expect(linha.hash).not.toBe('f'.repeat(64));

      const depois = await corrente(owner, solicitacaoId);
      expect(depois.at(-1)).toMatchObject({ id: linha.id, hash: linha.hash });
      expect(depois.at(-1)!.hash).toBe(depois.at(-1)!.recalculado);
    });
  });

  describe('app_runtime continua sem alterar nem apagar o histórico', () => {
    it('RN-10: UPDATE de hash em solicitacao_historico dá erro de permissão para app_runtime', async () => {
      await expect(
        runtime.query('UPDATE solicitacao_historico SET hash = $2 WHERE solicitacao_id = $1', [
          solicitacaoId,
          'a'.repeat(64),
        ]),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
    });

    it('RN-10: UPDATE de comentario em solicitacao_historico dá erro de permissão para app_runtime', async () => {
      await expect(
        runtime.query(
          "UPDATE solicitacao_historico SET comentario = 'alterado' WHERE solicitacao_id = $1",
          [solicitacaoId],
        ),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
    });

    it('RN-10: DELETE em solicitacao_historico dá erro de permissão para app_runtime', async () => {
      const antes = (await corrente(owner, solicitacaoId)).length;
      await expect(
        runtime.query('DELETE FROM solicitacao_historico WHERE solicitacao_id = $1', [
          solicitacaoId,
        ]),
      ).rejects.toMatchObject({ code: SQLSTATE.semPermissao });
      expect(await corrente(owner, solicitacaoId)).toHaveLength(antes);
    });
  });

  describe('GET /auditoria/integridade · acesso', () => {
    it('ADR-001: sem token → 401 NAO_AUTENTICADO', async () => {
      esperarProblema(await pedirIntegridade(app), 401, 'NAO_AUTENTICADO');
    });

    it.each([
      ['Analista', () => carla],
      ['Solicitante', () => ana],
    ])('RN-10: integridade só para Admin · %s recebe 403 ACESSO_NEGADO', async (_cargo, sessao) => {
      esperarProblema(await pedirIntegridade(app, sessao()), 403, 'ACESSO_NEGADO');
    });
  });

  describe('GET /auditoria/integridade · banco sem adulteração', () => {
    it('RN-10: seed + ciclo pela API + INSERT direto verificam íntegros, nesta forma', async () => {
      const antes = Date.now();
      const corpo = await verificar(app, diego);
      expect(Object.keys(corpo).sort()).toEqual(
        [
          'divergencias',
          'eventosVerificados',
          'integro',
          'solicitacoesVerificadas',
          'totalDivergencias',
          'verificadoEm',
        ].sort(),
      );
      expect(corpo).toMatchObject({ integro: true, totalDivergencias: 0, divergencias: [] });
      expect(corpo.verificadoEm).toMatch(ISO_UTC);
      expect(Date.parse(corpo.verificadoEm)).toBeGreaterThanOrEqual(antes - 1000);
      expect(Date.parse(corpo.verificadoEm)).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('RN-10: verifica todos os eventos e todas as solicitações do histórico', async () => {
      const corpo = await verificar(app, diego);
      const totais = await totaisDoHistorico(owner);
      expect(totais.eventos).toBeGreaterThan(0);
      expect(totais.solicitacoes).toBeGreaterThan(0);
      expect(corpo.eventosVerificados).toBe(totais.eventos);
      expect(corpo.solicitacoesVerificadas).toBe(totais.solicitacoes);
    });

    it('RN-10: verificar não grava nada (não cria eventos no histórico)', async () => {
      const antes = await totaisDoHistorico(owner);
      await verificar(app, diego);
      expect(await totaisDoHistorico(owner)).toEqual(antes);
    });
  });
});
