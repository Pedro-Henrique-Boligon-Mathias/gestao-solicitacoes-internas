/**
 * Período dos dashboards (RF-04, PR 4C). Janela móvel calculada no servidor, no fuso
 * America/Sao_Paulo:
 * - `hoje`: da meia-noite de hoje até agora;
 * - `7d` e `30d`: exatamente 7 ou 30 dias antes de agora até agora;
 * - `tudo`: sem limite inferior.
 * `inicio` é inclusivo e `fim` é o instante da consulta.
 */
export const PERIODOS = ['hoje', '7d', '30d', 'tudo'] as const;
export type Periodo = (typeof PERIODOS)[number];

export const FUSO_DOS_DASHBOARDS = 'America/Sao_Paulo';

export interface LimitesDoPeriodo {
  valor: Periodo;
  inicio: Date | null;
  fim: Date;
}

const DIA_MS = 24 * 60 * 60 * 1000;

export function limitesDoPeriodo(valor: Periodo, agora: Date): LimitesDoPeriodo {
  const fim = new Date(agora.getTime());
  switch (valor) {
    case 'hoje':
      return { valor, inicio: inicioDoDia(agora, FUSO_DOS_DASHBOARDS), fim };
    case '7d':
      return { valor, inicio: new Date(fim.getTime() - 7 * DIA_MS), fim };
    case '30d':
      return { valor, inicio: new Date(fim.getTime() - 30 * DIA_MS), fim };
    case 'tudo':
      return { valor, inicio: null, fim };
  }
}

/** Meia-noite do dia de `instante` no `fuso`, como instante absoluto. */
export function inicioDoDia(instante: Date, fuso: string): Date {
  const { ano, mes, dia } = partesNoFuso(instante, fuso);
  const meiaNoiteUtc = Date.UTC(ano, mes - 1, dia);
  // Primeira aproximação com o deslocamento da meia-noite UTC; a segunda corrige se o
  // deslocamento mudar entre os dois instantes (horário de verão).
  let resultado = meiaNoiteUtc - deslocamentoMs(new Date(meiaNoiteUtc), fuso);
  resultado = meiaNoiteUtc - deslocamentoMs(new Date(resultado), fuso);
  return new Date(resultado);
}

interface Partes {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

const formatadores = new Map<string, Intl.DateTimeFormat>();

function partesNoFuso(instante: Date, fuso: string): Partes {
  let formatador = formatadores.get(fuso);
  if (!formatador) {
    formatador = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatadores.set(fuso, formatador);
  }
  const partes = formatador.formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? 0);
  return {
    ano: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    hora: valor('hour'),
    minuto: valor('minute'),
    segundo: valor('second'),
  };
}

/** Diferença entre a hora local no `fuso` e UTC, em milissegundos (São Paulo: -3 h). */
function deslocamentoMs(instante: Date, fuso: string): number {
  const p = partesNoFuso(instante, fuso);
  const localComoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return localComoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}
