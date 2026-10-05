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
  iniciarAnalise,
  reabrir,
  type Sessao,
} from './api-solicitacoes';
import { adulterar, corrente, divergenciasDe, totaisDoHistorico, verificar } from './auditoria';
import { conectar } from './banco';

/*
 * Auditoria do histórico com hash encadeado (doc 16), parte 2: adulterações feitas direto no
 * banco (app_owner) e o que o GET /auditoria/integridade devolve. Banco próprio: as adulterações
 * se acumulam, então cada teste confere as divergências da própria solicitação e o limite de 20
 * fica por último.
 */
describe('RN-10: auditoria do histórico · adulteração detectada', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let ana: Sessao;
  let carla: Sessao;
  let diego: Sessao;
  const criadasNoTeste: string[] = [];

  beforeAll(async () => {
    const banco = await criarBancoComSeed('auditoria_adulteracao');
    owner = await conectar('owner', banco);
    app = await subirApi(banco, { OUTBOX_MAX_TENTATIVAS: '5' });
    ({ ana, carla, diego } = await entrarComSeed(app, ['ana', 'carla', 'diego'] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  /** Solicitação levada pela API até REABERTA: CRIADA, ANALISE_INICIADA, APROVADA, REABERTA. */
  async function cicloCompleto(): Promise<{ id: string; codigo: string }> {
    const criada = await criarSolicitacao(app, ana);
    await iniciarAnalise(app, carla, criada.id).expect(200);
    await decidir(app, carla, criada.id, 'APROVADA').expect(200);
    await reabrir(app, diego, criada.id).expect(200);
    criadasNoTeste.push(criada.id);
    return { id: criada.id, codigo: criada.codigo };
  }

  it('RN-10: antes de qualquer adulteração, o histórico verifica íntegro', async () => {
    await cicloCompleto();
    expect(await verificar(app, diego)).toMatchObject({
      integro: true,
      totalDivergencias: 0,
      divergencias: [],
    });
  });

  it('RN-10: comentário alterado direto no banco → CONTEUDO_ALTERADO naquele evento, com o código', async () => {
    const solicitacao = await cicloCompleto();
    const eventos = await corrente(owner, solicitacao.id);
    const aprovado = eventos.find((evento) => evento.tipo === 'APROVADA')!;
    const antes = await verificar(app, diego);

    const alterados = await adulterar(
      owner,
      'UPDATE solicitacao_historico SET comentario = $2 WHERE id = $1',
      [aprovado.id, 'Aprovado sem ressalvas (texto trocado depois).'],
    );
    expect(alterados).toBe(1);

    const depois = await verificar(app, diego);
    expect(depois.integro).toBe(false);
    expect(depois.totalDivergencias).toBe(antes.totalDivergencias + 1);
    expect(divergenciasDe(depois, solicitacao.id)).toEqual([
      {
        solicitacao: { id: solicitacao.id, codigo: solicitacao.codigo, excluida: false },
        eventoId: aprovado.id,
        tipo: 'APROVADA',
        criadoEm: expect.stringMatching(ISO_UTC),
        motivo: 'CONTEUDO_ALTERADO',
      },
    ]);
    const [divergencia] = divergenciasDe(depois, solicitacao.id);
    expect(Date.parse(divergencia!.criadoEm)).toBe(aprovado.criado_em.getTime());
  });

  it('RN-10: evento do meio apagado direto no banco → CORRENTE_QUEBRADA no evento seguinte', async () => {
    const solicitacao = await cicloCompleto();
    const eventos = await corrente(owner, solicitacao.id);
    const meio = eventos.findIndex((evento) => evento.tipo === 'ANALISE_INICIADA');
    const seguinte = eventos[meio + 1]!;
    const antes = await verificar(app, diego);

    const apagados = await adulterar(owner, 'DELETE FROM solicitacao_historico WHERE id = $1', [
      eventos[meio]!.id,
    ]);
    expect(apagados).toBe(1);

    const depois = await verificar(app, diego);
    expect(depois.integro).toBe(false);
    expect(depois.totalDivergencias).toBe(antes.totalDivergencias + 1);
    expect(divergenciasDe(depois, solicitacao.id)).toEqual([
      {
        solicitacao: { id: solicitacao.id, codigo: solicitacao.codigo, excluida: false },
        eventoId: seguinte.id,
        tipo: seguinte.tipo,
        criadoEm: expect.stringMatching(ISO_UTC),
        motivo: 'CORRENTE_QUEBRADA',
      },
    ]);
    expect(depois.eventosVerificados).toBe(antes.eventosVerificados - 1);
  });

  it('RN-09 / RN-10: solicitação excluída logicamente entra na verificação, marcada como excluida', async () => {
    const criada = await criarSolicitacao(app, ana);
    criadasNoTeste.push(criada.id);
    await api(app, ana).delete(`/solicitacoes/${criada.id}`).expect(204);
    const excluida = await owner.query<{ excluido_em: Date | null }>(
      'SELECT excluido_em FROM solicitacoes WHERE id = $1',
      [criada.id],
    );
    expect(excluida.rows[0]!.excluido_em).toEqual(expect.any(Date));
    const eventos = await corrente(owner, criada.id);
    expect(eventos.map((evento) => evento.tipo)).toEqual(['CRIADA', 'EXCLUIDA']);

    const antes = await verificar(app, diego);
    const totais = await totaisDoHistorico(owner);
    expect(antes.eventosVerificados).toBe(totais.eventos);
    expect(antes.solicitacoesVerificadas).toBe(totais.solicitacoes);
    expect(divergenciasDe(antes, criada.id)).toEqual([]);

    await adulterar(owner, 'UPDATE solicitacao_historico SET comentario = $2 WHERE id = $1', [
      eventos[0]!.id,
      'Comentário que não existia na criação.',
    ]);

    const depois = await verificar(app, diego);
    expect(depois.totalDivergencias).toBe(antes.totalDivergencias + 1);
    expect(divergenciasDe(depois, criada.id)).toEqual([
      expect.objectContaining({
        solicitacao: { id: criada.id, codigo: criada.codigo, excluida: true },
        eventoId: eventos[0]!.id,
        tipo: 'CRIADA',
        motivo: 'CONTEUDO_ALTERADO',
      }),
    ]);
  });

  it('RN-10: no máximo 20 divergências, da mais antiga para a mais recente, com o total real', async () => {
    const antes = await verificar(app, diego);
    // Adultera todos os eventos do seed (os mais antigos do banco), sem tocar nos criados acima.
    const alterados = await adulterar(
      owner,
      `UPDATE solicitacao_historico
          SET comentario = coalesce(comentario, '') || ' (adulterado)'
        WHERE NOT (solicitacao_id = ANY($1::uuid[]))`,
      [criadasNoTeste],
    );
    expect(alterados).toBeGreaterThan(20);

    const depois = await verificar(app, diego);
    expect(depois.integro).toBe(false);
    expect(depois.totalDivergencias).toBe(antes.totalDivergencias + alterados);
    expect(depois.divergencias).toHaveLength(20);

    const datas = depois.divergencias.map((item) => Date.parse(item.criadoEm));
    expect(datas).toEqual([...datas].sort((a, b) => a - b));

    const maisAntigos = await owner.query<{ id: string }>(
      `SELECT id FROM solicitacao_historico
        WHERE NOT (solicitacao_id = ANY($1::uuid[]))
        ORDER BY criado_em, id LIMIT 20`,
      [criadasNoTeste],
    );
    expect(depois.divergencias.map((item) => item.eventoId)).toEqual(
      maisAntigos.rows.map((linha) => linha.id),
    );
    for (const item of depois.divergencias) {
      expect(item.motivo).toBe('CONTEUDO_ALTERADO');
    }
  });
});
