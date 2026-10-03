import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  COMENTARIO,
  ISO_UTC,
  JUSTIFICATIVA,
  api,
  criarSolicitacao,
  decidir,
  detalhe,
  entrarComSeed,
  esperarProblema,
  historico,
  iniciarAnalise,
  ordenar,
  reabrir,
  solicitacaoEm,
  type EventoHistorico,
  type Sessao,
  type Solicitacao,
} from './api-solicitacoes';
import { conectar } from './banco';

/*
 * Banco próprio deste arquivo (migrations + seed). Cada teste cria as próprias solicitações pela
 * API e só confere essas, então as 40 do seed não interferem. Login uma vez por usuário (o rate
 * limit é de 5 por minuto por e-mail).
 */
describe('Solicitações: criação, edição, exclusão e comandos', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let ana: Sessao;
  let carla: Sessao;
  let rafael: Sessao;
  let diego: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('comandos');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
    ({ ana, carla, rafael, diego } = await entrarComSeed(app, [
      'ana',
      'carla',
      'rafael',
      'diego',
    ] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  const comoAna = () => api(app, ana);

  function ultimoEvento(eventos: EventoHistorico[]): EventoHistorico {
    return eventos[eventos.length - 1]!;
  }

  describe('POST /solicitacoes', () => {
    it('RN-01: cria ABERTA com o solicitante, a área e a data do servidor → 201 com Location', async () => {
      const antes = Date.now();
      const resposta = await comoAna()
        .post('/solicitacoes')
        .send({
          titulo: '   Acesso ao sistema de cobrança   ',
          descricao:
            'Preciso de acesso de leitura ao módulo de cobrança para conciliar os boletos.',
          prioridade: 'ALTA',
        })
        .expect(201);
      const depois = Date.now();
      const corpo = resposta.body as Solicitacao;

      expect(resposta.headers.location).toBe(`/api/v1/solicitacoes/${corpo.id}`);
      expect(corpo).toEqual({
        id: expect.any(String),
        codigo: expect.stringMatching(/^SOL-\d{6,}$/),
        titulo: 'Acesso ao sistema de cobrança',
        descricao: 'Preciso de acesso de leitura ao módulo de cobrança para conciliar os boletos.',
        prioridade: 'ALTA',
        status: 'ABERTA',
        solicitante: { id: ana.id, nome: 'Ana Souza' },
        area: { id: ana.area.id, nome: 'Financeiro' },
        analista: null,
        decisao: null,
        dataSolicitacao: expect.stringMatching(ISO_UTC),
        atualizadoEm: expect.stringMatching(ISO_UTC),
        versao: 1,
        acoesPermitidas: expect.any(Array),
      });
      expect(ordenar(corpo.acoesPermitidas)).toEqual(['EDITAR', 'EXCLUIR']);
      const data = Date.parse(corpo.dataSolicitacao);
      expect(data).toBeGreaterThanOrEqual(antes - 1000);
      expect(data).toBeLessThanOrEqual(depois + 1000);

      // O código exibido é o sequencial gravado no banco
      const linha = await owner.query<{ codigo: number }>(
        'SELECT codigo FROM solicitacoes WHERE id = $1',
        [corpo.id],
      );
      expect(corpo.codigo).toBe(`SOL-${String(linha.rows[0]!.codigo).padStart(6, '0')}`);

      const eventos = await historico(app, ana, corpo.id);
      expect(eventos).toEqual([
        expect.objectContaining({
          tipo: 'CRIADA',
          statusAnterior: null,
          statusNovo: 'ABERTA',
          autor: { id: ana.id, nome: 'Ana Souza' },
        }),
      ]);
    });

    it('RN-01: ANALISTA também abre solicitação, com a área dele', async () => {
      const criada = await criarSolicitacao(app, carla);
      expect(criada).toMatchObject({
        status: 'ABERTA',
        solicitante: { id: carla.id, nome: 'Carla Mendes' },
        area: { id: carla.area.id, nome: 'Tecnologia' },
      });
    });

    it.each([
      ['status', { status: 'APROVADA' }],
      ['solicitanteId', { solicitanteId: '00000000-0000-4000-8000-000000000001' }],
      ['areaId', { areaId: '00000000-0000-4000-8000-000000000002' }],
      ['dataSolicitacao', { dataSolicitacao: '2020-01-01T00:00:00.000Z' }],
      ['analistaId', { analistaId: '00000000-0000-4000-8000-000000000003' }],
    ])('RN-01: %s no corpo → 400 DADOS_INVALIDOS', async (_campo, extra) => {
      const resposta = await comoAna()
        .post('/solicitacoes')
        .send({
          titulo: 'Acesso ao sistema de cobrança',
          descricao: 'Preciso de acesso de leitura ao módulo de cobrança.',
          prioridade: 'MEDIA',
          ...extra,
        });
      esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
      expect(resposta.body.errors).toEqual(expect.any(Array));
    });

    it.each([
      ['título com 4 caracteres', { titulo: 'Wifi' }],
      ['título com 4 caracteres e espaços', { titulo: '   Wifi   ' }],
      ['título com 121 caracteres', { titulo: 'a'.repeat(121) }],
      ['descrição com 9 caracteres', { descricao: 'a'.repeat(9) }],
      ['descrição com 5001 caracteres', { descricao: 'a'.repeat(5001) }],
      ['prioridade fora do enum', { prioridade: 'URGENTE' }],
      ['sem prioridade', { prioridade: undefined }],
    ])('RN-01: %s → 400 DADOS_INVALIDOS', async (_caso, campos) => {
      const resposta = await comoAna()
        .post('/solicitacoes')
        .send({
          titulo: 'Acesso ao sistema de cobrança',
          descricao: 'Preciso de acesso de leitura ao módulo de cobrança.',
          prioridade: 'MEDIA',
          ...campos,
        });
      esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
    });

    it.each([
      ['descrição só com 12 espaços', ' '.repeat(12)],
      ['descrição só com espaços, tabs e quebras', ' \t \n '.repeat(4)],
      ['descrição com 9 caracteres não brancos e espaços', '   abcdefghi   '],
      ['descrição com 9 caracteres não brancos separados por espaços', 'a b c d e f g h i'],
    ])('RF-01: %s → 400 DADOS_INVALIDOS e nada é criado', async (_caso, descricao) => {
      const titulo = `Pedido com descrição em branco ${randomUUID()}`;
      const resposta = await comoAna()
        .post('/solicitacoes')
        .send({ titulo, descricao, prioridade: 'MEDIA' });
      esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
      const linhas = await owner.query('SELECT id FROM solicitacoes WHERE titulo = $1', [titulo]);
      expect(linhas.rows).toEqual([]);
    });

    it('RF-01: descrição válida com espaços nas pontas é gravada sem trim', async () => {
      const descricao = '  descrição válida aqui  ';
      const criada = await criarSolicitacao(app, ana, { descricao });
      expect(criada.descricao).toBe(descricao);
      expect((await detalhe(app, ana, criada.id)).descricao).toBe(descricao);
    });

    it('sem token → 401', async () => {
      const resposta = await api(app).post('/solicitacoes').send({
        titulo: 'Acesso ao sistema de cobrança',
        descricao: 'Preciso de acesso de leitura ao módulo de cobrança.',
        prioridade: 'MEDIA',
      });
      expect(resposta.status).toBe(401);
    });
  });

  describe('GET /solicitacoes/:id', () => {
    it('id inexistente → 404 SOLICITACAO_NAO_ENCONTRADA', async () => {
      const resposta = await comoAna().get(`/solicitacoes/${randomUUID()}`);
      esperarProblema(resposta, 404, 'SOLICITACAO_NAO_ENCONTRADA');
    });

    it('id que não é UUID → 404 SOLICITACAO_NAO_ENCONTRADA', async () => {
      const resposta = await comoAna().get('/solicitacoes/nao-e-um-uuid');
      esperarProblema(resposta, 404, 'SOLICITACAO_NAO_ENCONTRADA');
    });

    it('sem token → 401', async () => {
      const criada = await criarSolicitacao(app, ana);
      expect((await api(app).get(`/solicitacoes/${criada.id}`)).status).toBe(401);
    });
  });

  describe('PATCH /solicitacoes/:id', () => {
    it('RN-03: status no corpo → 400 e o status não muda', async () => {
      const criada = await criarSolicitacao(app, ana);
      for (const corpo of [
        { status: 'APROVADA', versao: 1 },
        { titulo: 'Título novo e válido', status: 'APROVADA', versao: 1 },
      ]) {
        const resposta = await comoAna().patch(`/solicitacoes/${criada.id}`).send(corpo);
        esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
      }
      expect(await detalhe(app, ana, criada.id)).toMatchObject({ status: 'ABERTA', versao: 1 });
    });

    it.each([
      ['sem versao', { titulo: 'Título novo e válido' }],
      ['só com versao', { versao: 1 }],
      ['versao 0', { titulo: 'Título novo e válido', versao: 0 }],
      ['versao fracionária', { titulo: 'Título novo e válido', versao: 1.5 }],
      ['solicitanteId', { solicitanteId: randomUUID(), versao: 1 }],
      ['areaId', { areaId: randomUUID(), versao: 1 }],
      ['dataSolicitacao', { dataSolicitacao: '2020-01-01T00:00:00.000Z', versao: 1 }],
      ['título curto', { titulo: 'Wifi', versao: 1 }],
    ])('RN-02 / RN-03: PATCH %s → 400 DADOS_INVALIDOS', async (_caso, corpo) => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await comoAna().patch(`/solicitacoes/${criada.id}`).send(corpo);
      esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
    });

    it.each([
      ['descrição só com 12 espaços', ' '.repeat(12)],
      ['descrição só com espaços, tabs e quebras', ' \t \n '.repeat(4)],
      ['descrição com 9 caracteres não brancos e espaços', '   abcdefghi   '],
      ['descrição com 9 caracteres não brancos separados por espaços', 'a b c d e f g h i'],
    ])('RF-01: PATCH com %s → 400 DADOS_INVALIDOS e nada muda', async (_caso, descricao) => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await comoAna()
        .patch(`/solicitacoes/${criada.id}`)
        .send({ descricao, versao: 1 });
      esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
      expect(await detalhe(app, ana, criada.id)).toMatchObject({
        descricao: criada.descricao,
        versao: 1,
      });
    });

    it('RF-01: PATCH com descrição válida e espaços nas pontas grava sem trim', async () => {
      const criada = await criarSolicitacao(app, ana);
      const descricao = '  descrição válida aqui  ';
      const resposta = await comoAna()
        .patch(`/solicitacoes/${criada.id}`)
        .send({ descricao, versao: 1 })
        .expect(200);
      expect((resposta.body as Solicitacao).descricao).toBe(descricao);
      expect((await detalhe(app, ana, criada.id)).descricao).toBe(descricao);
    });

    it('RN-02: o dono edita a própria ABERTA → 200 com versao + 1', async () => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await comoAna()
        .patch(`/solicitacoes/${criada.id}`)
        .send({ titulo: 'Acesso de leitura ao sistema de cobrança', prioridade: 'ALTA', versao: 1 })
        .expect(200);
      expect(resposta.body).toMatchObject({
        id: criada.id,
        titulo: 'Acesso de leitura ao sistema de cobrança',
        prioridade: 'ALTA',
        descricao: criada.descricao,
        status: 'ABERTA',
        versao: 2,
      });
      expect(Date.parse((resposta.body as Solicitacao).atualizadoEm)).toBeGreaterThanOrEqual(
        Date.parse(criada.atualizadoEm),
      );
    });

    it('RN-02: o dono com EM_ANALISE → 409 EDICAO_BLOQUEADA', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      const resposta = await comoAna()
        .patch(`/solicitacoes/${emAnalise.id}`)
        .send({ titulo: 'Título novo e válido', versao: emAnalise.versao });
      esperarProblema(resposta, 409, 'EDICAO_BLOQUEADA');
    });

    it('RN-02: ADMIN edita a EM_ANALISE de outra pessoa → 200', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      const resposta = await api(app, diego)
        .patch(`/solicitacoes/${emAnalise.id}`)
        .send({
          descricao: 'Descrição ajustada pelo administrador do sistema.',
          versao: emAnalise.versao,
        })
        .expect(200);
      expect(resposta.body).toMatchObject({
        status: 'EM_ANALISE',
        descricao: 'Descrição ajustada pelo administrador do sistema.',
        analista: { id: carla.id },
        versao: emAnalise.versao + 1,
      });
    });

    it('RN-02: ANALISTA que não é o dono → 403 ACESSO_NEGADO', async () => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await api(app, carla)
        .patch(`/solicitacoes/${criada.id}`)
        .send({ titulo: 'Título novo e válido', versao: 1 });
      esperarProblema(resposta, 403, 'ACESSO_NEGADO');
    });

    it('RN-10: EDITADA guarda antes e depois só dos campos que mudaram', async () => {
      const criada = await criarSolicitacao(app, ana, { prioridade: 'BAIXA' });
      await comoAna()
        .patch(`/solicitacoes/${criada.id}`)
        .send({
          titulo: 'Acesso de leitura ao sistema de cobrança',
          descricao: criada.descricao,
          prioridade: 'ALTA',
          versao: 1,
        })
        .expect(200);

      const eventos = await historico(app, ana, criada.id);
      expect(eventos.map((evento) => evento.tipo)).toEqual(['CRIADA', 'EDITADA']);
      expect(ultimoEvento(eventos)).toMatchObject({
        autor: { id: ana.id, nome: 'Ana Souza' },
        dados: {
          titulo: { antes: criada.titulo, depois: 'Acesso de leitura ao sistema de cobrança' },
          prioridade: { antes: 'BAIXA', depois: 'ALTA' },
        },
      });
      expect(Object.keys(ultimoEvento(eventos).dados ?? {}).sort()).toEqual([
        'prioridade',
        'titulo',
      ]);
    });

    it('RN-10: PATCH sem mudança → 200, sem evento e sem incrementar a versao', async () => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await comoAna()
        .patch(`/solicitacoes/${criada.id}`)
        .send({ titulo: criada.titulo, prioridade: criada.prioridade, versao: 1 })
        .expect(200);
      expect(resposta.body).toMatchObject({ versao: 1 });
      expect((await historico(app, ana, criada.id)).map((evento) => evento.tipo)).toEqual([
        'CRIADA',
      ]);
    });

    it('RN-11: PATCH com versao antiga → 409 CONFLITO_DE_VERSAO e nada muda', async () => {
      const criada = await criarSolicitacao(app, ana);
      await comoAna()
        .patch(`/solicitacoes/${criada.id}`)
        .send({ titulo: 'Primeira edição do título', versao: 1 })
        .expect(200);

      const resposta = await comoAna()
        .patch(`/solicitacoes/${criada.id}`)
        .send({ titulo: 'Segunda edição do título', versao: 1 });
      esperarProblema(resposta, 409, 'CONFLITO_DE_VERSAO');
      expect(await detalhe(app, ana, criada.id)).toMatchObject({
        titulo: 'Primeira edição do título',
        versao: 2,
      });
    });
  });

  describe('DELETE /solicitacoes/:id', () => {
    it('RN-09 / P-15: o dono exclui a própria ABERTA → 204, exclusão lógica com EXCLUIDA', async () => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await comoAna().delete(`/solicitacoes/${criada.id}`);
      expect(resposta.status).toBe(204);

      const linha = await owner.query<{ excluido_em: Date | null; versao: number }>(
        'SELECT excluido_em, versao FROM solicitacoes WHERE id = $1',
        [criada.id],
      );
      expect(linha.rows[0]).toEqual({ excluido_em: expect.any(Date), versao: 2 });

      const eventos = await owner.query<{ tipo: string; autor_id: string }>(
        'SELECT tipo::text AS tipo, autor_id FROM solicitacao_historico WHERE solicitacao_id = $1 ORDER BY criado_em',
        [criada.id],
      );
      expect(eventos.rows).toEqual([
        { tipo: 'CRIADA', autor_id: ana.id },
        { tipo: 'EXCLUIDA', autor_id: ana.id },
      ]);
    });

    it('RN-09: ADMIN exclui a EM_ANALISE de outra pessoa → 204', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      expect((await api(app, diego).delete(`/solicitacoes/${emAnalise.id}`)).status).toBe(204);
      esperarProblema(
        await comoAna().get(`/solicitacoes/${emAnalise.id}`),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
    });

    it.each(['APROVADA', 'REJEITADA'] as const)(
      'RN-08 / RN-09: %s não é excluída nem pelo dono nem pelo ADMIN → 409 EDICAO_BLOQUEADA',
      async (status) => {
        const decidida = await solicitacaoEm(app, status, { dono: ana, analista: carla });
        esperarProblema(
          await comoAna().delete(`/solicitacoes/${decidida.id}`),
          409,
          'EDICAO_BLOQUEADA',
        );
        esperarProblema(
          await api(app, diego).delete(`/solicitacoes/${decidida.id}`),
          409,
          'EDICAO_BLOQUEADA',
        );
      },
    );

    it('RN-09: ANALISTA que não é o dono → 403 ACESSO_NEGADO', async () => {
      const criada = await criarSolicitacao(app, ana);
      esperarProblema(
        await api(app, carla).delete(`/solicitacoes/${criada.id}`),
        403,
        'ACESSO_NEGADO',
      );
    });

    it('RN-09: o dono com EM_ANALISE → 409 EDICAO_BLOQUEADA', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      esperarProblema(
        await comoAna().delete(`/solicitacoes/${emAnalise.id}`),
        409,
        'EDICAO_BLOQUEADA',
      );
    });
  });

  describe('POST /solicitacoes/:id/analise', () => {
    it('RN-04: ANALISTA inicia a análise de outra pessoa e vira o responsável', async () => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await iniciarAnalise(app, carla, criada.id).expect(200);
      expect(resposta.body).toMatchObject({
        id: criada.id,
        status: 'EM_ANALISE',
        analista: { id: carla.id, nome: 'Carla Mendes' },
        decisao: null,
      });

      expect(ultimoEvento(await historico(app, ana, criada.id))).toMatchObject({
        tipo: 'ANALISE_INICIADA',
        statusAnterior: 'ABERTA',
        statusNovo: 'EM_ANALISE',
        autor: { id: carla.id, nome: 'Carla Mendes' },
      });
    });

    it('RN-04: ADMIN também inicia a análise de outra pessoa', async () => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await iniciarAnalise(app, diego, criada.id).expect(200);
      expect(resposta.body).toMatchObject({ analista: { id: diego.id } });
    });

    it('RN-04: SOLICITANTE → 403 ACESSO_NEGADO', async () => {
      const criada = await criarSolicitacao(app, ana);
      esperarProblema(await iniciarAnalise(app, ana, criada.id), 403, 'ACESSO_NEGADO');
    });

    it.each(['EM_ANALISE', 'APROVADA', 'REJEITADA'] as const)(
      'RN-04: iniciar a análise de uma %s → 409 TRANSICAO_INVALIDA',
      async (status) => {
        const solicitacao = await solicitacaoEm(app, status, { dono: ana, analista: carla });
        esperarProblema(
          await iniciarAnalise(app, rafael, solicitacao.id),
          409,
          'TRANSICAO_INVALIDA',
        );
      },
    );

    it('RN-07: ANALISTA inicia a análise da própria → 403 SEGREGACAO_DE_FUNCOES', async () => {
      const propria = await criarSolicitacao(app, carla);
      esperarProblema(await iniciarAnalise(app, carla, propria.id), 403, 'SEGREGACAO_DE_FUNCOES');
    });
  });

  describe('POST /solicitacoes/:id/decisao', () => {
    it.each(['APROVADA', 'REJEITADA'] as const)(
      'RN-06: o analista responsável decide (%s) e a decisão grava resultado, autor e data',
      async (resultado) => {
        const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
        const antes = Date.now();
        const resposta = await decidir(app, carla, emAnalise.id, resultado, `  ${COMENTARIO}  `);
        const depois = Date.now();
        expect(resposta.status).toBe(200);

        const corpo = resposta.body as Solicitacao;
        expect(corpo).toMatchObject({
          status: resultado,
          analista: { id: carla.id },
          decisao: {
            resultado,
            comentario: COMENTARIO,
            decididoEm: expect.stringMatching(ISO_UTC),
            decididoPor: { id: carla.id, nome: 'Carla Mendes' },
          },
        });
        const decididoEm = Date.parse(corpo.decisao!.decididoEm);
        expect(decididoEm).toBeGreaterThanOrEqual(antes - 1000);
        expect(decididoEm).toBeLessThanOrEqual(depois + 1000);

        expect(ultimoEvento(await historico(app, ana, emAnalise.id))).toMatchObject({
          tipo: resultado,
          statusAnterior: 'EM_ANALISE',
          statusNovo: resultado,
          comentario: COMENTARIO,
          autor: { id: carla.id },
        });
      },
    );

    it.each([
      ['curto', 'Ok, feito'],
      ['com 9 caracteres e espaços nas pontas', '   123456789   '],
      ['vazio', ''],
    ])('RN-06: comentário %s → 400 DADOS_INVALIDOS', async (_caso, comentario) => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      esperarProblema(
        await decidir(app, carla, emAnalise.id, 'APROVADA', comentario),
        400,
        'DADOS_INVALIDOS',
      );
      expect(await detalhe(app, carla, emAnalise.id)).toMatchObject({ status: 'EM_ANALISE' });
    });

    it.each([
      ['resultado fora do enum', { resultado: 'CANCELADA', comentario: COMENTARIO }],
      ['sem resultado', { comentario: COMENTARIO }],
      ['campo desconhecido', { resultado: 'APROVADA', comentario: COMENTARIO, status: 'ABERTA' }],
    ])('RN-06: %s → 400 DADOS_INVALIDOS', async (_caso, corpo) => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      const resposta = await api(app, carla)
        .post(`/solicitacoes/${emAnalise.id}/decisao`)
        .send(corpo);
      esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
    });

    it('RN-05: outro analista (não responsável) → 403 ACESSO_NEGADO', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      esperarProblema(await decidir(app, rafael, emAnalise.id), 403, 'ACESSO_NEGADO');
    });

    it('RN-05: ADMIN decide sem ser o responsável: decidido_por = admin e o analista continua', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      const resposta = await decidir(app, diego, emAnalise.id, 'REJEITADA').expect(200);
      expect(resposta.body).toMatchObject({
        status: 'REJEITADA',
        analista: { id: carla.id, nome: 'Carla Mendes' },
        decisao: { resultado: 'REJEITADA', decididoPor: { id: diego.id, nome: 'Diego Alves' } },
      });

      const linha = await owner.query<{ analista_id: string; decidido_por_id: string }>(
        'SELECT analista_id, decidido_por_id FROM solicitacoes WHERE id = $1',
        [emAnalise.id],
      );
      expect(linha.rows[0]).toEqual({ analista_id: carla.id, decidido_por_id: diego.id });
    });

    it('RN-05: SOLICITANTE → 403 ACESSO_NEGADO', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      esperarProblema(await decidir(app, ana, emAnalise.id), 403, 'ACESSO_NEGADO');
    });

    it('RN-07: ADMIN decide a própria → 403 SEGREGACAO_DE_FUNCOES', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: diego, analista: carla });
      esperarProblema(await decidir(app, diego, emAnalise.id), 403, 'SEGREGACAO_DE_FUNCOES');
    });

    it('RN-03: decidir uma ABERTA → 409 TRANSICAO_INVALIDA com a explicação', async () => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await decidir(app, carla, criada.id);
      esperarProblema(resposta, 409, 'TRANSICAO_INVALIDA');
      expect(resposta.body.detail).toBe(
        'Uma solicitação com status Aberta não pode ser aprovada. Inicie a análise primeiro.',
      );
    });

    it.each(['APROVADA', 'REJEITADA'] as const)(
      'RN-08: decidir de novo uma %s → 409 TRANSICAO_INVALIDA (responsável e ADMIN)',
      async (status) => {
        const decidida = await solicitacaoEm(app, status, { dono: ana, analista: carla });
        esperarProblema(await decidir(app, carla, decidida.id), 409, 'TRANSICAO_INVALIDA');
        esperarProblema(await decidir(app, diego, decidida.id), 409, 'TRANSICAO_INVALIDA');
      },
    );

    it.each(['APROVADA', 'REJEITADA'] as const)(
      'RN-08: editar uma %s → 409 EDICAO_BLOQUEADA (dono e ADMIN)',
      async (status) => {
        const decidida = await solicitacaoEm(app, status, { dono: ana, analista: carla });
        for (const sessao of [ana, diego]) {
          const resposta = await api(app, sessao)
            .patch(`/solicitacoes/${decidida.id}`)
            .send({ titulo: 'Título novo e válido', versao: decidida.versao });
          esperarProblema(resposta, 409, 'EDICAO_BLOQUEADA');
        }
      },
    );
  });

  describe('POST /solicitacoes/:id/reabertura', () => {
    it('RN-16: ADMIN reabre uma APROVADA → ABERTA sem analista e sem decisão; REABERTA guarda a decisão anterior', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', { dono: ana, analista: carla });
      const resposta = await reabrir(app, diego, aprovada.id, `  ${JUSTIFICATIVA}  `).expect(200);
      expect(resposta.body).toMatchObject({
        id: aprovada.id,
        status: 'ABERTA',
        analista: null,
        decisao: null,
      });

      const linha = await owner.query(
        `SELECT status::text AS status, analista_id, decisao_comentario, decidido_em, decidido_por_id
           FROM solicitacoes WHERE id = $1`,
        [aprovada.id],
      );
      expect(linha.rows[0]).toEqual({
        status: 'ABERTA',
        analista_id: null,
        decisao_comentario: null,
        decidido_em: null,
        decidido_por_id: null,
      });

      expect(ultimoEvento(await historico(app, ana, aprovada.id))).toMatchObject({
        tipo: 'REABERTA',
        statusAnterior: 'APROVADA',
        statusNovo: 'ABERTA',
        comentario: JUSTIFICATIVA,
        autor: { id: diego.id, nome: 'Diego Alves' },
        dados: {
          decisaoAnterior: {
            resultado: 'APROVADA',
            comentario: COMENTARIO,
            decididoEm: aprovada.decisao!.decididoEm,
            decididoPor: { id: carla.id, nome: 'Carla Mendes' },
            analista: { id: carla.id, nome: 'Carla Mendes' },
          },
        },
      });
    });

    it('RN-16: ADMIN reabre uma REJEITADA e ela volta para a fila de análise', async () => {
      const rejeitada = await solicitacaoEm(app, 'REJEITADA', { dono: ana, analista: carla });
      await reabrir(app, diego, rejeitada.id).expect(200);
      await iniciarAnalise(app, rafael, rejeitada.id).expect(200);
      expect(await detalhe(app, ana, rejeitada.id)).toMatchObject({
        status: 'EM_ANALISE',
        analista: { id: rafael.id },
      });
    });

    it('RN-16: ANALISTA → 403 ACESSO_NEGADO', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', { dono: ana, analista: carla });
      esperarProblema(await reabrir(app, carla, aprovada.id), 403, 'ACESSO_NEGADO');
    });

    it('RN-16: SOLICITANTE dono → 403 ACESSO_NEGADO', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', { dono: ana, analista: carla });
      esperarProblema(await reabrir(app, ana, aprovada.id), 403, 'ACESSO_NEGADO');
    });

    it.each(['ABERTA', 'EM_ANALISE'] as const)(
      'RN-16: reabrir uma %s → 409 TRANSICAO_INVALIDA',
      async (status) => {
        const solicitacao = await solicitacaoEm(app, status, { dono: ana, analista: carla });
        esperarProblema(await reabrir(app, diego, solicitacao.id), 409, 'TRANSICAO_INVALIDA');
      },
    );

    it.each([
      ['curta', 'Revisar'],
      ['com 9 caracteres e espaços nas pontas', '   123456789   '],
    ])('RN-16: justificativa %s → 400 DADOS_INVALIDOS', async (_caso, justificativa) => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', { dono: ana, analista: carla });
      esperarProblema(
        await reabrir(app, diego, aprovada.id, justificativa),
        400,
        'DADOS_INVALIDOS',
      );
      expect(await detalhe(app, ana, aprovada.id)).toMatchObject({ status: 'APROVADA' });
    });

    it('RN-07: ADMIN reabre a própria → 403 SEGREGACAO_DE_FUNCOES', async () => {
      const propria = await solicitacaoEm(app, 'APROVADA', { dono: diego, analista: carla });
      esperarProblema(await reabrir(app, diego, propria.id), 403, 'SEGREGACAO_DE_FUNCOES');
    });
  });

  describe('RN-11: concorrência', () => {
    it('RN-11: duas decisões simultâneas → uma 200 e uma 409 TRANSICAO_INVALIDA', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      const respostas = await Promise.all([
        decidir(app, carla, emAnalise.id, 'APROVADA'),
        decidir(app, diego, emAnalise.id, 'REJEITADA'),
      ]);

      expect(ordenar(respostas.map((resposta) => resposta.status))).toEqual([200, 409]);
      esperarProblema(
        respostas.find((r) => r.status === 409)!,
        409,
        'TRANSICAO_INVALIDA',
      );

      const eventos = await historico(app, ana, emAnalise.id);
      expect(
        eventos.filter((evento) => evento.tipo === 'APROVADA' || evento.tipo === 'REJEITADA'),
      ).toHaveLength(1);
      const vencedora = respostas.find((r) => r.status === 200)!.body as Solicitacao;
      expect((await detalhe(app, ana, emAnalise.id)).status).toBe(vencedora.status);
    });

    it('RN-11: duas análises simultâneas → uma 200 e uma 409 TRANSICAO_INVALIDA', async () => {
      const criada = await criarSolicitacao(app, ana);
      const respostas = await Promise.all([
        iniciarAnalise(app, carla, criada.id),
        iniciarAnalise(app, rafael, criada.id),
      ]);

      expect(ordenar(respostas.map((resposta) => resposta.status))).toEqual([200, 409]);
      esperarProblema(
        respostas.find((r) => r.status === 409)!,
        409,
        'TRANSICAO_INVALIDA',
      );

      const eventos = await historico(app, ana, criada.id);
      expect(eventos.filter((evento) => evento.tipo === 'ANALISE_INICIADA')).toHaveLength(1);
      const vencedora = respostas.find((r) => r.status === 200)!.body as Solicitacao;
      expect((await detalhe(app, ana, criada.id)).analista).toEqual(vencedora.analista);
    });

    // Repetido algumas vezes para dar chance às duas ordens de chegada.
    const RODADAS = 5;

    async function linhaNoBanco(id: string) {
      const linha = await owner.query<{ status: string; excluido_em: Date | null; titulo: string }>(
        'SELECT status::text AS status, excluido_em, titulo FROM solicitacoes WHERE id = $1',
        [id],
      );
      const eventos = await owner.query<{ tipo: string }>(
        'SELECT tipo::text AS tipo FROM solicitacao_historico WHERE solicitacao_id = $1 ORDER BY criado_em, id',
        [id],
      );
      return { ...linha.rows[0]!, tipos: eventos.rows.map((evento) => evento.tipo) };
    }

    it('RN-11: excluir × decidir simultâneos → nunca os dois passam e o histórico confere com o estado', async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
        const [exclusao, decisao] = await Promise.all([
          api(app, diego).delete(`/solicitacoes/${emAnalise.id}`),
          decidir(app, carla, emAnalise.id, 'APROVADA'),
        ]);
        const banco = await linhaNoBanco(emAnalise.id);

        if (exclusao.status === 204) {
          // A exclusão venceu: a decisão não acha a solicitação ou encontra o estado mudado.
          expect([404, 409]).toContain(decisao.status);
          esperarProblema(
            decisao,
            decisao.status,
            decisao.status === 404 ? 'SOLICITACAO_NAO_ENCONTRADA' : 'TRANSICAO_INVALIDA',
          );
          expect(banco).toMatchObject({ status: 'EM_ANALISE', excluido_em: expect.any(Date) });
          expect(banco.tipos).toEqual(['CRIADA', 'ANALISE_INICIADA', 'EXCLUIDA']);
        } else {
          // A decisão venceu: a exclusão de uma APROVADA é bloqueada.
          expect({ exclusao: exclusao.status, decisao: decisao.status }).toEqual({
            exclusao: 409,
            decisao: 200,
          });
          esperarProblema(exclusao, 409, 'EDICAO_BLOQUEADA');
          expect(banco).toMatchObject({ status: 'APROVADA', excluido_em: null });
          expect(banco.tipos).toEqual(['CRIADA', 'ANALISE_INICIADA', 'APROVADA']);
        }
      }
    });

    it('RN-11: PATCH do dono × início da análise simultâneos → a edição nunca é aplicada depois da análise começar', async () => {
      for (let rodada = 0; rodada < RODADAS; rodada++) {
        const criada = await criarSolicitacao(app, ana);
        const tituloNovo = `Título editado durante a análise ${rodada}`;
        const [edicao, analise] = await Promise.all([
          comoAna().patch(`/solicitacoes/${criada.id}`).send({ titulo: tituloNovo, versao: 1 }),
          iniciarAnalise(app, carla, criada.id),
        ]);
        const banco = await linhaNoBanco(criada.id);

        expect(analise.status).toBe(200);
        expect(banco.status).toBe('EM_ANALISE');
        if (edicao.status === 200) {
          // A edição venceu: foi aplicada sobre a versão 1, antes da análise (que gera a 3).
          // A linha do tempo (ordenada por criado_em) precisa mostrar a mesma ordem.
          expect({
            edicao: (edicao.body as Solicitacao).versao,
            analise: (analise.body as Solicitacao).versao,
            edicaoStatus: (edicao.body as Solicitacao).status,
          }).toEqual({ edicao: 2, analise: 3, edicaoStatus: 'ABERTA' });
          expect(banco.titulo).toBe(tituloNovo);
          expect(banco.tipos).toEqual(['CRIADA', 'EDITADA', 'ANALISE_INICIADA']);
        } else {
          // A análise venceu: a edição do dono é bloqueada e nada dela fica gravado.
          expect(edicao.status).toBe(409);
          expect(['EDICAO_BLOQUEADA', 'CONFLITO_DE_VERSAO']).toContain(
            (edicao.body as { code?: string }).code,
          );
          esperarProblema(edicao, 409, (edicao.body as { code: string }).code);
          expect((analise.body as Solicitacao).versao).toBe(2);
          expect(banco.titulo).toBe(criada.titulo);
          expect(banco.tipos).toEqual(['CRIADA', 'ANALISE_INICIADA']);
        }
      }
    });
  });

  describe('acoesPermitidas no detalhe', () => {
    it('dono com ABERTA → [EDITAR, EXCLUIR]', async () => {
      const criada = await criarSolicitacao(app, ana);
      expect(ordenar((await detalhe(app, ana, criada.id)).acoesPermitidas)).toEqual([
        'EDITAR',
        'EXCLUIR',
      ]);
    });

    it('ANALISTA em ABERTA de outra pessoa → [INICIAR_ANALISE]', async () => {
      const criada = await criarSolicitacao(app, ana);
      expect((await detalhe(app, carla, criada.id)).acoesPermitidas).toEqual(['INICIAR_ANALISE']);
    });

    it('ADMIN em APROVADA de outra pessoa → [REABRIR]', async () => {
      const aprovada = await solicitacaoEm(app, 'APROVADA', { dono: ana, analista: carla });
      expect((await detalhe(app, diego, aprovada.id)).acoesPermitidas).toEqual(['REABRIR']);
    });

    it('EM_ANALISE: responsável → [DECIDIR]; outro analista → []; dono → []; ADMIN → [DECIDIR, EDITAR, EXCLUIR]', async () => {
      const emAnalise = await solicitacaoEm(app, 'EM_ANALISE', { dono: ana, analista: carla });
      expect((await detalhe(app, carla, emAnalise.id)).acoesPermitidas).toEqual(['DECIDIR']);
      expect((await detalhe(app, rafael, emAnalise.id)).acoesPermitidas).toEqual([]);
      expect((await detalhe(app, ana, emAnalise.id)).acoesPermitidas).toEqual([]);
      expect(ordenar((await detalhe(app, diego, emAnalise.id)).acoesPermitidas)).toEqual([
        'DECIDIR',
        'EDITAR',
        'EXCLUIR',
      ]);
    });

    it('a resposta de um comando já traz as ações do novo status', async () => {
      const criada = await criarSolicitacao(app, ana);
      const resposta = await iniciarAnalise(app, carla, criada.id).expect(200);
      expect((resposta.body as Solicitacao).acoesPermitidas).toEqual(['DECIDIR']);
    });
  });

  describe('GET /solicitacoes/:id/historico', () => {
    it('RN-10: ordem cronológica (mais antigo primeiro), com autor, no ciclo completo', async () => {
      const criada = await criarSolicitacao(app, ana);
      await comoAna()
        .patch(`/solicitacoes/${criada.id}`)
        .send({ prioridade: 'ALTA', versao: 1 })
        .expect(200);
      await iniciarAnalise(app, carla, criada.id).expect(200);
      await decidir(app, carla, criada.id, 'APROVADA').expect(200);
      await reabrir(app, diego, criada.id).expect(200);

      const eventos = await historico(app, ana, criada.id);
      expect(eventos.map((evento) => [evento.tipo, evento.autor.nome])).toEqual([
        ['CRIADA', 'Ana Souza'],
        ['EDITADA', 'Ana Souza'],
        ['ANALISE_INICIADA', 'Carla Mendes'],
        ['APROVADA', 'Carla Mendes'],
        ['REABERTA', 'Diego Alves'],
      ]);
      for (const evento of eventos) {
        expect(evento).toEqual({
          id: expect.any(String),
          tipo: expect.any(String),
          statusAnterior: evento.statusAnterior === null ? null : expect.any(String),
          statusNovo: evento.statusNovo === null ? null : expect.any(String),
          comentario: evento.comentario === null ? null : expect.any(String),
          autor: { id: expect.any(String), nome: expect.any(String) },
          dados: evento.dados === null ? null : expect.any(Object),
          criadoEm: expect.stringMatching(ISO_UTC),
        });
      }
      const datas = eventos.map((evento) => Date.parse(evento.criadoEm));
      expect(datas).toEqual([...datas].sort((a, b) => a - b));
    });

    it('id inexistente → 404 SOLICITACAO_NAO_ENCONTRADA', async () => {
      esperarProblema(
        await comoAna().get(`/solicitacoes/${randomUUID()}/historico`),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
    });

    it('comandos em id inexistente → 404 SOLICITACAO_NAO_ENCONTRADA', async () => {
      const id = randomUUID();
      esperarProblema(await iniciarAnalise(app, carla, id), 404, 'SOLICITACAO_NAO_ENCONTRADA');
      esperarProblema(await decidir(app, carla, id), 404, 'SOLICITACAO_NAO_ENCONTRADA');
      esperarProblema(await reabrir(app, diego, id), 404, 'SOLICITACAO_NAO_ENCONTRADA');
      esperarProblema(
        await api(app, diego).delete(`/solicitacoes/${id}`),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
      esperarProblema(
        await api(app, diego)
          .patch(`/solicitacoes/${id}`)
          .send({ titulo: 'Título válido', versao: 1 }),
        404,
        'SOLICITACAO_NAO_ENCONTRADA',
      );
    });
  });
});
