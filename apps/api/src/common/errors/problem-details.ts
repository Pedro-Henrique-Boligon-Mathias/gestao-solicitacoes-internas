import { HttpException, HttpStatus } from '@nestjs/common';

/** Corpo de erro no formato RFC 9457 (application/problem+json). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  requestId?: string;
}

const TITULOS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Requisição inválida',
  [HttpStatus.UNAUTHORIZED]: 'Não autenticado',
  [HttpStatus.FORBIDDEN]: 'Acesso negado',
  [HttpStatus.NOT_FOUND]: 'Recurso não encontrado',
  [HttpStatus.CONFLICT]: 'Conflito',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Muitas requisições',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Erro interno',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Serviço indisponível',
};

function tituloPara(status: number): string {
  return TITULOS[status] ?? (status >= 500 ? 'Erro interno' : 'Erro na requisição');
}

function detalheDe(excecao: HttpException): string | undefined {
  const resposta = excecao.getResponse();
  if (typeof resposta === 'string') return resposta;
  const mensagem = (resposta as { message?: unknown }).message;
  if (typeof mensagem === 'string') return mensagem;
  if (Array.isArray(mensagem)) return mensagem.join('; ');
  return undefined;
}

/**
 * Converte qualquer exceção em Problem Details.
 * Erros inesperados nunca expõem detalhes internos: só o requestId para achar o log.
 */
export function paraProblemDetails(
  excecao: unknown,
  contexto: { instance: string; requestId?: string },
): ProblemDetails {
  if (excecao instanceof HttpException) {
    const status = excecao.getStatus();
    const detail = status < 500 ? detalheDe(excecao) : undefined;
    return {
      type: 'about:blank',
      title: tituloPara(status),
      status,
      ...(detail ? { detail } : {}),
      instance: contexto.instance,
      ...(contexto.requestId ? { requestId: contexto.requestId } : {}),
    };
  }

  return {
    type: 'about:blank',
    title: tituloPara(HttpStatus.INTERNAL_SERVER_ERROR),
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: 'Ocorreu um erro inesperado. Informe o requestId ao suporte.',
    instance: contexto.instance,
    ...(contexto.requestId ? { requestId: contexto.requestId } : {}),
  };
}
