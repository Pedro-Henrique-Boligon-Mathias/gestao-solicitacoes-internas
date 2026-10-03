import { afterEach, describe, expect, it, vi } from 'vitest';
import { consultarProntidaoApi } from './api';

function responderCom(corpo: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(corpo, { status })));
}

describe('consultarProntidaoApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devolve a prontidão quando a API está saudável', async () => {
    responderCom({ status: 'ok', details: { database: { status: 'up' } } });
    await expect(consultarProntidaoApi()).resolves.toEqual({
      alcancavel: true,
      prontidao: { status: 'ok', details: { database: { status: 'up' } } },
    });
  });

  it('lê o corpo do 503 para saber que o banco caiu', async () => {
    responderCom({ status: 'error', details: { database: { status: 'down' } } }, 503);
    const situacao = await consultarProntidaoApi();
    expect(situacao).toMatchObject({ alcancavel: true, prontidao: { status: 'error' } });
  });

  it('trata resposta fora do contrato como API indisponível', async () => {
    responderCom({ inesperado: true });
    await expect(consultarProntidaoApi()).resolves.toEqual({
      alcancavel: false,
      motivo: 'A API respondeu num formato inesperado.',
    });
  });

  it('trata falha de rede como API indisponível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(consultarProntidaoApi()).resolves.toEqual({
      alcancavel: false,
      motivo: 'Não foi possível conectar à API.',
    });
  });
});
