import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const HEADER_REQUEST_ID = 'X-Request-Id';

// Aceita só ids curtos e sem caracteres especiais, para não poluir o log com o que vier do cliente.
const REQUEST_ID_VALIDO = /^[\w-]{1,100}$/;

type RequisicaoComId = IncomingMessage & { id?: unknown };

/**
 * Devolve o requestId da requisição: o recebido no header, se for válido, ou um UUID novo.
 * É idempotente, porque o logger e o contexto (CLS) chamam esta função em middlewares diferentes.
 */
export function garantirRequestId(req: RequisicaoComId, res?: ServerResponse): string {
  let id = typeof req.id === 'string' ? req.id : undefined;
  if (!id) {
    const recebido = req.headers['x-request-id'];
    id = typeof recebido === 'string' && REQUEST_ID_VALIDO.test(recebido) ? recebido : randomUUID();
    req.id = id;
  }
  if (res && !res.headersSent) {
    res.setHeader(HEADER_REQUEST_ID, id);
  }
  return id;
}
