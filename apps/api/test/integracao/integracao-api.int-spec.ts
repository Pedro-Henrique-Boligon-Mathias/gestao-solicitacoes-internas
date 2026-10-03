import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  ISO_UTC,
  api,
  decidir,
  detalhe,
  entrarComSeed,
  esperarProblema,
  reabrir,
  reprocessar,
  solicitacaoEm,
  type Sessao,
  type Solicitacao,
} from './api-solicitacoes';
import { conectar } from './banco';
import { eventoPorId, eventosDaSolicitacao, type LinhaOutbox } from './outbox';

/** O mesmo valor do worker: a API lê OUTBOX_MAX_TENTATIVAS para mostrar "tentativa N de M". */
const MAX_TENTATIVAS = 5;

/*
 * Leitura da integração no detalhe e reprocessamento pelo Admin (ADR-010). Banco próprio deste
 * arquivo (migrations + seed). O que o worker faria (ENVIADO, FALHOU) é simulado com UPDATE direto
 * na outbox como app_owner.
 */
describe('ADR-010: integração no detalhe e reprocessamento', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let ana: Sessao;
  let bruno: Sessao;
  let carla: Sessao;
  let diego: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('integracao');
    owner = await conectar('owner', banco);
    app = await subirApi(banco, { OUTBOX_MAX_TENTATIVAS: String(MAX_TENTATIVAS) });
    ({ ana, bruno, carla, diego } = await entrarComSeed(app, [
      'ana',
      'bruno',
      'carla',
      'diego',
    ] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  const pessoas = () => ({ dono: ana, analista: carla });

  async function marcarEnviado(id: string, tentativas = 1): Promise<LinhaOutbox> {
    await owner.query(
      `UPDATE outbox_eventos SET status = 'ENVIADO', enviado_em = now(), tentativas = $2
        WHERE id = $1`,
      [id, tentativas],
    );
    return eventoPorId(owner, id);
  }

  async function marcarFalhou(id: string, tentativas = MAX_TENTATIVAS): Promise<LinhaOutbox> {
    await owner.query(
      `UPDATE outbox_eventos
          SET status = 'FALHOU', tentativas = $2, ultimo_erro = 'HTTP 503',
              proxima_tentativa_em = now() + interval '10 minutes'
        WHERE id = $1`,
      [id, tentativas],
    );
    return eventoPorId(owner, id);
  }

  /** Aprovada pela API e reaberta pelo Admin: dois eventos na outbox, em ordem. */
  async function aprovadaEReaberta(): Promise<{ id: string; eventos: LinhaOutbox[] }> {
    const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());
    await reabrir(app, diego, aprovada.id).expect(200);
    return { id: aprovada.id, eventos: await eventosDaSolicitacao(owner, aprovada.id) };
  }

  describe('GET /solicitacoes/:id → integracao', () => {
    it('ADR-010: integracao é null quando a solicitação não tem evento', async () => {
      const aberta = await solicitacaoEm(app, 'ABERTA', pessoas());
      const rejeitada = await solicitacaoEm(app, 'REJEITADA', pessoas());

      expect(aberta.integracao).toBeNull();
      expect((await detalhe(app, carla, aberta.id)).integracao).toBeNull();
      expect((await detalhe(app, carla, rejeitada.id)).integracao).toBeNull();
    });

    it('ADR-010: depois da aprovação, a resposta do comando e o detalhe trazem a integração PENDENTE', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', pessoas());

      const resposta = await decidir(app, carla, emAnalise.id).expect(200);
      const [evento] = await eventosDaSolicitacao(owner, emAnalise.id);

      const esperado = {
        status: 'PENDENTE',
        tipo: 'SolicitacaoAprovada',
        tentativas: 0,
        maxTentativas: MAX_TENTATIVAS,
        proximaTentativaEm: evento!.proxima_tentativa_em.toISOString(),
        enviadaEm: null,
        aguardando: 0,
        eventos: [
          {
            id: evento!.id,
            tipo: 'SolicitacaoAprovada',
            status: 'PENDENTE',
            tentativas: 0,
            criadoEm: evento!.criado_em.toISOString(),
            enviadaEm: null,
          },
        ],
      };
      expect((resposta.body as Solicitacao).integracao).toEqual(esperado);
      expect((await detalhe(app, carla, emAnalise.id)).integracao).toEqual(esperado);
    });

    it('ADR-010: evento ENVIADO aparece com enviadaEm e as tentativas usadas', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());
      const [evento] = await eventosDaSolicitacao(owner, aprovada.id);
      const enviado = await marcarEnviado(evento!.id, 2);

      const { integracao } = await detalhe(app, carla, aprovada.id);

      expect(integracao).toMatchObject({
        status: 'ENVIADO',
        tipo: 'SolicitacaoAprovada',
        tentativas: 2,
        maxTentativas: MAX_TENTATIVAS,
        enviadaEm: enviado.enviado_em!.toISOString(),
        aguardando: 0,
      });
      expect(integracao!.enviadaEm).toMatch(ISO_UTC);
      expect(integracao!.eventos).toEqual([
        expect.objectContaining({
          id: evento!.id,
          status: 'ENVIADO',
          tentativas: 2,
          enviadaEm: enviado.enviado_em!.toISOString(),
        }),
      ]);
    });

    it('ADR-010: com o primeiro ENVIADO, o evento em foco é o segundo; eventos fica em ordem cronológica', async () => {
      const { id, eventos } = await aprovadaEReaberta();
      const [aprovacao, reabertura] = eventos;
      const enviado = await marcarEnviado(aprovacao!.id);
      const falhou = await marcarFalhou(reabertura!.id);

      const { integracao } = await detalhe(app, diego, id);

      expect(integracao).toEqual({
        status: 'FALHOU',
        tipo: 'SolicitacaoReaberta',
        tentativas: MAX_TENTATIVAS,
        maxTentativas: MAX_TENTATIVAS,
        proximaTentativaEm: falhou.proxima_tentativa_em.toISOString(),
        enviadaEm: null,
        aguardando: 0,
        eventos: [
          {
            id: aprovacao!.id,
            tipo: 'SolicitacaoAprovada',
            status: 'ENVIADO',
            tentativas: 1,
            criadoEm: aprovacao!.criado_em.toISOString(),
            enviadaEm: enviado.enviado_em!.toISOString(),
          },
          {
            id: reabertura!.id,
            tipo: 'SolicitacaoReaberta',
            status: 'FALHOU',
            tentativas: MAX_TENTATIVAS,
            criadoEm: reabertura!.criado_em.toISOString(),
            enviadaEm: null,
          },
        ],
      });
    });

    it('ADR-010: aprovação em FALHOU com a reabertura PENDENTE atrás dela → foco na aprovação, aguardando 1; depois de reprocessar e enviar os dois, ENVIADO e aguardando 0', async () => {
      const { id, eventos } = await aprovadaEReaberta();
      const [aprovacao, reabertura] = eventos;
      const falhou = await marcarFalhou(aprovacao!.id);

      const travada = await detalhe(app, diego, id);
      expect(travada.integracao).toMatchObject({
        status: 'FALHOU',
        tipo: 'SolicitacaoAprovada',
        tentativas: MAX_TENTATIVAS,
        maxTentativas: MAX_TENTATIVAS,
        proximaTentativaEm: falhou.proxima_tentativa_em.toISOString(),
        enviadaEm: null,
        aguardando: 1,
      });
      expect(travada.integracao!.eventos.map((evento) => [evento.tipo, evento.status])).toEqual([
        ['SolicitacaoAprovada', 'FALHOU'],
        ['SolicitacaoReaberta', 'PENDENTE'],
      ]);
      expect(travada.acoesPermitidas).toContain('REPROCESSAR_INTEGRACAO');

      const reprocessada = (await reprocessar(app, diego, id).expect(200)).body as Solicitacao;
      expect(reprocessada.integracao).toMatchObject({
        status: 'PENDENTE',
        tipo: 'SolicitacaoAprovada',
        tentativas: 0,
        aguardando: 1,
      });
      expect(reprocessada.acoesPermitidas).not.toContain('REPROCESSAR_INTEGRACAO');

      // O worker envia os dois, na ordem
      await marcarEnviado(aprovacao!.id);
      const enviada = await marcarEnviado(reabertura!.id);

      const final = await detalhe(app, diego, id);
      expect(final.integracao).toMatchObject({
        status: 'ENVIADO',
        tipo: 'SolicitacaoReaberta',
        tentativas: 1,
        enviadaEm: enviada.enviado_em!.toISOString(),
        aguardando: 0,
      });
      expect(final.acoesPermitidas).not.toContain('REPROCESSAR_INTEGRACAO');
    });

    it('ADR-010: o detalhe não expõe payload, ultimo_erro nem correlation_id', async () => {
      const { id, eventos } = await aprovadaEReaberta();
      await marcarFalhou(eventos[1]!.id);

      const corpo = JSON.stringify(await detalhe(app, diego, id));

      expect(corpo).not.toContain('HTTP 503');
      expect(corpo).not.toContain('payload');
      expect(corpo).not.toMatch(/correlation/i);
      expect(corpo).not.toMatch(/ultimoErro|ultimo_erro/);
    });

    it('ADR-005: Ana (solicitante) vê a integração da própria solicitação', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());

      const { integracao } = await detalhe(app, ana, aprovada.id);

      expect(integracao).toMatchObject({ status: 'PENDENTE', tipo: 'SolicitacaoAprovada' });
      expect(integracao!.eventos).toHaveLength(1);
    });
  });

  describe('acoesPermitidas: REPROCESSAR_INTEGRACAO', () => {
    it('ADR-010: só o Admin, e só com o evento em foco em FALHOU', async () => {
      const { id, eventos } = await aprovadaEReaberta();
      expect((await detalhe(app, diego, id)).acoesPermitidas).not.toContain(
        'REPROCESSAR_INTEGRACAO',
      );

      // Primeiro enviado: o evento em foco passa a ser o segundo, que falhou
      await marcarEnviado(eventos[0]!.id);
      await marcarFalhou(eventos[1]!.id);

      expect((await detalhe(app, diego, id)).acoesPermitidas).toContain('REPROCESSAR_INTEGRACAO');
      expect((await detalhe(app, carla, id)).acoesPermitidas).not.toContain(
        'REPROCESSAR_INTEGRACAO',
      );
      expect((await detalhe(app, ana, id)).acoesPermitidas).not.toContain('REPROCESSAR_INTEGRACAO');
    });

    it('ADR-010: com tudo ENVIADO, o Admin não vê o reprocessamento', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());
      const [evento] = await eventosDaSolicitacao(owner, aprovada.id);
      await marcarEnviado(evento!.id);

      expect((await detalhe(app, diego, aprovada.id)).acoesPermitidas).toEqual(['REABRIR']);
    });
  });

  describe('POST /solicitacoes/:id/integracao/reprocessamento', () => {
    it('ADR-010: Admin com evento em FALHOU → 200, o evento volta para PENDENTE com tentativas 0', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());
      const [evento] = await eventosDaSolicitacao(owner, aprovada.id);
      await marcarFalhou(evento!.id);

      const resposta = await reprocessar(app, diego, aprovada.id).expect(200);
      const corpo = resposta.body as Solicitacao;

      expect(corpo.id).toBe(aprovada.id);
      expect(corpo.integracao).toMatchObject({
        status: 'PENDENTE',
        tipo: 'SolicitacaoAprovada',
        tentativas: 0,
        maxTentativas: MAX_TENTATIVAS,
        enviadaEm: null,
        aguardando: 0,
      });
      expect(corpo.acoesPermitidas).not.toContain('REPROCESSAR_INTEGRACAO');

      const linha = await eventoPorId(owner, evento!.id);
      expect(linha).toMatchObject({ status: 'PENDENTE', tentativas: 0, enviado_em: null });
      // Volta para a fila já: o worker pega no próximo ciclo
      expect(linha.proxima_tentativa_em.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
      // O payload e o correlation_id continuam os mesmos (mesma chave de idempotência)
      expect(linha.payload).toEqual(evento!.payload);
      expect(linha.correlation_id).toBe(evento!.correlation_id);
    });

    it('ADR-010: com dois eventos em FALHOU, só o mais antigo volta para PENDENTE', async () => {
      const { id, eventos } = await aprovadaEReaberta();
      const [aprovacao, reabertura] = eventos;
      await marcarFalhou(aprovacao!.id);
      await marcarFalhou(reabertura!.id);

      const corpo = (await reprocessar(app, diego, id).expect(200)).body as Solicitacao;

      // Foco na aprovação (agora PENDENTE), com a reabertura não enviada atrás dela
      expect(corpo.integracao).toMatchObject({
        status: 'PENDENTE',
        tipo: 'SolicitacaoAprovada',
        aguardando: 1,
      });

      expect(await eventoPorId(owner, aprovacao!.id)).toMatchObject({
        status: 'PENDENTE',
        tentativas: 0,
      });
      expect(await eventoPorId(owner, reabertura!.id)).toMatchObject({
        status: 'FALHOU',
        tentativas: MAX_TENTATIVAS,
      });
    });

    it.each([
      ['ANALISTA', () => carla],
      ['SOLICITANTE dono', () => ana],
    ])('ADR-010: %s → 403 ACESSO_NEGADO, sem mudar a outbox', async (_cargo, sessao) => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());
      const [evento] = await eventosDaSolicitacao(owner, aprovada.id);
      const antes = await marcarFalhou(evento!.id);

      esperarProblema(await reprocessar(app, sessao(), aprovada.id), 403, 'ACESSO_NEGADO');

      expect(await eventoPorId(owner, evento!.id)).toEqual(antes);
    });

    it('ADR-010: sem evento em FALHOU (só PENDENTE) → 409 TRANSICAO_INVALIDA', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());
      const [evento] = await eventosDaSolicitacao(owner, aprovada.id);

      esperarProblema(await reprocessar(app, diego, aprovada.id), 409, 'TRANSICAO_INVALIDA');

      expect(await eventoPorId(owner, evento!.id)).toEqual(evento);
    });

    it('ADR-010: sem evento nenhum → 409 TRANSICAO_INVALIDA', async () => {
      const aberta = await solicitacaoEm(app, 'ABERTA', pessoas());

      esperarProblema(await reprocessar(app, diego, aberta.id), 409, 'TRANSICAO_INVALIDA');
    });

    it('ADR-010: evento já ENVIADO → 409 TRANSICAO_INVALIDA', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());
      const [evento] = await eventosDaSolicitacao(owner, aprovada.id);
      await marcarEnviado(evento!.id);

      esperarProblema(await reprocessar(app, diego, aprovada.id), 409, 'TRANSICAO_INVALIDA');
    });

    it.each([
      ['inexistente', () => randomUUID()],
      ['com id que não é UUID', () => 'nao-e-uuid'],
    ])('RN-13: solicitação %s → 404 SOLICITACAO_NAO_ENCONTRADA', async (_caso, id) => {
      esperarProblema(await reprocessar(app, diego, id()), 404, 'SOLICITACAO_NAO_ENCONTRADA');
    });

    it('RN-13: solicitação invisível para quem chama (Bruno e a da Ana) → 404 antes do 403', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', pessoas());
      const [evento] = await eventosDaSolicitacao(owner, aprovada.id);
      await marcarFalhou(evento!.id);

      esperarProblema(
        await reprocessar(app, bruno, aprovada.id),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
    });

    it('sem token → 401', async () => {
      const resposta = await api(app).post(
        `/solicitacoes/${randomUUID()}/integracao/reprocessamento`,
      );
      expect(resposta.status).toBe(401);
    });
  });
});
