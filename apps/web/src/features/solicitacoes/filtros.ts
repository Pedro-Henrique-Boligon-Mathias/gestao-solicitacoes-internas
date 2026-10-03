import { PRIORIDADES, STATUS, type Prioridade, type Status } from './tipos';

export type OrdenarPor = 'dataSolicitacao' | 'prioridade';
export type Direcao = 'asc' | 'desc';

/** Estado da lista, sempre lido da URL. */
export interface Filtros {
  q?: string;
  status: Status[];
  prioridade: Prioridade[];
  ordenarPor: OrdenarPor;
  direcao: Direcao;
  analista?: 'eu';
  page: number;
}

export type ParametrosBusca = URLSearchParams | Record<string, string | string[] | undefined>;

export const FILTROS_PADRAO: Filtros = {
  status: [],
  prioridade: [],
  ordenarPor: 'dataSolicitacao',
  direcao: 'desc',
  page: 1,
};

function todos(params: ParametrosBusca, chave: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(chave);
  const valor = params[chave];
  if (valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

const primeiro = (params: ParametrosBusca, chave: string) => todos(params, chave)[0];

function somenteValidos<T extends string>(valores: string[], validos: readonly T[]): T[] {
  const lidos = valores.filter((v): v is T => (validos as readonly string[]).includes(v));
  return [...new Set(lidos)];
}

/** Lê os filtros da URL, ignorando valores inválidos e aplicando os padrões. */
export function lerFiltros(params: ParametrosBusca): Filtros {
  const filtros: Filtros = {
    ...FILTROS_PADRAO,
    status: somenteValidos(todos(params, 'status'), STATUS),
    prioridade: somenteValidos(todos(params, 'prioridade'), PRIORIDADES),
  };

  const q = primeiro(params, 'q')?.trim();
  if (q && q.length >= 2) filtros.q = q.slice(0, 200);

  if (primeiro(params, 'ordenarPor') === 'prioridade') filtros.ordenarPor = 'prioridade';
  if (primeiro(params, 'direcao') === 'asc') filtros.direcao = 'asc';
  if (primeiro(params, 'analista') === 'eu') filtros.analista = 'eu';

  const textoPagina = primeiro(params, 'page') ?? '';
  const pagina = /^\d+$/.test(textoPagina) ? Number(textoPagina) : 1;
  filtros.page = pagina >= 1 ? pagina : 1;

  return filtros;
}

/** Monta a query da URL (sem "?"), omitindo os valores padrão. */
export function montarQuery(filtros: Filtros): string {
  const params = new URLSearchParams();
  const q = filtros.q?.trim();
  if (q && q.length >= 2) params.set('q', q);
  for (const status of filtros.status) params.append('status', status);
  for (const prioridade of filtros.prioridade) params.append('prioridade', prioridade);
  if (filtros.ordenarPor !== FILTROS_PADRAO.ordenarPor)
    params.set('ordenarPor', filtros.ordenarPor);
  if (filtros.direcao !== FILTROS_PADRAO.direcao) params.set('direcao', filtros.direcao);
  if (filtros.analista) params.set('analista', filtros.analista);
  if (filtros.page > 1) params.set('page', String(filtros.page));
  return params.toString();
}

/** Caminho da lista com os filtros. */
export function urlDaLista(filtros: Filtros): string {
  const query = montarQuery(filtros);
  return query ? `/solicitacoes?${query}` : '/solicitacoes';
}

/** Há algum filtro que restringe o resultado (busca, status, prioridade ou analista)? */
export function temFiltroAtivo(filtros: Filtros): boolean {
  return Boolean(
    filtros.q || filtros.status.length || filtros.prioridade.length || filtros.analista,
  );
}
