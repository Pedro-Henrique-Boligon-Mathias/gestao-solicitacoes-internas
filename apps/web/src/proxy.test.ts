// @vitest-environment node
import { NextRequest, type NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const ORIGEM = 'http://localhost:3000';
const MINUTO = 60_000;

/** JWT com o formato do access da API; o proxy só lê a validade (quem valida é a API). */
function jwt(expiraEmSegundos: number): string {
  const b64 = (valor: object) => Buffer.from(JSON.stringify(valor)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({
      sub: 'u1',
      cargo: 'ANALISTA',
      areaId: 'a1',
      sid: 's1',
      iat: agora,
      exp: agora + expiraEmSegundos,
    }),
    'assinatura',
  ].join('.');
}

function requisicao(caminho: string, cookies: Record<string, string> = {}): NextRequest {
  const cabecalho = Object.entries(cookies)
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join('; ');
  return new NextRequest(`${ORIGEM}${caminho}`, {
    headers: cabecalho ? { cookie: cabecalho } : {},
  });
}

/** Caminho + query do redirecionamento (Location), ou null se não redirecionou. */
function destino(resposta: Response): string | null {
  const location = resposta.headers.get('location');
  if (!location) return null;
  const url = new URL(location, ORIGEM);
  return `${url.pathname}${url.search}`;
}

/** Cookie gravado (ou apagado) na resposta, lido do Set-Cookie. */
function setCookie(resposta: Response, nome: string): string | undefined {
  return resposta.headers.getSetCookie().find((linha) => linha.startsWith(`${nome}=`));
}

function foiApagado(resposta: Response, nome: string): boolean {
  const linha = setCookie(resposta, nome);
  if (!linha) return false;
  const vazio = linha.startsWith(`${nome}=;`);
  const expirado = /max-age=0/i.test(linha) || /expires=thu, 01 jan 1970/i.test(linha);
  return vazio && expirado;
}

interface ChamadaApi {
  url: string;
  metodo: string;
  corpo: unknown;
}

/** Intercepta o fetch para a API e registra as chamadas. */
function apiResponde(status: number, corpo?: unknown): ChamadaApi[] {
  const chamadas: ChamadaApi[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const req = entrada instanceof Request ? entrada : new Request(entrada, init);
      const texto = await req.text();
      chamadas.push({ url: req.url, metodo: req.method, corpo: texto ? JSON.parse(texto) : null });
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

function sessaoNova() {
  const agora = Date.now();
  return {
    accessToken: jwt(15 * 60),
    accessExpiraEm: new Date(agora + 15 * MINUTO).toISOString(),
    refreshToken: 'refresh-novo-0123456789abcdefghijklmnopqrstu',
    refreshExpiraEm: new Date(agora + 7 * 24 * 60 * MINUTO).toISOString(),
    usuario: {
      id: 'u1',
      nome: 'Carla Mendes',
      email: 'carla.mendes@demo.test',
      cargo: 'ANALISTA',
      area: { id: 'a1', nome: 'Tecnologia' },
    },
  };
}

async function rodarProxy(req: NextRequest): Promise<NextResponse> {
  vi.resetModules();
  const { proxy } = await import('./proxy');
  return (await proxy(req)) as NextResponse;
}

describe('ADR-004: proxy (sessão nas rotas da área logada)', () => {
  beforeEach(() => {
    vi.stubEnv('API_URL', 'http://api:3001');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('ADR-004: sem cookies em /dashboard → redireciona para /login?next=%2Fdashboard', async () => {
    const chamadas = apiResponde(500);

    const resposta = await rodarProxy(requisicao('/dashboard'));

    expect(resposta.status).toBeGreaterThanOrEqual(300);
    expect(resposta.status).toBeLessThan(400);
    expect(destino(resposta)).toBe('/login?next=%2Fdashboard');
    expect(chamadas).toHaveLength(0);
  });

  it('ADR-004: sem cookies, o next leva o caminho e a query', async () => {
    apiResponde(500);

    const resposta = await rodarProxy(requisicao('/solicitacoes?status=ABERTA'));

    expect(destino(resposta)).toBe(
      `/login?next=${encodeURIComponent('/solicitacoes?status=ABERTA')}`,
    );
  });

  it('ADR-004: com access válido, segue sem chamar a API', async () => {
    const chamadas = apiResponde(500);

    const resposta = await rodarProxy(
      requisicao('/dashboard', { sessao_access: jwt(600), sessao_refresh: 'refresh-atual' }),
    );

    expect(destino(resposta)).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it.each([
    ['ausente', {}],
    ['vencido', { sessao_access: jwt(-60) }],
  ])(
    'ADR-004: access %s e refresh válido → chama o refresh e grava os dois cookies novos (httpOnly, SameSite=Lax)',
    async (_situacao, cookieAccess) => {
      const nova = sessaoNova();
      const chamadas = apiResponde(200, nova);

      const resposta = await rodarProxy(
        requisicao('/dashboard', { ...cookieAccess, sessao_refresh: 'refresh-antigo' }),
      );

      expect(chamadas).toHaveLength(1);
      expect(chamadas[0]).toEqual({
        url: 'http://api:3001/api/v1/auth/refresh',
        metodo: 'POST',
        corpo: { refreshToken: 'refresh-antigo' },
      });

      expect(destino(resposta)).toBeNull();
      expect(resposta.status).toBe(200);

      const access = resposta.cookies.get('sessao_access');
      const refresh = resposta.cookies.get('sessao_refresh');
      expect(access).toMatchObject({
        value: nova.accessToken,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      expect(refresh).toMatchObject({
        value: nova.refreshToken,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });

      // maxAge acompanha a validade devolvida pela API
      expect(access?.maxAge).toBeGreaterThan(14 * 60);
      expect(access?.maxAge).toBeLessThanOrEqual(15 * 60);
      expect(refresh?.maxAge).toBeGreaterThan(7 * 24 * 60 * 60 - 60);
      expect(refresh?.maxAge).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    },
  );

  it('ADR-004: depois do refresh, o novo access também vale para a renderização desta requisição', async () => {
    const nova = sessaoNova();
    apiResponde(200, nova);

    const resposta = await rodarProxy(
      requisicao('/dashboard', { sessao_refresh: 'refresh-antigo' }),
    );

    // Cabeçalhos que o Next repassa para a página (NextResponse.next({ request: { headers } }))
    expect(resposta.headers.get('x-middleware-request-cookie')).toContain(
      `sessao_access=${nova.accessToken}`,
    );
  });

  it('ADR-004: refresh recusado com 401 → apaga os dois cookies e redireciona para /login?next=…', async () => {
    apiResponde(401, { status: 401, code: 'SESSAO_INVALIDA' });

    const resposta = await rodarProxy(
      requisicao('/solicitacoes', { sessao_access: jwt(-60), sessao_refresh: 'refresh-reusado' }),
    );

    expect(destino(resposta)).toBe('/login?next=%2Fsolicitacoes');
    expect(foiApagado(resposta, 'sessao_access')).toBe(true);
    expect(foiApagado(resposta, 'sessao_refresh')).toBe(true);
  });

  describe('ADR-004: falha transitória no refresh não desloga', () => {
    function semCookiesNaResposta(resposta: Response): void {
      expect(setCookie(resposta, 'sessao_access')).toBeUndefined();
      expect(setCookie(resposta, 'sessao_refresh')).toBeUndefined();
    }

    it.each([
      ['429', 429, { status: 429, code: 'MUITAS_TENTATIVAS' }],
      ['503', 503, { status: 503, code: 'INDISPONIVEL' }],
    ])(
      'ADR-004: refresh com %s → mantém os cookies e redireciona para /login?next=…',
      async (_situacao, status, corpo) => {
        const chamadas = apiResponde(status, corpo);

        const resposta = await rodarProxy(
          requisicao('/solicitacoes?status=ABERTA', {
            sessao_access: jwt(-60),
            sessao_refresh: 'refresh-atual',
          }),
        );

        expect(chamadas).toHaveLength(1);
        expect(destino(resposta)).toBe(
          `/login?next=${encodeURIComponent('/solicitacoes?status=ABERTA')}`,
        );
        semCookiesNaResposta(resposta);
      },
    );

    it('ADR-004: API fora do ar (erro de rede) → mantém os cookies e redireciona para /login?next=…', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
      );

      const resposta = await rodarProxy(
        requisicao('/dashboard', { sessao_access: jwt(-60), sessao_refresh: 'refresh-atual' }),
      );

      expect(destino(resposta)).toBe('/login?next=%2Fdashboard');
      semCookiesNaResposta(resposta);
    });

    it('ADR-004: tempo esgotado no refresh → mantém os cookies e redireciona para /login?next=…', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))),
      );

      const resposta = await rodarProxy(
        requisicao('/dashboard', { sessao_refresh: 'refresh-atual' }),
      );

      expect(destino(resposta)).toBe('/login?next=%2Fdashboard');
      semCookiesNaResposta(resposta);
    });
  });

  it('ADR-004: em /login com sessão válida → redireciona para /dashboard', async () => {
    apiResponde(500);

    const resposta = await rodarProxy(
      requisicao('/login', { sessao_access: jwt(600), sessao_refresh: 'refresh-atual' }),
    );

    expect(destino(resposta)).toBe('/dashboard');
  });

  it('ADR-004: em /login sem sessão → mostra a página (sem redirecionar)', async () => {
    apiResponde(500);

    const resposta = await rodarProxy(requisicao('/login'));

    expect(destino(resposta)).toBeNull();
  });

  describe('ADR-004: cookie Secure', () => {
    async function cookiesDepoisDoRefresh() {
      apiResponde(200, sessaoNova());
      const resposta = await rodarProxy(
        requisicao('/dashboard', { sessao_refresh: 'refresh-antigo' }),
      );
      return [resposta.cookies.get('sessao_access'), resposta.cookies.get('sessao_refresh')];
    }

    it('ADR-004: com COOKIE_SECURE=true, os cookies saem com Secure', async () => {
      vi.stubEnv('COOKIE_SECURE', 'true');
      for (const cookie of await cookiesDepoisDoRefresh()) {
        expect(cookie?.secure).toBe(true);
      }
    });

    it.each([['false'], [undefined]])(
      'ADR-004: com COOKIE_SECURE=%s, os cookies saem sem Secure',
      async (valor) => {
        vi.stubEnv('COOKIE_SECURE', valor);
        for (const cookie of await cookiesDepoisDoRefresh()) {
          expect(cookie).toBeDefined();
          expect(cookie?.secure ?? false).toBe(false);
        }
      },
    );
  });
});
