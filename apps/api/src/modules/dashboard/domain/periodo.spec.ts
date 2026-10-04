import { inicioDoDia, limitesDoPeriodo, PERIODOS } from './periodo';

const DIA = 24 * 60 * 60 * 1000;

describe('RF-04: limites do período (America/Sao_Paulo)', () => {
  it('os valores aceitos são hoje, 7d, 30d e tudo', () => {
    expect(PERIODOS).toEqual(['hoje', '7d', '30d', 'tudo']);
  });

  it('hoje → da meia-noite em São Paulo até agora', () => {
    const agora = new Date('2026-10-04T15:20:30.123Z'); // 12:20 em SP
    expect(limitesDoPeriodo('hoje', agora)).toEqual({
      valor: 'hoje',
      inicio: new Date('2026-10-04T03:00:00.000Z'),
      fim: agora,
    });
  });

  it('hoje → logo depois da meia-noite UTC ainda é o dia anterior em São Paulo', () => {
    const agora = new Date('2026-10-05T01:30:00.000Z'); // 22:30 do dia 4 em SP
    expect(limitesDoPeriodo('hoje', agora).inicio).toEqual(new Date('2026-10-04T03:00:00.000Z'));
  });

  it('hoje → exatamente na meia-noite de São Paulo, início = agora', () => {
    const agora = new Date('2026-10-04T03:00:00.000Z');
    expect(limitesDoPeriodo('hoje', agora).inicio).toEqual(agora);
  });

  it.each([
    ['7d', 7],
    ['30d', 30],
  ] as const)('%s → exatamente %i dias antes de agora', (valor, dias) => {
    const agora = new Date('2026-10-04T15:20:30.123Z');
    const limites = limitesDoPeriodo(valor, agora);
    expect(limites.valor).toBe(valor);
    expect(limites.fim).toEqual(agora);
    expect(agora.getTime() - limites.inicio!.getTime()).toBe(dias * DIA);
  });

  it('tudo → sem início', () => {
    const agora = new Date('2026-10-04T15:20:30.123Z');
    expect(limitesDoPeriodo('tudo', agora)).toEqual({ valor: 'tudo', inicio: null, fim: agora });
  });

  it('fim é uma cópia de agora (não compartilha a instância)', () => {
    const agora = new Date('2026-10-04T15:20:30.123Z');
    expect(limitesDoPeriodo('tudo', agora).fim).not.toBe(agora);
  });

  it('inicioDoDia respeita o horário de verão de outro fuso (Nova York)', () => {
    expect(inicioDoDia(new Date('2026-07-01T12:00:00Z'), 'America/New_York')).toEqual(
      new Date('2026-07-01T04:00:00Z'),
    );
    expect(inicioDoDia(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toEqual(
      new Date('2026-01-15T05:00:00Z'),
    );
  });
});
