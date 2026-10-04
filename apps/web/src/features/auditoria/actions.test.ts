// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { divergencia, integridade, problema } from '@/test/fabricas';

/*
 * Server Action da auditoria do histórico (RN-10, doc 16): `verificarIntegridade()` chama
 * GET /api/v1/auditoria/integridade com o access da sessão, no padrão das actions das
 * solicitações, e devolve { ok: true, integridade } ou { ok: false, erro, code?, requestId? }.
 * Não revalida nada (só lê). 401 segue o fluxo de sessão.
 */

vi.mock('server-only', () => ({}));

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
  requestId: string | null;
}

function apiResponde(status: number, corpo?: unknown): ChamadaApi[] {
  const chamadas: ChamadaApi[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const req = entrada instanceof Request ? entrada : new Request(entrada, init);
      chamadas.push({
        url: req.url,
        caminho: new URL(req.url).pathname,
        metodo: req.method,
        autorizacao: req.headers.get('Authorization'),
        requestId: req.headers.get('X-Request-Id'),
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

describe('RN-10: verificarIntegridade (Server Action)', () => {
  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://api:3001');
    cache.revalidatePath.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('RN-10: envia GET /api/v1/auditoria/integridade com o access da sessão', async () => {
    const chamadas = apiResponde(200, integridade());
    const { verificarIntegridade } = await carregar();

    await executar(() => verificarIntegridade());

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({
      caminho: '/api/v1/auditoria/integridade',
      metodo: 'GET',
      autorizacao: 'Bearer access-atual',
    });
    expect(chamadas[0]!.url.startsWith('http://api:3001/')).toBe(true);
  });

  it('RN-10: 200 íntegro devolve ok com o resultado como veio da API, sem revalidar', async () => {
    const resultado = integridade();
    apiResponde(200, resultado);
    const { verificarIntegridade } = await carregar();

    const { retorno } = await executar(() => verificarIntegridade());

    expect(retorno).toEqual({ ok: true, integridade: resultado });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it('RN-10: 200 com divergências também é ok (adulteração é resultado, não erro)', async () => {
    const resultado = integridade({
      integro: false,
      totalDivergencias: 1,
      divergencias: [divergencia()],
    });
    apiResponde(200, resultado);
    const { verificarIntegridade } = await carregar();

    const { retorno } = await executar(() => verificarIntegridade());

    expect(retorno).toEqual({ ok: true, integridade: resultado });
  });

  it('RN-10: 403 (não é Admin) devolve o detail, o code e o requestId da API', async () => {
    apiResponde(
      403,
      problema(403, 'ACESSO_NEGADO', {
        detail: 'Só o Admin pode verificar a integridade do histórico.',
        requestId: 'req-403',
      }),
    );
    const { verificarIntegridade } = await carregar();

    const { retorno } = await executar(() => verificarIntegridade());

    expect(retorno).toEqual({
      ok: false,
      erro: 'Só o Admin pode verificar a integridade do histórico.',
      code: 'ACESSO_NEGADO',
      requestId: 'req-403',
    });
  });

  it('ADR-008: 5xx sem detail devolve mensagem genérica, nunca vazia, com o requestId', async () => {
    apiResponde(500, problema(500, 'ERRO_INTERNO', { requestId: 'req-999' }));
    const { verificarIntegridade } = await carregar();

    const { retorno } = await executar(() => verificarIntegridade());

    expect(retorno).toMatchObject({
      ok: false,
      erro: expect.stringMatching(/\S/),
      requestId: 'req-999',
    });
  });

  it('ADR-004: 401 segue o fluxo de sessão (redireciona para /api/sessao/encerrar)', async () => {
    apiResponde(401, problema(401, 'NAO_AUTENTICADO', { detail: 'Sessão encerrada.' }));
    const { verificarIntegridade } = await carregar();

    const resultado = await executar(() => verificarIntegridade());

    expect(resultado.destino).toBe('/api/sessao/encerrar');
  });

  it('ADR-008: falha de rede devolve mensagem genérica e o requestId enviado no X-Request-Id', async () => {
    const enviados: (string | null)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
        const req = entrada instanceof Request ? entrada : new Request(entrada, init);
        enviados.push(req.headers.get('X-Request-Id'));
        throw new TypeError('fetch failed');
      }),
    );
    const { verificarIntegridade } = await carregar();

    const { retorno } = await executar(() => verificarIntegridade());

    expect(retorno).toMatchObject({ ok: false, erro: expect.stringMatching(/\S/) });
    const requestId = (retorno as { requestId?: string }).requestId;
    expect(requestId).toEqual(expect.stringMatching(/\S/));
    expect(enviados).toEqual([requestId]);
  });
});
