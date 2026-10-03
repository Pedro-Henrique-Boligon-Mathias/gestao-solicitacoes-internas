import 'server-only';
import { criarClienteApi } from './client';
import type { components } from './schema';

export type RespostaProntidao = components['schemas']['RespostaProntidaoDto'];

export type SituacaoApi =
  { alcancavel: true; prontidao: RespostaProntidao } | { alcancavel: false; motivo: string };

const FORMATO_INESPERADO = 'A API respondeu num formato inesperado.';

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function ehEstadoComponente(valor: unknown): boolean {
  return ehObjeto(valor) && (valor.status === 'up' || valor.status === 'down');
}

/** O corpo vem da rede: confere o formato do contrato antes de confiar nele. */
function ehRespostaProntidao(valor: unknown): valor is RespostaProntidao {
  if (!ehObjeto(valor) || (valor.status !== 'ok' && valor.status !== 'error')) return false;
  return ehObjeto(valor.details) && ehEstadoComponente(valor.details.database);
}

export async function consultarProntidaoApi(timeoutMs = 3_000): Promise<SituacaoApi> {
  try {
    const { data, error } = await criarClienteApi().GET('/health/ready', {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 503 também traz o corpo com o estado de cada componente
    const prontidao: unknown = data ?? error;
    if (!ehRespostaProntidao(prontidao)) {
      return { alcancavel: false, motivo: FORMATO_INESPERADO };
    }
    return { alcancavel: true, prontidao };
  } catch (erro) {
    if (erro instanceof SyntaxError) return { alcancavel: false, motivo: FORMATO_INESPERADO };
    if (ehObjeto(erro) && erro.name === 'TimeoutError') {
      return { alcancavel: false, motivo: 'A API não respondeu a tempo.' };
    }
    return { alcancavel: false, motivo: 'Não foi possível conectar à API.' };
  }
}
