import { describe, expect, it } from 'vitest';
import { PERIODOS, intervaloPeriodo, lerPeriodo, rotuloPeriodo } from './periodo';

/*
 * Período dos dashboards (Fase 3.5, PR 4C): fica em ?periodo= e vale só para os indicadores.
 * As opções são janelas móveis no fuso de São Paulo: Hoje (desde a meia-noite), Últimos 7 dias,
 * Últimos 30 dias e Tudo (padrão).
 */

/** 04/10/2026 09:42 em São Paulo. */
const AGORA = new Date('2026-10-04T12:42:00.000Z');

describe('RF-04: período dos dashboards', () => {
  it('RF-04: as opções são hoje, 7d, 30d e tudo, nessa ordem', () => {
    expect(PERIODOS).toEqual(['hoje', '7d', '30d', 'tudo']);
  });

  it.each(['hoje', '7d', '30d', 'tudo'] as const)('RF-04: ?periodo=%s é aceito', (valor) => {
    expect(lerPeriodo(valor)).toBe(valor);
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['desconhecido', '90d'],
    ['maiúsculo', 'HOJE'],
    ['com espaço', ' 7d'],
  ])('RF-04: valor %s cai em tudo', (_caso, valor) => {
    expect(lerPeriodo(valor)).toBe('tudo');
  });

  it('RF-04: ?periodo= repetido usa o primeiro valor', () => {
    expect(lerPeriodo(['30d', 'hoje'])).toBe('30d');
    expect(lerPeriodo(['xyz', 'hoje'])).toBe('tudo');
  });

  it.each([
    ['hoje', 'Hoje'],
    ['7d', 'Últimos 7 dias'],
    ['30d', 'Últimos 30 dias'],
    ['tudo', 'Tudo'],
  ] as const)('RF-04: %s tem o rótulo "%s"', (valor, rotulo) => {
    expect(rotuloPeriodo(valor)).toBe(rotulo);
  });

  it.each([
    ['hoje', '04/10'],
    ['7d', '27/09 a 04/10'],
    ['30d', '04/09 a 04/10'],
    ['tudo', 'desde o início'],
  ] as const)('RF-04: o intervalo de %s é "%s"', (valor, intervalo) => {
    expect(intervaloPeriodo(valor, AGORA)).toBe(intervalo);
  });

  it('RF-04: o intervalo usa o fuso de São Paulo (23:30 de 03/10 ainda é 03/10)', () => {
    const quaseMeiaNoite = new Date('2026-10-04T02:30:00.000Z');
    expect(intervaloPeriodo('hoje', quaseMeiaNoite)).toBe('03/10');
    expect(intervaloPeriodo('7d', quaseMeiaNoite)).toBe('26/09 a 03/10');
  });
});
