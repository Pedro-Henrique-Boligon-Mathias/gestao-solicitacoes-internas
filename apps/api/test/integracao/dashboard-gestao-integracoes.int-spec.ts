import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import { EMAILS_SEED, entrarComSeed, type Sessao } from './api-solicitacoes';
import { conectar } from './banco';
import {
  HORA,
  areasDoSeed,
  diasAtras,
  formatarCodigo,
  gestao,
  inserirComHistorico,
  limparSolicitacoes,
} from './dashboard-gestao';
import { inserirEvento, type CamposEvento } from './outbox';

const MAX_TENTATIVAS = 5;

/*
 * PR 4C · Integrações com falha (ADR-010, RN-14/RN-17): solicitações cujo evento em foco está
 * FALHOU, da mais recente para a mais antiga, até 20. Evento em foco = o mais antigo ainda não
 * ENVIADO (ou o mais recente, se todos foram enviados). Banco próprio com o seed; cada teste apaga
 * solicitações e outbox e grava os eventos direto na outbox (app_owner).
 */
describe('RN-14: GET /dashboard/gestao · integracoesComFalha', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let diego: Sessao;
  let ana: { id: string; nome: string };
  let carlaId: string;
  let area: { id: string; nome: string };

  beforeAll(async () => {
    const banco = await criarBancoComSeed('gestao_integracoes');
    owner = await conectar('owner', banco);
    app = await subirApi(banco, { OUTBOX_MAX_TENTATIVAS: String(MAX_TENTATIVAS) });
    ({ diego } = await entrarComSeed(app, ['diego'] as const));
    const linhas = await owner.query<{ email: string; id: string; nome: string }>(
      'SELECT email, id, nome FROM usuarios WHERE email = ANY($1)',
      [[EMAILS_SEED.ana, EMAILS_SEED.carla]],
    );
    const porEmail = new Map(linhas.rows.map((linha) => [linha.email, linha]));
    ana = { id: porEmail.get(EMAILS_SEED.ana)!.id, nome: porEmail.get(EMAILS_SEED.ana)!.nome };
    carlaId = porEmail.get(EMAILS_SEED.carla)!.id;
    area = { id: (await areasDoSeed(owner)).Financeiro!, nome: 'Financeiro' };
  });

  beforeEach(async () => {
    await limparSolicitacoes(owner);
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  /** Solicitação aprovada por Carla, com os eventos de outbox informados (em ordem). */
  async function aprovadaCom(
    eventos: CamposEvento[],
    titulo = 'Acesso aprovado com integração',
  ): Promise<{ id: string; codigo: number; eventos: string[] }> {
    const criada = await inserirComHistorico(owner, {
      solicitanteId: ana.id,
      areaId: area.id,
      status: 'APROVADA',
      analistaId: carlaId,
      decisorId: carlaId,
      titulo,
      eventos: [
        { tipo: 'CRIADA', em: diasAtras(5) },
        { tipo: 'ANALISE_INICIADA', em: diasAtras(4) },
        { tipo: 'APROVADA', em: diasAtras(3) },
      ],
    });
    const ids: string[] = [];
    for (const campos of eventos) ids.push(await inserirEvento(owner, criada.id, campos));
    return { ...criada, eventos: ids };
  }

  const falhou = (criadoEm: Date, extra: CamposEvento = {}): CamposEvento => ({
    status: 'FALHOU',
    tentativas: MAX_TENTATIVAS,
    ultimo_erro: 'Sistema externo respondeu 503',
    criado_em: criadoEm,
    ...extra,
  });

  async function definirUltimaTentativa(eventoId: string, em: Date): Promise<void> {
    await owner.query('UPDATE outbox_eventos SET ultima_tentativa_em = $2 WHERE id = $1', [
      eventoId,
      em,
    ]);
  }

  it('RN-14: integracoesComFalha só com evento em foco FALHOU', async () => {
    const t = (horas: number) => new Date(Date.now() - horas * HORA);
    const s1 = await aprovadaCom([falhou(t(10))]);
    const s2 = await aprovadaCom([
      { status: 'ENVIADO', tentativas: 1, criado_em: t(12), enviado_em: t(11.5) },
      falhou(t(11)),
    ]);
    const s3 = await aprovadaCom([falhou(t(9)), { status: 'PENDENTE', criado_em: t(8) }]);
    await aprovadaCom([{ status: 'PENDENTE', criado_em: t(7) }]);
    await aprovadaCom([{ status: 'ENVIADO', tentativas: 1, criado_em: t(6), enviado_em: t(5.5) }]);
    // Foco é o PENDENTE mais antigo; o FALHOU atrás dele não define o status
    await aprovadaCom([{ status: 'PENDENTE', criado_em: t(5) }, falhou(t(4))]);

    const { integracoesComFalha } = await gestao(app, diego, 'tudo');
    expect(integracoesComFalha.map((linha) => linha.solicitacao.id).sort()).toEqual(
      [s1.id, s2.id, s3.id].sort(),
    );
  });

  it('RN-14: da mais recente para a mais antiga, limitado a 20', async () => {
    const criadas: string[] = [];
    for (let indice = 0; indice < 22; indice += 1) {
      const criadoEm = new Date(Date.now() - (indice + 1) * HORA);
      const s = await aprovadaCom([falhou(criadoEm)], `Acesso com falha número ${indice + 1}`);
      await definirUltimaTentativa(s.eventos[0]!, new Date(criadoEm.getTime() + HORA / 2));
      criadas.push(s.id);
    }
    const { integracoesComFalha } = await gestao(app, diego, 'tudo');
    expect(integracoesComFalha.map((linha) => linha.solicitacao.id)).toEqual(criadas.slice(0, 20));
  });

  it('RN-14: campos da linha, com maxTentativas do ambiente e ultimoErro cortado em 300 caracteres', async () => {
    const erroLongo = `HTTP 500: ${'x'.repeat(390)}`;
    const ultimaTentativa = new Date(Date.now() - 2 * HORA);
    const s = await aprovadaCom([falhou(diasAtras(1), { tentativas: 5, ultimo_erro: erroLongo })]);
    await definirUltimaTentativa(s.eventos[0]!, ultimaTentativa);

    const { integracoesComFalha } = await gestao(app, diego, 'tudo');
    expect(integracoesComFalha).toEqual([
      {
        solicitacao: {
          id: s.id,
          codigo: formatarCodigo(s.codigo),
          titulo: 'Acesso aprovado com integração',
          solicitante: ana,
          area,
        },
        tipo: 'SolicitacaoAprovada',
        tentativas: 5,
        maxTentativas: MAX_TENTATIVAS,
        ultimoErro: erroLongo.slice(0, 300),
        ultimaTentativaEm: ultimaTentativa.toISOString(),
      },
    ]);
  });

  it('RN-14: ultimoErro curto volta inteiro, e o bloco ignora o período (estado atual)', async () => {
    const s = await aprovadaCom([
      falhou(diasAtras(40), {
        tipo: 'SolicitacaoReaberta',
        tentativas: 3,
        ultimo_erro: 'HTTP 503',
      }),
    ]);
    for (const periodo of ['hoje', '7d', 'tudo'] as const) {
      const { integracoesComFalha } = await gestao(app, diego, periodo);
      expect(integracoesComFalha).toHaveLength(1);
      expect(integracoesComFalha[0]).toMatchObject({
        solicitacao: { id: s.id },
        tipo: 'SolicitacaoReaberta',
        tentativas: 3,
        maxTentativas: MAX_TENTATIVAS,
        ultimoErro: 'HTTP 503',
      });
    }
  });
});
