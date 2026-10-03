import { describe, expect, it } from 'vitest';
import { formatarFuturo } from './datas';

const AGORA = new Date('2026-10-03T12:00:00.000Z');
const depois = (ms: number) => new Date(AGORA.getTime() + ms).toISOString();

describe('ADR-010: próxima tentativa da integração em tempo futuro', () => {
  it.each([
    [30_000, 'em 30 segundos'],
    [5 * 60_000, 'em 5 minutos'],
    [90 * 60_000, 'em 1 hora'],
    [2 * 24 * 60 * 60_000, 'em 2 dias'],
  ])('ADR-010: %i ms à frente → "%s"', (ms, esperado) => {
    expect(formatarFuturo(depois(ms), AGORA)).toBe(esperado);
  });

  it('ADR-010: horário já vencido ou a menos de 1 segundo vira "em instantes"', () => {
    expect(formatarFuturo(depois(-5_000), AGORA)).toBe('em instantes');
    expect(formatarFuturo(depois(500), AGORA)).toBe('em instantes');
  });
});
