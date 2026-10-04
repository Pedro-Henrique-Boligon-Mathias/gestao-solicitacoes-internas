/**
 * Período dos dashboards (?periodo=). Vale só para os indicadores; listas e fila ignoram.
 * As janelas são móveis e contadas no fuso de São Paulo.
 */
export const PERIODOS = ['hoje', '7d', '30d', 'tudo'] as const;

export type Periodo = (typeof PERIODOS)[number];

const ROTULOS: Record<Periodo, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  tudo: 'Tudo',
};

const DIAS_ATRAS: Record<Exclude<Periodo, 'hoje' | 'tudo'>, number> = { '7d': 7, '30d': 30 };

function ehPeriodo(valor: unknown): valor is Periodo {
  return typeof valor === 'string' && (PERIODOS as readonly string[]).includes(valor);
}

/** Lê o valor de ?periodo=; inválido ou ausente vira `tudo`, repetido usa o primeiro. */
export function lerPeriodo(valor: string | string[] | undefined): Periodo {
  const primeiro = Array.isArray(valor) ? valor[0] : valor;
  return ehPeriodo(primeiro) ? primeiro : 'tudo';
}

export function rotuloPeriodo(periodo: Periodo): string {
  return ROTULOS[periodo];
}

const formatoDia = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Data civil (dia, mês, ano) de `instante` em São Paulo, como Date UTC à meia-noite. */
function diaEmSaoPaulo(instante: Date): Date {
  const partes = Object.fromEntries(
    formatoDia.formatToParts(instante).map((p) => [p.type, p.value]),
  );
  return new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)));
}

function ddmm(dia: Date): string {
  const d = String(dia.getUTCDate()).padStart(2, '0');
  const m = String(dia.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

/** Texto do intervalo coberto: `04/10`, `27/09 a 04/10` ou `desde o início`. */
export function intervaloPeriodo(periodo: Periodo, agora: Date = new Date()): string {
  if (periodo === 'tudo') return 'desde o início';
  const hoje = diaEmSaoPaulo(agora);
  if (periodo === 'hoje') return ddmm(hoje);
  const inicio = new Date(hoje);
  inicio.setUTCDate(inicio.getUTCDate() - DIAS_ATRAS[periodo]);
  return `${ddmm(inicio)} a ${ddmm(hoje)}`;
}
