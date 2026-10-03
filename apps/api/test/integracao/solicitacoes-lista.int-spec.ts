import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { criarBancoComSeed, subirApi } from './api-http';
import {
  DIA,
  ISO_UTC,
  api,
  criarSolicitacao,
  definirData,
  entrarComSeed,
  entrarComSolicitanteNovo,
  esperarProblema,
  listar,
  solicitacaoEm,
  type ItemLista,
  type Sessao,
  type Solicitacao,
} from './api-solicitacoes';
import { conectar } from './banco';

/*
 * Banco próprio deste arquivo (migrations + seed). Os resultados exatos (filtros, ordenação,
 * paginação, busca) são conferidos com um solicitante criado pelo teste: pela regra de
 * visibilidade (RN-13), a lista dele só tem o que o teste criou, sem nada das 40 do seed.
 */
describe('GET /solicitacoes: busca, filtros, ordenação e paginação', () => {
  let app: INestApplication<App>;
  let owner: Client;
  let carla: Sessao;
  let rafael: Sessao;

  beforeAll(async () => {
    const banco = await criarBancoComSeed('lista');
    owner = await conectar('owner', banco);
    app = await subirApi(banco);
    ({ carla, rafael } = await entrarComSeed(app, ['carla', 'rafael'] as const));
  });

  afterAll(async () => {
    await app?.close();
    await owner?.end();
  });

  function ids(itens: ItemLista[]): string[] {
    return itens.map((item) => item.id);
  }

  describe('P-12: busca sem acento e por código', () => {
    let pessoa: Sessao;
    let cracha: Solicitacao;
    let monitor: Solicitacao;
    let reajuste: Solicitacao;

    beforeAll(async () => {
      pessoa = await entrarComSolicitanteNovo(app, owner);
      cracha = await criarSolicitacao(app, pessoa, {
        titulo: 'Solicitação de crachá provisório',
        descricao: 'Crachá perdido; preciso de um provisório para entrar no prédio.',
      });
      monitor = await criarSolicitacao(app, pessoa, {
        titulo: 'Troca do monitor da recepção',
        descricao: 'A tela pisca e escurece durante o atendimento ao público.',
      });
      reajuste = await criarSolicitacao(app, pessoa, {
        titulo: 'Reajuste de 10% no limite',
        descricao: 'Liberar o acesso ao cadastro de limites para o reajuste anual.',
      });
    });

    it.each([
      ['solicitacao', () => [cracha.id]],
      ['SOLICITAÇÃO', () => [cracha.id]],
      ['ACESSO', () => [reajuste.id]],
      ['recepcao', () => [monitor.id]],
      ['  cracha  ', () => [cracha.id]],
    ])('P-12: "%s" encontra ignorando maiúsculas e acentos', async (termo, esperado) => {
      const lista = await listar(app, pessoa, `q=${encodeURIComponent(termo)}`);
      expect(ids(lista.data)).toEqual(esperado());
    });

    it('P-12: termo ausente → lista vazia', async () => {
      const lista = await listar(app, pessoa, 'q=impressora');
      expect(lista).toMatchObject({ data: [], meta: { total: 0 } });
    });

    it('P-12: o código completo (SOL-000123), minúsculo (sol-123) e só o número encontram pelo código', async () => {
      const numero = Number(monitor.codigo.replace('SOL-', ''));
      for (const termo of [monitor.codigo, `sol-${numero}`, String(numero)]) {
        const lista = await listar(app, pessoa, `q=${encodeURIComponent(termo)}`);
        expect(ids(lista.data)).toEqual([monitor.id]);
      }
    });

    it('P-12: % e _ no termo são literais, não curingas', async () => {
      expect(ids((await listar(app, pessoa, `q=${encodeURIComponent('10%')}`)).data)).toEqual([
        reajuste.id,
      ]);
      for (const termo of ['o%e', 'r_c', '%%']) {
        const lista = await listar(app, pessoa, `q=${encodeURIComponent(termo)}`);
        expect(lista.meta.total).toBe(0);
      }
    });

    it.each(['a', '  a  '])('P-12: q com menos de 2 caracteres (%j) → 400', async (termo) => {
      const resposta = await api(app, pessoa).get(`/solicitacoes?q=${encodeURIComponent(termo)}`);
      esperarProblema(resposta, 400, 'DADOS_INVALIDOS');
    });
  });

  describe('RF-02: filtros, ordenação e paginação', () => {
    let pessoa: Sessao;
    /** Seis solicitações com datas conhecidas: s1 é a mais antiga das ABERTA, s6 a mais antiga de todas. */
    const s: Record<string, Solicitacao> = {};

    beforeAll(async () => {
      pessoa = await entrarComSolicitanteNovo(app, owner);
      const agora = Date.now();
      const plano = [
        ['s1', 'ABERTA', 'BAIXA', 5, carla],
        ['s2', 'ABERTA', 'ALTA', 1, carla],
        ['s3', 'EM_ANALISE', 'MEDIA', 3, carla],
        ['s4', 'APROVADA', 'ALTA', 4, carla],
        ['s5', 'ABERTA', 'ALTA', 2, carla],
        ['s6', 'REJEITADA', 'MEDIA', 6, rafael],
      ] as const;
      for (const [nome, status, prioridade, dias, analista] of plano) {
        const criada = await solicitacaoEm(app, status, { dono: pessoa, analista }, { prioridade });
        s[nome] = criada;
        await definirData(owner, criada.id, new Date(agora - dias * DIA));
      }
    });

    function nomes(itens: ItemLista[]): string[] {
      return itens.map((item) => Object.keys(s).find((nome) => s[nome]!.id === item.id) ?? item.id);
    }

    it('RF-02: o item da lista tem só os campos do contrato (ItemLista)', async () => {
      const lista = await listar(app, pessoa, 'status=EM_ANALISE');
      expect(lista.data).toEqual([
        {
          id: s.s3!.id,
          codigo: s.s3!.codigo,
          titulo: s.s3!.titulo,
          prioridade: 'MEDIA',
          status: 'EM_ANALISE',
          solicitante: { id: pessoa.id, nome: pessoa.nome },
          area: { id: pessoa.area.id, nome: 'Financeiro' },
          analista: { id: carla.id, nome: 'Carla Mendes' },
          dataSolicitacao: expect.stringMatching(ISO_UTC),
          atualizadoEm: expect.stringMatching(ISO_UTC),
        },
      ]);
    });

    it('RF-02: padrão = dataSolicitacao desc, page 1, pageSize 20', async () => {
      const lista = await listar(app, pessoa, '');
      expect(nomes(lista.data)).toEqual(['s2', 's5', 's3', 's4', 's1', 's6']);
      expect(lista.meta).toEqual({ page: 1, pageSize: 20, total: 6, totalPages: 1 });
    });

    it('RF-02: direcao=asc inverte a ordem por data', async () => {
      const lista = await listar(app, pessoa, 'direcao=asc');
      expect(nomes(lista.data)).toEqual(['s6', 's1', 's4', 's3', 's5', 's2']);
    });

    it('RF-02: vários status (status=ABERTA&status=EM_ANALISE)', async () => {
      const lista = await listar(app, pessoa, 'status=ABERTA&status=EM_ANALISE');
      expect(nomes(lista.data)).toEqual(['s2', 's5', 's3', 's1']);
    });

    it('RF-02: várias prioridades (prioridade=ALTA&prioridade=BAIXA)', async () => {
      const lista = await listar(app, pessoa, 'prioridade=ALTA&prioridade=BAIXA');
      expect(nomes(lista.data)).toEqual(['s2', 's5', 's4', 's1']);
    });

    it('RF-02: status e prioridade combinados', async () => {
      const lista = await listar(app, pessoa, 'status=ABERTA&prioridade=ALTA');
      expect(nomes(lista.data)).toEqual(['s2', 's5']);
    });

    it('RF-02: ordenarPor=prioridade → ALTA, MEDIA, BAIXA e, dentro, a mais antiga primeiro', async () => {
      const lista = await listar(app, pessoa, 'ordenarPor=prioridade');
      expect(nomes(lista.data)).toEqual(['s4', 's5', 's2', 's6', 's3', 's1']);
    });

    it('RF-02: ordenarPor=prioridade ignora a direcao', async () => {
      for (const direcao of ['asc', 'desc']) {
        const lista = await listar(app, pessoa, `ordenarPor=prioridade&direcao=${direcao}`);
        expect(nomes(lista.data)).toEqual(['s4', 's5', 's2', 's6', 's3', 's1']);
      }
    });

    it('RF-02: fila do dashboard (status=ABERTA&ordenarPor=prioridade)', async () => {
      const lista = await listar(app, pessoa, 'status=ABERTA&ordenarPor=prioridade');
      expect(nomes(lista.data)).toEqual(['s5', 's2', 's1']);
    });

    it('RF-02: analista=eu traz só as que têm o usuário atual como responsável', async () => {
      const daCarla = await listar(app, carla, 'analista=eu&pageSize=100');
      expect(daCarla.data.length).toBeGreaterThan(0);
      for (const item of daCarla.data) {
        expect(item.analista?.id).toBe(carla.id);
      }
      expect(ids(daCarla.data)).toEqual(expect.arrayContaining([s.s3!.id, s.s4!.id]));
      expect(ids(daCarla.data)).not.toContain(s.s6!.id);

      const contagem = await owner.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM solicitacoes WHERE analista_id = $1 AND excluido_em IS NULL',
        [carla.id],
      );
      expect(daCarla.meta.total).toBe(contagem.rows[0]!.total);

      expect((await listar(app, pessoa, 'analista=eu')).meta.total).toBe(0);
    });

    it('RF-02: analista=eu combinado com status (Minhas análises em andamento)', async () => {
      const lista = await listar(app, rafael, 'analista=eu&status=EM_ANALISE&pageSize=100');
      for (const item of lista.data) {
        expect(item).toMatchObject({ status: 'EM_ANALISE', analista: { id: rafael.id } });
      }
    });

    it('RF-02: paginação com meta correto', async () => {
      const pagina2 = await listar(app, pessoa, 'page=2&pageSize=2');
      expect(nomes(pagina2.data)).toEqual(['s3', 's4']);
      expect(pagina2.meta).toEqual({ page: 2, pageSize: 2, total: 6, totalPages: 3 });

      const pagina3 = await listar(app, pessoa, 'page=3&pageSize=4');
      expect(pagina3).toEqual({
        data: [],
        meta: { page: 3, pageSize: 4, total: 6, totalPages: 2 },
      });
    });

    it('RF-02: sem resultado → totalPages 0 e data vazia', async () => {
      const lista = await listar(app, pessoa, 'status=REJEITADA&prioridade=ALTA');
      expect(lista).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });

    it('RF-02: pageSize=100 é aceito', async () => {
      expect((await listar(app, pessoa, 'pageSize=100')).meta.pageSize).toBe(100);
    });

    it.each([
      'pageSize=101',
      'pageSize=0',
      'page=0',
      'page=abc',
      'status=CANCELADA',
      'prioridade=URGENTE',
      'ordenarPor=titulo',
      'direcao=cima',
      'analista=outro',
    ])('RF-02: %s → 400 DADOS_INVALIDOS', async (query) => {
      esperarProblema(await api(app, pessoa).get(`/solicitacoes?${query}`), 400, 'DADOS_INVALIDOS');
    });

    it('sem token → 401', async () => {
      expect((await api(app).get('/solicitacoes')).status).toBe(401);
    });
  });

  describe('Filtro por área (area=<id>, pode repetir)', () => {
    const areas: Record<string, string> = {};

    beforeAll(async () => {
      const resultado = await owner.query<{ id: string; nome: string }>(
        'SELECT id, nome FROM areas',
      );
      for (const area of resultado.rows) areas[area.nome] = area.id;
    });

    /** Quantas solicitações não excluídas existem nessas áreas (app_owner, sem RLS). */
    async function totalNoBanco(areaIds: string[]): Promise<number> {
      const resultado = await owner.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM solicitacoes
          WHERE excluido_em IS NULL AND area_id = ANY($1::uuid[])`,
        [areaIds],
      );
      return resultado.rows[0]!.total;
    }

    it('RF-02: area=<id> traz só as solicitações da área, com o total do banco', async () => {
      const financeiro = areas['Financeiro']!;
      const lista = await listar(app, carla, `area=${financeiro}&pageSize=100`);

      expect(lista.meta.total).toBe(await totalNoBanco([financeiro]));
      expect(lista.meta.total).toBeGreaterThan(0);
      expect(new Set(lista.data.map((item) => item.area.id))).toEqual(new Set([financeiro]));
    });

    it('RF-02: area repetida (area=A&area=B) traz as das duas áreas', async () => {
      const ids = [areas['Financeiro']!, areas['Tecnologia']!];
      const lista = await listar(app, carla, `area=${ids[0]}&area=${ids[1]}&pageSize=100`);

      expect(lista.meta.total).toBe(await totalNoBanco(ids));
      expect(lista.data.every((item) => ids.includes(item.area.id))).toBe(true);
      expect(new Set(lista.data.map((item) => item.area.id)).size).toBe(2);
    });

    it('RF-02: area combinada com status', async () => {
      const financeiro = areas['Financeiro']!;
      const lista = await listar(app, carla, `area=${financeiro}&status=APROVADA&pageSize=100`);

      expect(
        lista.data.every((item) => item.area.id === financeiro && item.status === 'APROVADA'),
      ).toBe(true);
    });

    it('RN-13: o solicitante filtrando por área continua vendo só as próprias', async () => {
      const pessoa = await entrarComSolicitanteNovo(app, owner);
      const minha = await criarSolicitacao(app, pessoa);

      const lista = await listar(app, pessoa, `area=${minha.area.id}`);

      expect(lista.data.map((item) => item.id)).toEqual([minha.id]);
    });

    it.each(['area=abc', 'area=123', `area=${encodeURIComponent('Financeiro')}`])(
      'RF-02: %s (não é UUID) → 400 DADOS_INVALIDOS',
      async (query) => {
        esperarProblema(
          await api(app, carla).get(`/solicitacoes?${query}`),
          400,
          'DADOS_INVALIDOS',
        );
      },
    );
  });
});
