import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { capturarErroRegistrado } from '../apoio/log';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  COMENTARIO,
  ISO_UTC,
  JUSTIFICATIVA,
  api,
  detalhe,
  entrarComSeed,
  ordenar,
  solicitacaoEm,
  type Sessao,
  type Solicitacao,
} from './api-solicitacoes';
import { conectar } from './banco';
import { eventosDaSolicitacao } from './outbox';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/*
 * Gravação dos eventos de integração na mesma transação da mudança de status (ADR-010). Banco
 * próprio deste arquivo (migrations + seed); cada teste cria as próprias solicitações pela API e
 * confere a outbox direto no banco (app_owner).
 */
describe('ADR-010: gravação dos eventos na outbox', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let ana: Sessao;
  let carla: Sessao;
  let diego: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('outbox');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
    ({ ana, carla, diego } = await entrarComSeed(app, ['ana', 'carla', 'diego'] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  /** X-Request-Id único por chamada, para conferir o correlation_id gravado. */
  const novoRequestId = (prefixo: string) => `${prefixo}-${randomUUID().slice(0, 8)}`;

  function aprovar(sessao: Sessao, id: string, requestId: string) {
    return api(app, sessao)
      .post(`/solicitacoes/${id}/decisao`)
      .set('X-Request-Id', requestId)
      .send({ resultado: 'APROVADA', comentario: COMENTARIO });
  }

  function reabrirCom(sessao: Sessao, id: string, requestId: string) {
    return api(app, sessao)
      .post(`/solicitacoes/${id}/reabertura`)
      .set('X-Request-Id', requestId)
      .send({ justificativa: JUSTIFICATIVA });
  }

  /** Bloco `dados.solicitacao` do contrato, montado a partir da resposta da API. */
  function dadosDaSolicitacao(solicitacao: Solicitacao) {
    return {
      id: solicitacao.id,
      codigo: solicitacao.codigo,
      titulo: solicitacao.titulo,
      prioridade: solicitacao.prioridade,
      area: { id: solicitacao.area.id, nome: solicitacao.area.nome },
      solicitante: { id: solicitacao.solicitante.id, nome: solicitacao.solicitante.nome },
    };
  }

  function pertoDe(iso: unknown, referencia: string, toleranciaMs = 2_000): void {
    expect(iso).toEqual(expect.stringMatching(ISO_UTC));
    expect(Math.abs(Date.parse(iso as string) - Date.parse(referencia))).toBeLessThanOrEqual(
      toleranciaMs,
    );
  }

  describe('RN-14: aprovação', () => {
    it('RN-14: aprovar grava 1 SolicitacaoAprovada PENDENTE com o payload do contrato e o correlation_id da requisição', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      const requestId = novoRequestId('req-aprovacao');

      const resposta = await aprovar(carla, emAnalise.id, requestId).expect(200);
      const aprovada = resposta.body as Solicitacao;

      const eventos = await eventosDaSolicitacao(owner, emAnalise.id);
      expect(eventos).toHaveLength(1);
      const evento = eventos[0]!;
      expect(evento).toMatchObject({
        id: expect.stringMatching(UUID),
        tipo: 'SolicitacaoAprovada',
        agregado_id: emAnalise.id,
        status: 'PENDENTE',
        tentativas: 0,
        ultimo_erro: null,
        correlation_id: requestId,
        enviado_em: null,
      });
      // Pronto para o worker: a próxima tentativa já venceu
      expect(evento.proxima_tentativa_em.getTime()).toBeLessThanOrEqual(Date.now());

      expect(evento.payload).toEqual({
        id: evento.id,
        tipo: 'SolicitacaoAprovada',
        versao: 1,
        ocorridoEm: expect.stringMatching(ISO_UTC),
        correlationId: requestId,
        dados: {
          solicitacao: dadosDaSolicitacao(aprovada),
          decisao: {
            resultado: 'APROVADA',
            comentario: COMENTARIO,
            decididoEm: aprovada.decisao!.decididoEm,
            decididoPor: { id: carla.id, nome: carla.nome },
          },
        },
      });
      pertoDe(evento.payload.ocorridoEm, aprovada.decisao!.decididoEm);
    });

    it('RN-14: a aprovação pelo administrador também grava o evento, com ele como decididoPor', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });

      await aprovar(diego, emAnalise.id, novoRequestId('req-admin')).expect(200);

      const eventos = await eventosDaSolicitacao(owner, emAnalise.id);
      expect(eventos).toHaveLength(1);
      expect(eventos[0]!.payload).toMatchObject({
        tipo: 'SolicitacaoAprovada',
        dados: { decisao: { decididoPor: { id: diego.id, nome: diego.nome } } },
      });
    });

    it('RN-14: rejeitar não grava evento', async () => {
      const rejeitada = await solicitacaoEm(app, 'REJEITADA', { dono: ana, analista: carla });
      expect(rejeitada.status).toBe('REJEITADA');

      expect(await eventosDaSolicitacao(owner, rejeitada.id)).toEqual([]);
    });

    it('RN-14: criar, editar e iniciar análise não gravam evento', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });

      expect(await eventosDaSolicitacao(owner, emAnalise.id)).toEqual([]);
    });
  });

  describe('RN-17: reabertura', () => {
    it('RN-17: reabrir uma aprovada grava SolicitacaoReaberta com a decisão desfeita e a reabertura', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', { dono: ana, analista: carla });
      const requestId = novoRequestId('req-reabertura');

      const resposta = await reabrirCom(diego, aprovada.id, requestId).expect(200);
      const reaberta = resposta.body as Solicitacao;

      const eventos = await eventosDaSolicitacao(owner, aprovada.id);
      expect(eventos.map((evento) => evento.tipo)).toEqual([
        'SolicitacaoAprovada',
        'SolicitacaoReaberta',
      ]);
      const evento = eventos[1]!;
      expect(evento).toMatchObject({
        agregado_id: aprovada.id,
        status: 'PENDENTE',
        tentativas: 0,
        correlation_id: requestId,
        enviado_em: null,
      });
      expect(evento.criado_em.getTime()).toBeGreaterThanOrEqual(eventos[0]!.criado_em.getTime());

      expect(evento.payload).toEqual({
        id: evento.id,
        tipo: 'SolicitacaoReaberta',
        versao: 1,
        ocorridoEm: expect.stringMatching(ISO_UTC),
        correlationId: requestId,
        dados: {
          solicitacao: dadosDaSolicitacao(aprovada),
          decisao: {
            resultado: 'APROVADA',
            comentario: COMENTARIO,
            decididoEm: aprovada.decisao!.decididoEm,
            decididoPor: { id: carla.id, nome: carla.nome },
          },
          reabertura: {
            justificativa: JUSTIFICATIVA,
            reabertaEm: expect.stringMatching(ISO_UTC),
            reabertaPor: { id: diego.id, nome: diego.nome },
          },
        },
      });
      const dados = evento.payload.dados as { reabertura: { reabertaEm: string } };
      pertoDe(dados.reabertura.reabertaEm, reaberta.atualizadoEm);
      pertoDe(evento.payload.ocorridoEm, reaberta.atualizadoEm);
    });

    it('RN-17: reabrir uma rejeitada não grava evento', async () => {
      const rejeitada = await solicitacaoEm(app, 'REJEITADA', { dono: ana, analista: carla });

      await reabrirCom(diego, rejeitada.id, novoRequestId('req-reabre-rejeitada')).expect(200);

      expect(await eventosDaSolicitacao(owner, rejeitada.id)).toEqual([]);
    });

    it('RN-17: aprovar de novo depois da reabertura grava um novo SolicitacaoAprovada', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', { dono: ana, analista: carla });
      await reabrirCom(diego, aprovada.id, novoRequestId('req-reabre')).expect(200);
      await api(app, carla).post(`/solicitacoes/${aprovada.id}/analise`).send().expect(200);
      await aprovar(carla, aprovada.id, novoRequestId('req-reaprova')).expect(200);

      const eventos = await eventosDaSolicitacao(owner, aprovada.id);
      expect(eventos.map((evento) => evento.tipo)).toEqual([
        'SolicitacaoAprovada',
        'SolicitacaoReaberta',
        'SolicitacaoAprovada',
      ]);
      expect(new Set(eventos.map((evento) => evento.id)).size).toBe(3);
    });
  });

  describe('ADR-010: o evento só existe se a transação da mudança de status confirmar', () => {
    it('ADR-010: corrida entre duas aprovações (uma recebe 409) → um único evento, o da que venceu', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      const idCarla = novoRequestId('req-corrida-carla');
      const idDiego = novoRequestId('req-corrida-diego');

      const respostas = await Promise.all([
        aprovar(carla, emAnalise.id, idCarla),
        aprovar(diego, emAnalise.id, idDiego),
      ]);

      expect(ordenar(respostas.map((resposta) => resposta.status))).toEqual([200, 409]);
      const vencedor = respostas[0].status === 200 ? idCarla : idDiego;
      const eventos = await eventosDaSolicitacao(owner, emAnalise.id);
      expect(eventos).toHaveLength(1);
      expect(eventos[0]).toMatchObject({ tipo: 'SolicitacaoAprovada', correlation_id: vencedor });
    });

    it('ADR-010: se o COMMIT da aprovação falhar, nada fica gravado (nem a decisão, nem o evento)', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      expect(emAnalise.id).toMatch(UUID);

      // Gatilho adiado: dispara só no COMMIT, depois de todos os comandos da transação rodarem
      await owner.query(`
        CREATE OR REPLACE FUNCTION public.teste_falhar_no_commit() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha simulada no commit'; END $$`);
      await owner.query(`
        CREATE CONSTRAINT TRIGGER teste_falhar_no_commit
          AFTER INSERT ON solicitacao_historico
          DEFERRABLE INITIALLY DEFERRED
          FOR EACH ROW WHEN (NEW.solicitacao_id = '${emAnalise.id}'::uuid)
          EXECUTE FUNCTION public.teste_falhar_no_commit()`);
      // O 500 é esperado: o erro registrado pelo filtro é capturado, silenciado e conferido
      const requestId = novoRequestId('req-commit');
      const registro = capturarErroRegistrado(requestId);
      try {
        const resposta = await aprovar(carla, emAnalise.id, requestId);
        expect(resposta.status).toBe(500);
        expect(resposta.body).toMatchObject({ status: 500, code: 'ERRO_INTERNO', requestId });
        expect(resposta.text).not.toContain('falha simulada no commit');
      } finally {
        registro.restaurar();
        await owner.query('DROP TRIGGER IF EXISTS teste_falhar_no_commit ON solicitacao_historico');
        await owner.query('DROP FUNCTION IF EXISTS public.teste_falhar_no_commit()');
      }

      expect(registro.capturados()).toHaveLength(1);
      expect(registro.capturados()[0]).toEqual({
        contexto: 'ProblemDetailsFilter',
        dados: expect.objectContaining({ requestId, err: expect.anything() }),
      });

      expect(await eventosDaSolicitacao(owner, emAnalise.id)).toEqual([]);
      expect(await detalhe(app, carla, emAnalise.id)).toMatchObject({
        status: 'EM_ANALISE',
        decisao: null,
        integracao: null,
      });
    });
  });
});
