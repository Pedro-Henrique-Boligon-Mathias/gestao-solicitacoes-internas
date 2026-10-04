import type { Periodo } from './periodo';

/**
 * Granularidade da série da Entrada e saída (PR 4C): `hoje` não tem série; `7d` é por dia;
 * `30d` é por semana; `tudo` é por semana, ou por mês quando o intervalo passa de 16 semanas.
 * A semana começa na segunda-feira e os baldes seguem o fuso dos dashboards.
 */
export const GRANULARIDADES = ['dia', 'semana', 'mes'] as const;
export type Granularidade = (typeof GRANULARIDADES)[number];

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
export const LIMITE_SEMANAS_DO_TUDO = 16;

/**
 * `primeiroEvento` só importa em `tudo`: é o evento contado mais antigo, que marca o começo do
 * intervalo (sem eventos, o intervalo é vazio e fica por semana).
 */
export function granularidadeDoPeriodo(
  valor: Periodo,
  primeiroEvento: Date | null,
  fim: Date,
): Granularidade | null {
  switch (valor) {
    case 'hoje':
      return null;
    case '7d':
      return 'dia';
    case '30d':
      return 'semana';
    case 'tudo': {
      const intervalo = primeiroEvento ? fim.getTime() - primeiroEvento.getTime() : 0;
      return intervalo > LIMITE_SEMANAS_DO_TUDO * SEMANA_MS ? 'mes' : 'semana';
    }
  }
}

/** Unidade do `date_trunc` e passo do `generate_series` de cada granularidade. */
export const BALDES: Record<Granularidade, { unidade: string; passo: string }> = {
  dia: { unidade: 'day', passo: '1 day' },
  semana: { unidade: 'week', passo: '1 week' },
  mes: { unidade: 'month', passo: '1 month' },
};
