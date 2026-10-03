// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AREAS } from '@/test/fabricas';

/*
 * Consultas das páginas à API (BFF). Só a lista de áreas, igual para todos, pode ir para o cache
 * do Next, e sem credencial nenhuma; o resto é por usuário e sempre sem cache (ADR-012).
 */

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect inesperado no teste');
  }),
}));

const TOKEN = 'token-da-sessao';
const COOKIE = 'sessao=valor-do-cookie';

// A sessão existe: se alguma consulta usar o token ou o cookie, o teste percebe
vi.mock('@/features/auth/sessao', () => ({
  lerAccessToken: vi.fn(async () => TOKEN),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ name: 'sessao', value: 'valor-do-cookie' }),
    getAll: () => [{ name: 'sessao', value: 'valor-do-cookie' }],
    toString: (): string => COOKIE,
  })),
  headers: vi.fn(async () => new Headers({ cookie: COOKIE })),
}));

type OpcoesNext = { tags?: string[]; revalidate?: number | false };
type Init = RequestInit & { next?: OpcoesNext };

/** Fetch falso que responde com o corpo e o status informados. */
function simularFetch(corpo: unknown, status = 200) {
  const fetchFalso = vi.fn<(entrada: RequestInfo | URL, init?: Init) => Promise<Response>>(
    async () => Response.json(corpo, { status }),
  );
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

/** A requisição montada e as opções extras (`next`, `cache`) da chamada de índice `i`. */
function chamada(fetchFalso: ReturnType<typeof simularFetch>, i = 0) {
  const [entrada, init] = fetchFalso.mock.calls[i]!;
  const requisicao = entrada instanceof Request ? entrada : new Request(entrada, init);
  const cabecalhos = new Headers(requisicao.headers);
  new Headers(init?.headers).forEach((valor, nome) => cabecalhos.set(nome, valor));
  return {
    url: new URL(requisicao.url),
    cabecalhos,
    next: init?.next,
    cache: init?.cache ?? requisicao.cache,
  };
}

async function carregarConsultas() {
  vi.resetModules();
  return import('./consultas');
}

describe('ADR-012: listarAreas (único cache de dados do app)', () => {
  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://api:3001');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('ADR-012: chama GET /api/v1/areas com next.tags contendo "areas" e revalidate de 1 hora', async () => {
    const fetchFalso = simularFetch(AREAS);
    const { listarAreas } = await carregarConsultas();

    await listarAreas();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const { url, next, cache } = chamada(fetchFalso);
    expect(url.origin).toBe('http://api:3001');
    expect(url.pathname).toBe('/api/v1/areas');
    expect(next?.tags).toContain('areas');
    expect(next?.revalidate).toBe(3600);
    expect(cache).not.toBe('no-store');
  });

  it('ADR-012: não envia Authorization nem o cookie da sessão (a resposta é igual para todos)', async () => {
    const fetchFalso = simularFetch(AREAS);
    const { listarAreas } = await carregarConsultas();

    await listarAreas();

    const { cabecalhos } = chamada(fetchFalso);
    expect(cabecalhos.has('authorization')).toBe(false);
    expect(cabecalhos.has('cookie')).toBe(false);
    expect([...cabecalhos.values()].join(' ')).not.toContain(TOKEN);
  });

  it('ADR-012: devolve as áreas como Consulta ok', async () => {
    simularFetch(AREAS);
    const { listarAreas } = await carregarConsultas();

    await expect(listarAreas()).resolves.toEqual({ ok: true, dados: AREAS });
  });

  it('ADR-012: falha da API vira Consulta com ok: false, sem lançar', async () => {
    simularFetch({ status: 500, code: 'ERRO_INTERNO', requestId: 'req-areas' }, 500);
    const { listarAreas } = await carregarConsultas();

    await expect(listarAreas()).resolves.toMatchObject({ ok: false, status: 500 });
  });

  it('ADR-012: API fora do ar vira Consulta com ok: false, sem lançar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const { listarAreas } = await carregarConsultas();

    await expect(listarAreas()).resolves.toMatchObject({ ok: false });
  });
});

describe('ADR-012/RF-02: listarSolicitacoes continua por usuário e sem cache', () => {
  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://api:3001');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('RF-02: repassa ?area= repetido para a API, com no-store e o token da sessão', async () => {
    const fetchFalso = simularFetch({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    const { listarSolicitacoes } = await carregarConsultas();

    await listarSolicitacoes({ area: [AREAS[1]!.id, AREAS[3]!.id], status: ['ABERTA'] });

    const { url, cabecalhos, cache, next } = chamada(fetchFalso);
    expect(url.pathname).toBe('/api/v1/solicitacoes');
    expect(url.searchParams.getAll('area')).toEqual([AREAS[1]!.id, AREAS[3]!.id]);
    expect(url.searchParams.getAll('status')).toEqual(['ABERTA']);
    expect(cache).toBe('no-store');
    expect(next?.tags ?? []).not.toContain('areas');
    expect(cabecalhos.get('authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('RF-02: sem área escolhida, não manda ?area=', async () => {
    const fetchFalso = simularFetch({
      data: [],
      meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    const { listarSolicitacoes } = await carregarConsultas();

    await listarSolicitacoes({ area: [] });

    expect(chamada(fetchFalso).url.searchParams.has('area')).toBe(false);
  });
});
