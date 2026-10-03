import { afterEach, describe, expect, it, vi } from 'vitest';

// O client só roda no servidor do Next; nos testes o marcador `server-only` é neutro.
vi.mock('server-only', () => ({}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Intercepta o fetch e devolve a requisição que o client montou. */
function interceptarFetch(): () => Request {
  const fetchFalso = vi.fn(() => Promise.resolve(Response.json({ status: 'ok' })));
  vi.stubGlobal('fetch', fetchFalso);
  return () => {
    const [entrada, init] = fetchFalso.mock.calls[0] as unknown as [
      RequestInfo | URL,
      RequestInit?,
    ];
    return entrada instanceof Request ? entrada : new Request(entrada, init);
  };
}

// Recarrega o módulo a cada teste para que API_URL e o fetch falso valham desde a importação.
async function carregarCliente() {
  vi.resetModules();
  const { criarClienteApi } = await import('./client');
  return criarClienteApi;
}

describe('ADR-001: criarClienteApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('ADR-001: usa a API_URL do ambiente como base', async () => {
    vi.stubEnv('API_URL', 'http://api:3001');
    const requisicao = interceptarFetch();
    const criarClienteApi = await carregarCliente();

    await criarClienteApi().GET('/health/live');

    expect(requisicao().url).toBe('http://api:3001/health/live');
  });

  it('ADR-001: sem API_URL, usa http://localhost:3001', async () => {
    vi.stubEnv('API_URL', undefined);
    const requisicao = interceptarFetch();
    const criarClienteApi = await carregarCliente();

    await criarClienteApi().GET('/health/live');

    expect(requisicao().url).toBe('http://localhost:3001/health/live');
  });

  it('ADR-001: envia o X-Request-Id informado', async () => {
    const requisicao = interceptarFetch();
    const criarClienteApi = await carregarCliente();

    await criarClienteApi({ requestId: 'req-da-pagina' }).GET('/health/live');

    expect(requisicao().headers.get('X-Request-Id')).toBe('req-da-pagina');
  });

  it('ADR-001: sem requestId, envia um X-Request-Id UUID gerado', async () => {
    const requisicao = interceptarFetch();
    const criarClienteApi = await carregarCliente();

    await criarClienteApi().GET('/health/live');

    expect(requisicao().headers.get('X-Request-Id')).toMatch(UUID);
  });
});
