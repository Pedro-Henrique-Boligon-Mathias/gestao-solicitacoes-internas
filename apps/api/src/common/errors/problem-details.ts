import { HttpException, HttpStatus } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import type { ErroDeCampo, ProblemDetails } from './problem-details.schema';

export type { ErroDeCampo, ProblemDetails } from './problem-details.schema';

const BASE_TIPO = 'https://solicitacoes.local/erros';

interface TipoDeErro {
  code: string;
  slug: string;
  title: string;
}

const DADOS_INVALIDOS: TipoDeErro = {
  code: 'DADOS_INVALIDOS',
  slug: 'dados-invalidos',
  title: 'Dados inválidos',
};
const NAO_ENCONTRADO: TipoDeErro = {
  code: 'NAO_ENCONTRADO',
  slug: 'nao-encontrado',
  title: 'Recurso não encontrado',
};
const ERRO_INTERNO: TipoDeErro = {
  code: 'ERRO_INTERNO',
  slug: 'erro-interno',
  title: 'Erro interno',
};
const REQUISICAO_INVALIDA: TipoDeErro = {
  code: 'REQUISICAO_INVALIDA',
  slug: 'requisicao-invalida',
  title: 'Requisição inválida',
};

const POR_STATUS: Partial<Record<number, TipoDeErro>> = {
  [HttpStatus.BAD_REQUEST]: DADOS_INVALIDOS,
  [HttpStatus.NOT_FOUND]: NAO_ENCONTRADO,
};

// Mensagem padrão do Express/Nest para rota inexistente ("Cannot GET /x").
const ROTA_INEXISTENTE = /^Cannot [A-Z]+ /;

function tipoPara(status: number): TipoDeErro {
  if (status >= 500) return ERRO_INTERNO;
  return POR_STATUS[status] ?? REQUISICAO_INVALIDA;
}

function detalheDe(excecao: HttpException): string | undefined {
  if (excecao instanceof ZodValidationException) {
    return 'Um ou mais campos estão inválidos.';
  }
  const resposta = excecao.getResponse();
  const mensagem =
    typeof resposta === 'string' ? resposta : (resposta as { message?: unknown }).message;
  if (typeof mensagem === 'string') {
    return ROTA_INEXISTENTE.test(mensagem) ? 'O recurso solicitado não existe.' : mensagem;
  }
  if (Array.isArray(mensagem)) return mensagem.join('; ');
  return undefined;
}

function errosDeCampo(excecao: HttpException): ErroDeCampo[] | undefined {
  if (!(excecao instanceof ZodValidationException)) return undefined;
  const erro = excecao.getZodError();
  if (!(erro instanceof ZodError)) return undefined;
  return erro.issues.map((issue) => ({
    campo: issue.path.map(String).join('.'),
    mensagem: issue.message,
  }));
}

/**
 * Converte qualquer exceção em Problem Details.
 * Erros 5xx nunca expõem detalhes internos: só o requestId, para achar o log.
 */
export function paraProblemDetails(
  excecao: unknown,
  contexto: { instance: string; requestId?: string },
): ProblemDetails {
  const status =
    excecao instanceof HttpException ? excecao.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  const tipo = tipoPara(status);
  const detail = excecao instanceof HttpException && status < 500 ? detalheDe(excecao) : undefined;
  const errors = excecao instanceof HttpException ? errosDeCampo(excecao) : undefined;

  return {
    type: `${BASE_TIPO}/${tipo.slug}`,
    title: tipo.title,
    status,
    ...(detail ? { detail } : {}),
    instance: contexto.instance,
    code: tipo.code,
    ...(contexto.requestId ? { requestId: contexto.requestId } : {}),
    ...(errors ? { errors } : {}),
  };
}
