import { granularidadeDoPeriodo } from './granularidade';

const DIA = 24 * 60 * 60 * 1000;
const fim = new Date('2026-10-04T13:00:00.000Z');
const antes = (dias: number) => new Date(fim.getTime() - dias * DIA);

describe('RF-04: granularidade da série do painel de gestão', () => {
  it('hoje não tem série; 7d é por dia; 30d é por semana', () => {
    expect(granularidadeDoPeriodo('hoje', antes(1), fim)).toBeNull();
    expect(granularidadeDoPeriodo('7d', antes(300), fim)).toBe('dia');
    expect(granularidadeDoPeriodo('30d', antes(300), fim)).toBe('semana');
  });

  it('tudo é por semana até 16 semanas e por mês acima disso', () => {
    expect(granularidadeDoPeriodo('tudo', null, fim)).toBe('semana');
    expect(granularidadeDoPeriodo('tudo', antes(16 * 7), fim)).toBe('semana');
    expect(granularidadeDoPeriodo('tudo', new Date(antes(16 * 7).getTime() - 1), fim)).toBe('mes');
  });
});
