import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { criarClienteApiAutenticado } from '@/lib/api/autenticado';
import { criarClienteApi } from '@/lib/api/client';
import type { Filtros } from './filtros';
import type {
  Area,
  EventoHistorico,
  PaginaSolicitacoes,
  ResumoDashboard,
  Solicitacao,
} from './tipos';

const TEMPO_LIMITE_MS = 10_000;

/** Leitura da API para as páginas: os dados ou a falha com o código para o suporte. */
export type Consulta<T> =
  { ok: true; dados: T } | { ok: false; status: number; requestId?: string };

type RespostaApi = { data?: unknown; error?: unknown; response: Response };

/**
 * Lê da API em nome de quem está logado, sempre sem cache (ADR-012: dados por usuário).
 * 401 segue o fluxo de sessão; as outras falhas voltam para a página decidir (404, erro inline).
 */
async function consultar<T>(
  chamada: (
    cliente: Awaited<ReturnType<typeof criarClienteApiAutenticado>>,
    opcoes: { cache: 'no-store'; signal: AbortSignal; headers: Record<string, string> },
  ) => Promise<RespostaApi>,
): Promise<Consulta<T>> {
  const requestId = crypto.randomUUID();
  let resultado: Consulta<T> | 'sessao-recusada';
  try {
    const cliente = await criarClienteApiAutenticado();
    const { data, error, response } = await chamada(cliente, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { 'X-Request-Id': requestId },
    });
    if (response.status === 401) resultado = 'sessao-recusada';
    else if (response.ok) resultado = { ok: true, dados: data as T };
    else {
      const corpo = (error ?? {}) as { requestId?: string };
      resultado = {
        ok: false,
        status: response.status,
        requestId: corpo.requestId ?? response.headers.get('X-Request-Id') ?? requestId,
      };
    }
  } catch {
    // Sem resposta (API fora do ar ou tempo esgotado): o requestId enviado ajuda a achar nos logs
    resultado = { ok: false, status: 0, requestId };
  }
  if (resultado === 'sessao-recusada') redirect('/api/sessao/encerrar');
  return resultado;
}

/** Resumo do dashboard; uma vez por requisição (o menu e o dashboard usam o mesmo). */
export const obterResumo = cache(() =>
  consultar<ResumoDashboard>((cliente, opcoes) => cliente.GET('/api/v1/dashboard/resumo', opcoes)),
);

/** Filtros da consulta: os da lista, mais a ordem por decisão (só o dashboard usa). */
export type FiltrosConsulta = Partial<Omit<Filtros, 'ordenarPor'>> & {
  ordenarPor?: Filtros['ordenarPor'] | 'decididoEm';
};

export function listarSolicitacoes(
  filtros: FiltrosConsulta,
  pageSize?: number,
): Promise<Consulta<PaginaSolicitacoes>> {
  const query = {
    q: filtros.q,
    status: filtros.status?.length ? filtros.status : undefined,
    prioridade: filtros.prioridade?.length ? filtros.prioridade : undefined,
    area: filtros.area?.length ? filtros.area : undefined,
    ordenarPor: filtros.ordenarPor,
    direcao: filtros.direcao,
    analista: filtros.analista,
    page: filtros.page,
    pageSize,
  };
  return consultar((cliente, opcoes) =>
    cliente.GET('/api/v1/solicitacoes', { params: { query }, ...opcoes }),
  );
}

export function detalharSolicitacao(id: string): Promise<Consulta<Solicitacao>> {
  return consultar((cliente, opcoes) =>
    cliente.GET('/api/v1/solicitacoes/{id}', { params: { path: { id } }, ...opcoes }),
  );
}

export function historicoSolicitacao(id: string): Promise<Consulta<EventoHistorico[]>> {
  return consultar((cliente, opcoes) =>
    cliente.GET('/api/v1/solicitacoes/{id}/historico', { params: { path: { id } }, ...opcoes }),
  );
}

/** Áreas iguais para todos: revalidadas a cada hora ou pela tag `areas`. */
const CACHE_AREAS = { tags: ['areas'], revalidate: 3600 };

/**
 * Áreas ativas, em ordem de nome. Rota pública e resposta igual para todos: é o único dado em
 * cache do app (ADR-012), por isso vai sem token, sem cookie e sem X-Request-Id (os cabeçalhos
 * entram na chave do cache do Next). Uma falha não derruba a página: quem chama só deixa de
 * mostrar o filtro.
 */
export async function listarAreas(): Promise<Consulta<Area[]>> {
  try {
    const { data, error, response } = await criarClienteApi().GET('/api/v1/areas', {
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      // Refaz a chamada só com a URL: o cache do Next lê `next` do init do fetch
      fetch: (requisicao: Request) =>
        fetch(requisicao.url, { signal: requisicao.signal, next: CACHE_AREAS }),
    });
    if (response.ok && data) return { ok: true, dados: data };
    const corpo = (error ?? {}) as { requestId?: string };
    const requestId = corpo.requestId ?? response.headers.get('X-Request-Id') ?? undefined;
    return { ok: false, status: response.status, ...(requestId ? { requestId } : {}) };
  } catch {
    return { ok: false, status: 0 };
  }
}
