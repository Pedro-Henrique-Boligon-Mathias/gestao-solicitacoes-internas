const FUSO = 'America/Sao_Paulo';

const formatoCompleto = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: FUSO,
});

const formatoCurto = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: FUSO,
});

const relativo = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' });

/** Data completa no fuso de São Paulo: "dd/MM/yyyy HH:mm". */
export function formatarData(iso: string): string {
  const partes = Object.fromEntries(
    formatoCompleto.formatToParts(new Date(iso)).map((parte) => [parte.type, parte.value]),
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

/** Dia e mês no fuso de São Paulo: "dd/MM". */
export function formatarDiaMes(iso: string): string {
  return formatoCurto.format(new Date(iso));
}

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const MES = 30 * DIA;
const ANO = 365 * DIA;

/** Tempo relativo arredondado para baixo: "agora há pouco", "há 5 minutos", "há 2 dias"… */
export function formatarRelativo(iso: string, agora: Date = new Date()): string {
  const diferenca = Math.max(0, agora.getTime() - new Date(iso).getTime());
  if (diferenca < MINUTO) return 'agora há pouco';
  const unidades: [number, Intl.RelativeTimeFormatUnit][] = [
    [ANO, 'year'],
    [MES, 'month'],
    [DIA, 'day'],
    [HORA, 'hour'],
    [MINUTO, 'minute'],
  ];
  for (const [tamanho, unidade] of unidades) {
    if (diferenca >= tamanho) return relativo.format(-Math.floor(diferenca / tamanho), unidade);
  }
  return 'agora há pouco';
}

const SEGUNDO = 1_000;

/**
 * Tempo relativo no futuro, arredondado para baixo: "em 30 segundos", "em 5 minutos", "em 2
 * horas". Uma data que já passou (ou falta menos de um segundo) vira "em instantes".
 */
export function formatarFuturo(iso: string, agora: Date = new Date()): string {
  const diferenca = new Date(iso).getTime() - agora.getTime();
  if (diferenca < SEGUNDO) return 'em instantes';
  const unidades: [number, Intl.RelativeTimeFormatUnit][] = [
    [ANO, 'year'],
    [MES, 'month'],
    [DIA, 'day'],
    [HORA, 'hour'],
    [MINUTO, 'minute'],
    [SEGUNDO, 'second'],
  ];
  for (const [tamanho, unidade] of unidades) {
    if (diferenca >= tamanho) return relativo.format(Math.floor(diferenca / tamanho), unidade);
  }
  return 'em instantes';
}

/** Duração curta até agora, para o card de destaque: "8d", "5h", "12min". */
export function formatarEspera(iso: string, agora: Date = new Date()): string {
  const diferenca = Math.max(0, agora.getTime() - new Date(iso).getTime());
  if (diferenca >= DIA) return `${Math.floor(diferenca / DIA)}d`;
  if (diferenca >= HORA) return `${Math.floor(diferenca / HORA)}h`;
  return `${Math.floor(diferenca / MINUTO)}min`;
}
