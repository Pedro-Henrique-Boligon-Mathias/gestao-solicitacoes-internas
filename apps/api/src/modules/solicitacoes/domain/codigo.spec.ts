import { formatarCodigo, interpretarCodigo } from './codigo';

describe('P-12: código da solicitação (SOL-000123)', () => {
  it.each([
    [1, 'SOL-000001'],
    [42, 'SOL-000042'],
    [123456, 'SOL-123456'],
    [1234567, 'SOL-1234567'],
  ])('formatarCodigo(%i) → %s', (numero, esperado) => {
    expect(formatarCodigo(numero)).toBe(esperado);
  });

  it.each([
    ['SOL-000042', 42],
    ['sol-42', 42],
    ['SOL-42', 42],
    ['42', 42],
    ['000042', 42],
    ['SOL-123456', 123456],
  ])('interpretarCodigo(%j) → %i', (texto, esperado) => {
    expect(interpretarCodigo(texto)).toBe(esperado);
  });

  it.each([
    '',
    'SOL-',
    'SOL-abc',
    'acesso',
    '4a2',
    '4.2',
    '-42',
    'SOLX-42',
    'SOL 42',
    'solicitacao',
  ])('interpretarCodigo(%j) → null', (texto) => {
    expect(interpretarCodigo(texto)).toBeNull();
  });

  it.each([1, 42, 999999, 1234567])(
    'interpretarCodigo(formatarCodigo(%i)) devolve o número',
    (n) => {
      expect(interpretarCodigo(formatarCodigo(n))).toBe(n);
    },
  );
});
