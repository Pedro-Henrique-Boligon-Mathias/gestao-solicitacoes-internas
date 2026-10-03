// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problema, solicitacao } from '@/test/fabricas';

vi.mock('server-only', () => ({}));

/** Cookie de sessão presente: as actions chamam a API em nome de quem está logado. */
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nome: string) =>
      nome === 'sessao_access' ? { name: nome, value: 'access-atual' } : undefined,
    has: (nome: string) => nome === 'sessao_access',
    getAll: () => [{ name: 'sessao_access', value: 'access-atual' }],
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: async () => new Headers({ 'user-agent': 'navegador-de-teste' }),
}));

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/cache', () => cache);

/** O redirect do Next interrompe a action lançando um erro; aqui ele guarda o destino. */
class Redirecionado extends Error {
  constructor(readonly destino: string) {
    super(`NEXT_REDIRECT ${destino}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Redirecionado(destino);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

interface ChamadaApi {
  url: string;
  caminho: string;
  metodo: string;
  autorizacao: string | null;
  corpo: unknown;
}

function apiResponde(status: number, corpo?: unknown): ChamadaApi[] {
  const chamadas: ChamadaApi[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const req = entrada instanceof Request ? entrada : new Request(entrada, init);
      const texto = await req.text();
      chamadas.push({
        url: req.url,
        caminho: new URL(req.url).pathname,
        metodo: req.method,
        autorizacao: req.headers.get('Authorization'),
        corpo: texto ? JSON.parse(texto) : null,
      });
      return corpo === undefined
        ? new Response(null, { status })
        : Response.json(corpo, {
            status,
            headers: status >= 400 ? { 'Content-Type': 'application/problem+json' } : {},
          });
    }),
  );
  return chamadas;
}

async function carregar() {
  vi.resetModules();
  return import('./actions');
}

/** Roda a action e devolve o destino do redirect (ou o retorno, se não redirecionou). */
async function executar<T>(acao: () => Promise<T>): Promise<{ destino?: string; retorno?: T }> {
  try {
    return { retorno: await acao() };
  } catch (erro) {
    if (erro instanceof Redirecionado) return { destino: erro.destino };
    throw erro;
  }
}

const ID = 'c0000000-0000-4000-8000-000000000042';
const DETALHE = solicitacao({ id: ID });
const CAMINHOS_REVALIDADOS = [`/solicitacoes/${ID}`, '/solicitacoes', '/dashboard'];

type Actions = Awaited<ReturnType<typeof carregar>>;

/** Cada action, o que ela envia à API e o status de sucesso. */
const CASOS: {
  nome: string;
  chamar: (a: Actions) => Promise<unknown>;
  metodo: string;
  caminho: string;
  corpo: unknown;
  sucesso: number;
  devolveSolicitacao: boolean;
}[] = [
  {
    nome: 'criarSolicitacao',
    chamar: (a) =>
      a.criarSolicitacao({
        titulo: 'Acesso ao sistema de folha',
        descricao: 'Preciso de acesso para fechar o mês.',
        prioridade: 'ALTA',
      }),
    metodo: 'POST',
    caminho: '/api/v1/solicitacoes',
    corpo: {
      titulo: 'Acesso ao sistema de folha',
      descricao: 'Preciso de acesso para fechar o mês.',
      prioridade: 'ALTA',
    },
    sucesso: 201,
    devolveSolicitacao: true,
  },
  {
    nome: 'editarSolicitacao',
    chamar: (a) =>
      a.editarSolicitacao(ID, {
        titulo: 'Novo título',
        descricao: 'Nova descrição detalhada.',
        prioridade: 'BAIXA',
        versao: 3,
      }),
    metodo: 'PATCH',
    caminho: `/api/v1/solicitacoes/${ID}`,
    corpo: {
      titulo: 'Novo título',
      descricao: 'Nova descrição detalhada.',
      prioridade: 'BAIXA',
      versao: 3,
    },
    sucesso: 200,
    devolveSolicitacao: true,
  },
  {
    nome: 'excluirSolicitacao',
    chamar: (a) => a.excluirSolicitacao(ID),
    metodo: 'DELETE',
    caminho: `/api/v1/solicitacoes/${ID}`,
    corpo: null,
    sucesso: 204,
    devolveSolicitacao: false,
  },
  {
    nome: 'iniciarAnalise',
    chamar: (a) => a.iniciarAnalise(ID),
    metodo: 'POST',
    caminho: `/api/v1/solicitacoes/${ID}/analise`,
    corpo: null,
    sucesso: 200,
    devolveSolicitacao: true,
  },
  {
    nome: 'decidirSolicitacao',
    chamar: (a) =>
      a.decidirSolicitacao(ID, {
        resultado: 'REJEITADA',
        comentario: 'Fora da política de compras.',
      }),
    metodo: 'POST',
    caminho: `/api/v1/solicitacoes/${ID}/decisao`,
    corpo: { resultado: 'REJEITADA', comentario: 'Fora da política de compras.' },
    sucesso: 200,
    devolveSolicitacao: true,
  },
  {
    nome: 'reabrirSolicitacao',
    chamar: (a) => a.reabrirSolicitacao(ID, { justificativa: 'Decisão tomada com dados errados.' }),
    metodo: 'POST',
    caminho: `/api/v1/solicitacoes/${ID}/reabertura`,
    corpo: { justificativa: 'Decisão tomada com dados errados.' },
    sucesso: 200,
    devolveSolicitacao: true,
  },
];

describe('Server Actions das solicitações', () => {
  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://api:3001');
    cache.revalidatePath.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe.each(CASOS)('$nome', (caso) => {
    it(`RF-01: envia ${caso.metodo} ${caso.caminho} com o access da sessão e o corpo certo`, async () => {
      const chamadas = apiResponde(caso.sucesso, caso.sucesso === 204 ? undefined : DETALHE);
      const actions = await carregar();

      await executar(() => caso.chamar(actions));

      expect(chamadas).toHaveLength(1);
      expect(chamadas[0]).toMatchObject({
        caminho: caso.caminho,
        metodo: caso.metodo,
        autorizacao: 'Bearer access-atual',
        corpo: caso.corpo,
      });
      expect(chamadas[0]!.url.startsWith('http://api:3001/')).toBe(true);
    });

    it('ADR-012: em sucesso, devolve ok e revalida o detalhe, a lista e o dashboard', async () => {
      apiResponde(caso.sucesso, caso.sucesso === 204 ? undefined : DETALHE);
      const actions = await carregar();

      const { retorno } = await executar(() => caso.chamar(actions));

      expect(retorno).toEqual(
        caso.devolveSolicitacao ? { ok: true, solicitacao: DETALHE } : { ok: true },
      );
      const revalidados = cache.revalidatePath.mock.calls.map(([caminho]) => caminho);
      expect(revalidados).toEqual(expect.arrayContaining(CAMINHOS_REVALIDADOS));
    });

    it('ADR-008: Problem Details, errors[] vira errosDeCampo, detail vira erro e o code é repassado', async () => {
      apiResponde(
        400,
        problema(400, 'DADOS_INVALIDOS', {
          detail: 'Os dados enviados são inválidos.',
          errors: [
            { campo: 'titulo', mensagem: 'Escreva pelo menos 5 caracteres.' },
            { campo: 'descricao', mensagem: 'Escreva pelo menos 10 caracteres.' },
          ],
        }),
      );
      const actions = await carregar();

      const { retorno } = await executar(() => caso.chamar(actions));

      expect(retorno).toEqual({
        ok: false,
        erro: 'Os dados enviados são inválidos.',
        code: 'DADOS_INVALIDOS',
        errosDeCampo: {
          titulo: 'Escreva pelo menos 5 caracteres.',
          descricao: 'Escreva pelo menos 10 caracteres.',
        },
      });
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it('RN-11: 409 devolve o detail da API e o code, sem revalidar', async () => {
      apiResponde(
        409,
        problema(409, 'TRANSICAO_INVALIDA', {
          detail: 'A solicitação mudou de status antes da sua ação.',
        }),
      );
      const actions = await carregar();

      const { retorno } = await executar(() => caso.chamar(actions));

      expect(retorno).toMatchObject({
        ok: false,
        erro: 'A solicitação mudou de status antes da sua ação.',
        code: 'TRANSICAO_INVALIDA',
      });
      expect(retorno).not.toHaveProperty('errosDeCampo.titulo');
      expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it('ADR-004: 401 segue o fluxo de sessão (redireciona para /api/sessao/encerrar)', async () => {
      apiResponde(401, problema(401, 'NAO_AUTENTICADO', { detail: 'Sessão encerrada.' }));
      const actions = await carregar();

      const resultado = await executar(() => caso.chamar(actions));

      expect(resultado.destino).toBe('/api/sessao/encerrar');
    });

    it('ADR-008: erro 5xx sem detail devolve uma mensagem genérica, nunca vazia', async () => {
      apiResponde(500, problema(500, 'ERRO_INTERNO', { requestId: 'req-999' }));
      const actions = await carregar();

      const { retorno } = await executar(() => caso.chamar(actions));

      expect(retorno).toMatchObject({ ok: false, erro: expect.stringMatching(/\S/) });
    });

    it('ADR-008: falha de rede devolve uma mensagem genérica em vez de lançar', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
      );
      const actions = await carregar();

      const { retorno } = await executar(() => caso.chamar(actions));

      expect(retorno).toMatchObject({ ok: false, erro: expect.stringMatching(/\S/) });
    });
  });

  it('RF-01: editar com versão desatualizada devolve code CONFLITO_DE_VERSAO', async () => {
    apiResponde(
      409,
      problema(409, 'CONFLITO_DE_VERSAO', { detail: 'Outra pessoa alterou esta solicitação.' }),
    );
    const { editarSolicitacao } = await carregar();

    const { retorno } = await executar(() =>
      editarSolicitacao(ID, { titulo: 'Novo título', versao: 1 }),
    );

    expect(retorno).toMatchObject({ ok: false, code: 'CONFLITO_DE_VERSAO' });
  });

  it('RF-01: criar devolve o id e o código da nova solicitação', async () => {
    const criada = solicitacao({
      id: 'c0000000-0000-4000-8000-000000000099',
      codigo: 'SOL-000099',
    });
    apiResponde(201, criada);
    const { criarSolicitacao } = await carregar();

    const { retorno } = await executar(() =>
      criarSolicitacao({
        titulo: 'Novo notebook',
        descricao: 'O atual não liga mais desde ontem.',
        prioridade: 'MEDIA',
      }),
    );

    expect(retorno).toMatchObject({
      ok: true,
      solicitacao: { id: criada.id, codigo: 'SOL-000099' },
    });
    const revalidados = cache.revalidatePath.mock.calls.map(([caminho]) => caminho);
    expect(revalidados).toEqual(
      expect.arrayContaining([`/solicitacoes/${criada.id}`, '/solicitacoes', '/dashboard']),
    );
  });

  describe('ADR-004: id inválido não chega à API', () => {
    const NAO_ENCONTRADA = {
      ok: false,
      erro: 'Solicitação não encontrada.',
      code: 'NAO_ENCONTRADO',
    };

    /** Cada action que recebe id, chamada com um corpo válido: só o id pode falhar. */
    const ACOES_COM_ID: { nome: string; chamar: (a: Actions, id: string) => Promise<unknown> }[] = [
      {
        nome: 'editarSolicitacao',
        chamar: (a, id) => a.editarSolicitacao(id, { titulo: 'Novo título', versao: 1 }),
      },
      { nome: 'excluirSolicitacao', chamar: (a, id) => a.excluirSolicitacao(id) },
      { nome: 'iniciarAnalise', chamar: (a, id) => a.iniciarAnalise(id) },
      {
        nome: 'decidirSolicitacao',
        chamar: (a, id) =>
          a.decidirSolicitacao(id, {
            resultado: 'APROVADA',
            comentario: 'Dentro da política de compras.',
          }),
      },
      {
        nome: 'reabrirSolicitacao',
        chamar: (a, id) =>
          a.reabrirSolicitacao(id, { justificativa: 'Decisão tomada com dados errados.' }),
      },
    ];

    const IDS_INVALIDOS: { descricao: string; id: unknown }[] = [
      { descricao: '".."', id: '..' },
      { descricao: '"."', id: '.' },
      { descricao: 'vazio', id: '' },
      { descricao: '"abc"', id: 'abc' },
      { descricao: 'UUID seguido de "/.."', id: `${ID}/..` },
      { descricao: '"../" antes do UUID', id: `../${ID}` },
      { descricao: 'UUID com "/" no meio', id: 'c0000000-0000-4000-8000/000000000042' },
      { descricao: 'UUID com espaço no fim', id: `${ID} ` },
      { descricao: 'UUID com espaço no começo', id: ` ${ID}` },
      { descricao: 'UUID com espaço no meio', id: 'c0000000-0000-4000-8000 000000000042' },
      { descricao: 'objeto', id: { id: ID } },
      { descricao: 'lista', id: ['x', 'y'] },
      { descricao: 'número', id: 42 },
      { descricao: 'null', id: null },
      { descricao: 'undefined', id: undefined },
    ];

    describe.each(ACOES_COM_ID)('$nome', ({ chamar }) => {
      it.each(IDS_INVALIDOS)(
        'ADR-004: id $descricao devolve NAO_ENCONTRADO sem chamar a API',
        async ({ id }) => {
          const chamadas = apiResponde(200, DETALHE);
          const actions = await carregar();

          const { retorno } = await executar(() => chamar(actions, id as string));

          expect(retorno).toEqual(NAO_ENCONTRADA);
          expect(chamadas).toHaveLength(0);
          expect(fetch).not.toHaveBeenCalled();
          expect(cache.revalidatePath).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('corpo inválido não chega à API', () => {
    /** `campo`: a chave que deve aparecer em errosDeCampo (quando a regra aponta um campo). */
    const CORPOS_INVALIDOS: {
      regra: string;
      descricao: string;
      chamar: (a: Actions) => Promise<unknown>;
      campo?: string;
    }[] = [
      {
        regra: 'RF-01',
        descricao: 'criar com título curto',
        chamar: (a) =>
          a.criarSolicitacao({
            titulo: 'abc',
            descricao: 'Descrição com tamanho suficiente.',
            prioridade: 'ALTA',
          }),
        campo: 'titulo',
      },
      {
        regra: 'RF-01',
        descricao: 'criar com descrição só de espaços',
        chamar: (a) =>
          a.criarSolicitacao({
            titulo: 'Título válido',
            descricao: '              ',
            prioridade: 'ALTA',
          }),
        campo: 'descricao',
      },
      {
        regra: 'RF-01',
        descricao: 'criar com prioridade fora do enum',
        chamar: (a) =>
          a.criarSolicitacao({
            titulo: 'Título válido',
            descricao: 'Descrição com tamanho suficiente.',
            prioridade: 'URGENTE' as never,
          }),
        campo: 'prioridade',
      },
      {
        regra: 'RN-01',
        descricao: 'criar com campo extra status',
        chamar: (a) =>
          a.criarSolicitacao({
            titulo: 'Título válido',
            descricao: 'Descrição com tamanho suficiente.',
            prioridade: 'MEDIA',
            status: 'APROVADA',
          } as never),
      },
      {
        regra: 'RF-01',
        descricao: 'editar com título curto',
        chamar: (a) => a.editarSolicitacao(ID, { titulo: 'abc', versao: 1 }),
        campo: 'titulo',
      },
      {
        regra: 'RF-01',
        descricao: 'editar com descrição só de espaços',
        chamar: (a) => a.editarSolicitacao(ID, { descricao: '              ', versao: 1 }),
        campo: 'descricao',
      },
      {
        regra: 'RF-01',
        descricao: 'editar com prioridade fora do enum',
        chamar: (a) => a.editarSolicitacao(ID, { prioridade: 'URGENTE' as never, versao: 1 }),
        campo: 'prioridade',
      },
      {
        regra: 'RF-01',
        descricao: 'editar com versao 0',
        chamar: (a) => a.editarSolicitacao(ID, { titulo: 'Novo título', versao: 0 }),
        campo: 'versao',
      },
      {
        regra: 'RF-01',
        descricao: 'editar com versao não inteira',
        chamar: (a) => a.editarSolicitacao(ID, { titulo: 'Novo título', versao: 1.5 }),
        campo: 'versao',
      },
      {
        regra: 'RF-01',
        descricao: 'editar com versao em texto',
        chamar: (a) => a.editarSolicitacao(ID, { titulo: 'Novo título', versao: '3' as never }),
        campo: 'versao',
      },
      {
        regra: 'RF-01',
        descricao: 'editar sem versao',
        chamar: (a) => a.editarSolicitacao(ID, { titulo: 'Novo título' } as never),
        campo: 'versao',
      },
      {
        regra: 'RF-01',
        descricao: 'editar com campo extra status',
        chamar: (a) =>
          a.editarSolicitacao(ID, {
            titulo: 'Novo título',
            versao: 1,
            status: 'APROVADA',
          } as never),
      },
      {
        regra: 'RN-06',
        descricao: 'decidir com comentário curto',
        chamar: (a) => a.decidirSolicitacao(ID, { resultado: 'APROVADA', comentario: 'ok' }),
        campo: 'comentario',
      },
      {
        regra: 'RN-06',
        descricao: 'decidir com comentário só de espaços',
        chamar: (a) =>
          a.decidirSolicitacao(ID, { resultado: 'APROVADA', comentario: '              ' }),
        campo: 'comentario',
      },
      {
        regra: 'RN-06',
        descricao: 'decidir com resultado inválido',
        chamar: (a) =>
          a.decidirSolicitacao(ID, {
            resultado: 'EM_ANALISE' as never,
            comentario: 'Comentário com tamanho suficiente.',
          }),
        campo: 'resultado',
      },
      {
        regra: 'RN-06',
        descricao: 'decidir sem resultado',
        chamar: (a) =>
          a.decidirSolicitacao(ID, { comentario: 'Comentário com tamanho suficiente.' } as never),
        campo: 'resultado',
      },
      {
        regra: 'RN-16',
        descricao: 'reabrir com justificativa curta',
        chamar: (a) => a.reabrirSolicitacao(ID, { justificativa: 'curta' }),
        campo: 'justificativa',
      },
      {
        regra: 'RN-16',
        descricao: 'reabrir sem justificativa',
        chamar: (a) => a.reabrirSolicitacao(ID, {} as never),
        campo: 'justificativa',
      },
    ];

    it.each(CORPOS_INVALIDOS)(
      '$regra: $descricao devolve ok false com errosDeCampo, sem chamar a API',
      async ({ chamar, campo }) => {
        const chamadas = apiResponde(200, DETALHE);
        const actions = await carregar();

        const { retorno } = await executar(() => chamar(actions));

        expect(retorno).toMatchObject({ ok: false, erro: expect.stringMatching(/\S/) });
        const errosDeCampo = (retorno as { errosDeCampo?: Record<string, string> }).errosDeCampo;
        expect(errosDeCampo).toBeDefined();
        expect(Object.keys(errosDeCampo ?? {}).length).toBeGreaterThan(0);
        if (campo) expect(errosDeCampo).toHaveProperty([campo], expect.stringMatching(/\S/));
        expect(chamadas).toHaveLength(0);
        expect(fetch).not.toHaveBeenCalled();
        expect(cache.revalidatePath).not.toHaveBeenCalled();
      },
    );
  });
});
