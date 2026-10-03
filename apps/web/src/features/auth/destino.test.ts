import { describe, expect, it } from 'vitest';
import { destinoSeguro } from './destino';

describe('ADR-004: destinoSeguro (?next= do login)', () => {
  it.each(['/solicitacoes?status=ABERTA', '/dashboard', '/solicitacoes/0b6c8f9e?aba=historico'])(
    'ADR-004: aceita o caminho interno %s',
    (caminho) => {
      expect(destinoSeguro(caminho)).toBe(caminho);
    },
  );

  it.each([
    ['//evil.com', '//evil.com'],
    ['/\\evil.com', '/\\evil.com'],
    ['https://evil.com', 'https://evil.com'],
    ['javascript:alert(1)', 'javascript:alert(1)'],
    ['caminho relativo', 'dashboard'],
    ['vazio', ''],
  ])('ADR-004: recusa %s e manda para /dashboard', (_descricao, valor) => {
    expect(destinoSeguro(valor)).toBe('/dashboard');
  });

  it.each([null, undefined])('ADR-004: sem valor (%s) manda para /dashboard', (valor) => {
    expect(destinoSeguro(valor)).toBe('/dashboard');
  });
});
