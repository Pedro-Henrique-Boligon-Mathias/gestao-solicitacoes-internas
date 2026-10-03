// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

const ORIGEM = 'http://localhost:3000';

function requisicao(cabecalhos: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${ORIGEM}/api/sessao/encerrar`, {
    headers: {
      cookie: 'sessao_access=access-atual; sessao_refresh=refresh-atual',
      ...cabecalhos,
    },
  });
}

/** Caminho + query do redirecionamento (Location), ou null se não redirecionou. */
function destino(resposta: Response): string | null {
  const location = resposta.headers.get('location');
  if (!location) return null;
  const url = new URL(location, ORIGEM);
  return `${url.pathname}${url.search}`;
}

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

describe('ADR-004: /api/sessao/encerrar (sessão recusada pela API)', () => {
  it.each([
    ['sem Sec-Fetch-Site', {}],
    ['same-origin', { 'sec-fetch-site': 'same-origin' }],
    ['cross-site', { 'sec-fetch-site': 'cross-site' }],
  ])(
    'ADR-004: %s → apaga só sessao_access, mantém sessao_refresh e redireciona para /dashboard',
    async (_situacao, cabecalhos) => {
      const resposta = await GET(requisicao(cabecalhos));

      expect(resposta.status).toBeGreaterThanOrEqual(300);
      expect(resposta.status).toBeLessThan(400);
      expect(destino(resposta)).toBe('/dashboard');

      expect(foiApagado(resposta, 'sessao_access')).toBe(true);
      // O refresh fica: é o proxy que decide, pelo refresh, se a sessão ainda vale
      expect(setCookie(resposta, 'sessao_refresh')).toBeUndefined();
    },
  );

  it('ADR-004: o cookie apagado mantém o path dos cookies de sessão', async () => {
    const resposta = await GET(requisicao());

    expect(setCookie(resposta, 'sessao_access')).toMatch(/path=\//i);
  });
});
