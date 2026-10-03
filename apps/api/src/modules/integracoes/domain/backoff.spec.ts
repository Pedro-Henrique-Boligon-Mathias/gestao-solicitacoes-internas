import { calcularAtraso } from './backoff';

const CONFIG = { baseMs: 2_000, maxMs: 60_000 };
/** 0,5 é o meio do intervalo: jitter zero. */
const SEM_JITTER = () => 0.5;

describe('ADR-010: calcularAtraso (backoff exponencial com teto e jitter)', () => {
  it.each([
    [1, 2_000],
    [2, 4_000],
    [3, 8_000],
    [4, 16_000],
    [5, 32_000],
  ])(
    'ADR-010: na tentativa %i o atraso é base × 2^(tentativas − 1) = %i ms',
    (tentativas, esperado) => {
      expect(calcularAtraso(tentativas, CONFIG, SEM_JITTER)).toBe(esperado);
    },
  );

  it.each([6, 7, 8, 20, 60])(
    'ADR-010: na tentativa %i o atraso para no teto (maxMs)',
    (tentativas) => {
      expect(calcularAtraso(tentativas, CONFIG, SEM_JITTER)).toBe(60_000);
    },
  );

  it('ADR-010: o teto vale mesmo quando a base já é maior que ele', () => {
    expect(calcularAtraso(1, { baseMs: 90_000, maxMs: 60_000 }, SEM_JITTER)).toBe(60_000);
  });

  it('ADR-010: o jitter vai de −20% (aleatório 0) até quase +20% (aleatório perto de 1)', () => {
    expect(calcularAtraso(1, CONFIG, () => 0)).toBe(1_600);
    const maximo = calcularAtraso(1, CONFIG, () => 0.999_999);
    expect(maximo).toBeGreaterThan(2_390);
    expect(maximo).toBeLessThanOrEqual(2_400);
    expect(calcularAtraso(3, CONFIG, () => 0)).toBe(6_400);
  });

  it('ADR-010: o atraso é um número inteiro de milissegundos', () => {
    for (const aleatorio of [0, 0.123, 0.5, 0.777, 0.999]) {
      expect(
        Number.isInteger(calcularAtraso(2, { baseMs: 333, maxMs: 60_000 }, () => aleatorio)),
      ).toBe(true);
    }
  });

  it('ADR-010: sem gerador informado, varia dentro de ±20% do valor base (Math.random)', () => {
    const valores = Array.from({ length: 500 }, () => calcularAtraso(2, CONFIG));
    for (const valor of valores) {
      expect(valor).toBeGreaterThanOrEqual(3_200);
      expect(valor).toBeLessThanOrEqual(4_800);
    }
    // Com jitter, os atrasos não ficam todos iguais (evita reenvios sincronizados)
    expect(new Set(valores).size).toBeGreaterThan(10);
  });
});
