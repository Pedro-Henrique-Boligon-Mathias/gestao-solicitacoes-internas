import 'server-only';
import createClient from 'openapi-fetch';
import type { paths } from './schema';

export type OpcoesClienteApi = {
  /** Correlaciona a chamada com os logs da API; sem ele, gera um novo. */
  requestId?: string;
};

/**
 * Client tipado da API, gerado a partir do contrato OpenAPI.
 * Só roda no servidor do Next (BFF): dentro do Docker, API_URL aponta para o serviço "api".
 */
export function criarClienteApi(opcoes: OpcoesClienteApi = {}) {
  return createClient<paths>({
    baseUrl: process.env.API_URL ?? 'http://localhost:3001',
    headers: { 'X-Request-Id': opcoes.requestId ?? crypto.randomUUID() },
  });
}
