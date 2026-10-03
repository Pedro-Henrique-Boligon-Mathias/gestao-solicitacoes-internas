// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

interface CookieGravado {
  name: string;
  value: string;
  httpOnly?: boolean;
  sameSite?: string | boolean;
  secure?: boolean;
  path?: string;
  maxAge?: number;
  expires?: Date | number;
}

/** Cookies do Next (`cookies()` de next/headers) em memória. */
const jarra = vi.hoisted(() => {
  const valores = new Map<string, string>();
  const gravados: CookieGravado[] = [];
  const apagados: string[] = [];
  const loja = {
    get: (nome: string) =>
      valores.has(nome) ? { name: nome, value: valores.get(nome)! } : undefined,
    has: (nome: string) => valores.has(nome),
    getAll: () => [...valores].map(([name, value]) => ({ name, value })),
    set: (...args: unknown[]) => {
      const cookie = (
        typeof args[0] === 'string'
          ? { name: args[0], value: args[1], ...(args[2] as object) }
          : args[0]
      ) as CookieGravado;
      gravados.push(cookie);
      if (cookie.value === '' || cookie.maxAge === 0) {
        apagados.push(cookie.name);
        valores.delete(cookie.name);
      } else {
        valores.set(cookie.name, cookie.value);
      }
      return loja;
    },
    delete: (arg: string | { name: string }) => {
      const nome = typeof arg === 'string' ? arg : arg.name;
      apagados.push(nome);
      valores.delete(nome);
      return loja;
    },
  };
  return { valores, gravados, apagados, loja };
});

vi.mock('next/headers', () => ({
  cookies: async () => jarra.loja,
  headers: async () =>
    new Headers({ 'user-agent': 'navegador-de-teste', 'x-forwarded-for': '10.0.0.7' }),
}));

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
}));

interface ChamadaApi {
  url: string;
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

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
  return dados;
}

const SESSAO = {
  accessToken: 'access-novo',
  accessExpiraEm: new Date(Date.now() + 15 * 60_000).toISOString(),
  refreshToken: 'refresh-novo',
  refreshExpiraEm: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
  usuario: {
    id: 'u1',
    nome: 'Carla Mendes',
    email: 'carla.mendes@demo.test',
    cargo: 'ANALISTA',
    area: { id: 'a1', nome: 'Tecnologia' },
  },
};

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

describe('ADR-004: Server Actions de autenticação', () => {
  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://api:3001');
    jarra.valores.clear();
    jarra.gravados.length = 0;
    jarra.apagados.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('entrar', () => {
    it('ADR-004: envia e-mail e senha para POST /auth/login', async () => {
      const chamadas = apiResponde(200, SESSAO);
      const { entrar } = await carregar();

      await executar(() =>
        entrar(undefined, formulario({ email: 'carla.mendes@demo.test', senha: 'Demo@2026' })),
      );

      expect(chamadas[0]).toMatchObject({
        url: 'http://api:3001/api/v1/auth/login',
        metodo: 'POST',
        corpo: { email: 'carla.mendes@demo.test', senha: 'Demo@2026' },
      });
    });

    it('ADR-004: em sucesso, grava os dois cookies httpOnly e redireciona para o next interno', async () => {
      apiResponde(200, SESSAO);
      const { entrar } = await carregar();

      const resultado = await executar(() =>
        entrar(
          undefined,
          formulario({
            email: 'carla.mendes@demo.test',
            senha: 'Demo@2026',
            next: '/solicitacoes?status=ABERTA',
          }),
        ),
      );

      expect(resultado.destino).toBe('/solicitacoes?status=ABERTA');
      const porNome = Object.fromEntries(jarra.gravados.map((cookie) => [cookie.name, cookie]));
      for (const [nome, valor] of [
        ['sessao_access', 'access-novo'],
        ['sessao_refresh', 'refresh-novo'],
      ] as const) {
        expect(porNome[nome]).toMatchObject({
          value: valor,
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        });
      }
    });

    it('ADR-004: next externo é ignorado e o login leva para /dashboard', async () => {
      apiResponde(200, SESSAO);
      const { entrar } = await carregar();

      const resultado = await executar(() =>
        entrar(
          undefined,
          formulario({ email: 'carla.mendes@demo.test', senha: 'Demo@2026', next: '//evil.com' }),
        ),
      );

      expect(resultado.destino).toBe('/dashboard');
    });

    it.each([
      [401, 'E-mail ou senha inválidos.'],
      [429, 'Muitas tentativas. Aguarde 1 minuto.'],
    ])(
      'ADR-004: API responde %i → devolve { erro: "%s" } sem gravar cookies',
      async (status, mensagem) => {
        apiResponde(status, { status });
        const { entrar } = await carregar();

        const resultado = await executar(() =>
          entrar(undefined, formulario({ email: 'carla.mendes@demo.test', senha: 'errada' })),
        );

        expect(resultado.retorno).toEqual({ erro: mensagem });
        expect(jarra.gravados).toHaveLength(0);
      },
    );

    it('ADR-004: outro erro da API → mensagem genérica', async () => {
      apiResponde(500, { status: 500 });
      const { entrar } = await carregar();

      const resultado = await executar(() =>
        entrar(undefined, formulario({ email: 'carla.mendes@demo.test', senha: 'Demo@2026' })),
      );

      expect(resultado.retorno).toEqual({ erro: expect.stringMatching(/\S/) });
      expect((resultado.retorno as { erro: string }).erro).not.toMatch(/inválidos|tentativas/);
    });
  });

  describe('sair', () => {
    it('ADR-004: chama POST /auth/logout com o access, apaga os cookies e vai para /login', async () => {
      jarra.valores.set('sessao_access', 'access-atual');
      jarra.valores.set('sessao_refresh', 'refresh-atual');
      const chamadas = apiResponde(204);
      const { sair } = await carregar();

      const resultado = await executar(() => sair());

      expect(chamadas[0]).toMatchObject({
        url: 'http://api:3001/api/v1/auth/logout',
        metodo: 'POST',
        autorizacao: 'Bearer access-atual',
      });
      expect(jarra.apagados).toEqual(expect.arrayContaining(['sessao_access', 'sessao_refresh']));
      expect(resultado.destino).toBe('/login');
    });

    it('ADR-004: falha no logout da API não impede a saída', async () => {
      jarra.valores.set('sessao_access', 'access-atual');
      jarra.valores.set('sessao_refresh', 'refresh-atual');
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
      );
      const { sair } = await carregar();

      const resultado = await executar(() => sair());

      expect(jarra.apagados).toEqual(expect.arrayContaining(['sessao_access', 'sessao_refresh']));
      expect(resultado.destino).toBe('/login');
    });
  });
});
