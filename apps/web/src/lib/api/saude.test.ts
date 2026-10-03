import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

function responderCom(corpo: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json(corpo, { status }))),
  );
}

// Fetch que só termina quando o sinal da requisição é abortado (simula a API pendurada).
function nuncaResponder(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const sinal = entrada instanceof Request ? entrada.signal : init?.signal;
      return new Promise<Response>((_, rejeitar) => {
        sinal?.addEventListener('abort', () => rejeitar(sinal.reason));
      });
    }),
  );
}

async function carregar() {
  vi.resetModules();
  const { consultarProntidaoApi } = await import('./saude');
  return consultarProntidaoApi;
}

describe('ADR-009: consultarProntidaoApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ADR-009: 200 → API alcançável e banco up', async () => {
    responderCom({ status: 'ok', details: { database: { status: 'up' } } });
    const consultarProntidaoApi = await carregar();

    await expect(consultarProntidaoApi()).resolves.toMatchObject({
      alcancavel: true,
      prontidao: { status: 'ok', details: { database: { status: 'up' } } },
    });
  });

  it('ADR-009: 503 → API alcançável e banco down (lê o corpo do 503)', async () => {
    responderCom({ status: 'error', details: { database: { status: 'down' } } }, 503);
    const consultarProntidaoApi = await carregar();

    await expect(consultarProntidaoApi()).resolves.toMatchObject({
      alcancavel: true,
      prontidao: { status: 'error', details: { database: { status: 'down' } } },
    });
  });

  it('ADR-009: erro de rede → API inalcançável com motivo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );
    const consultarProntidaoApi = await carregar();

    await expect(consultarProntidaoApi()).resolves.toEqual({
      alcancavel: false,
      motivo: 'Não foi possível conectar à API.',
    });
  });

  it('ADR-009: timeout → API inalcançável com motivo', async () => {
    nuncaResponder();
    const consultarProntidaoApi = await carregar();

    const situacao = await consultarProntidaoApi(50);

    expect(situacao).toEqual({ alcancavel: false, motivo: expect.stringMatching(/\S/) });
  });

  it('ADR-009: corpo fora do formato → API inalcançável', async () => {
    responderCom({ inesperado: true });
    const consultarProntidaoApi = await carregar();

    await expect(consultarProntidaoApi()).resolves.toEqual({
      alcancavel: false,
      motivo: 'A API respondeu num formato inesperado.',
    });
  });

  it('ADR-009: corpo que não é JSON → API inalcançável', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('<html>proxy</html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        ),
      ),
    );
    const consultarProntidaoApi = await carregar();

    await expect(consultarProntidaoApi()).resolves.toMatchObject({ alcancavel: false });
  });
});
