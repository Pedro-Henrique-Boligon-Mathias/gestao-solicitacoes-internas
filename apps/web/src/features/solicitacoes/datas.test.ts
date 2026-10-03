import { describe, expect, it } from 'vitest';
import { formatarData, formatarRelativo } from './datas';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

describe('P-11: datas no fuso de São Paulo', () => {
  it.each([
    ['2026-10-02T17:05:00.000Z', '02/10/2026 14:05'],
    ['2026-01-15T09:00:00.000Z', '15/01/2026 06:00'],
    ['2026-12-31T12:30:00.000Z', '31/12/2026 09:30'],
  ])('P-11: formatarData(%s) → %s', (iso, esperado) => {
    expect(formatarData(iso)).toBe(esperado);
  });

  it('P-11: na virada do dia em UTC, a data continua no dia anterior em São Paulo', () => {
    expect(formatarData('2026-10-03T02:30:00.000Z')).toBe('02/10/2026 23:30');
  });

  it('P-11: meia-noite em São Paulo aparece como 00:00, não 24:00', () => {
    expect(formatarData('2026-10-03T03:00:00.000Z')).toBe('03/10/2026 00:00');
  });
});

describe('P-11: data relativa nas listas', () => {
  const agora = new Date('2026-10-03T15:00:00.000Z');
  const antes = (ms: number) => new Date(agora.getTime() - ms).toISOString();

  it.each([
    ['30 segundos', 30_000, 'agora há pouco'],
    ['1 minuto', MINUTO, 'há 1 minuto'],
    ['5 minutos', 5 * MINUTO, 'há 5 minutos'],
    ['59 minutos', 59 * MINUTO, 'há 59 minutos'],
    ['3 horas', 3 * HORA, 'há 3 horas'],
    ['23 horas', 23 * HORA, 'há 23 horas'],
    ['2 dias e 5 horas', 2 * DIA + 5 * HORA, 'há 2 dias'],
    ['20 dias', 20 * DIA, 'há 20 dias'],
    ['45 dias', 45 * DIA, 'há 1 mês'],
    ['3 meses', 92 * DIA, 'há 3 meses'],
  ])('P-11: %s atrás → "%s"', (_descricao, diferenca, esperado) => {
    expect(formatarRelativo(antes(diferenca), agora)).toBe(esperado);
  });

  it('P-11: usa o horário atual quando "agora" não é informado', () => {
    const recente = new Date(Date.now() - 10_000).toISOString();
    expect(formatarRelativo(recente)).toBe('agora há pouco');
  });
});
