import { HttpException, HttpStatus } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { ErroDeDominio, type CodigoDeErro } from './erro-de-dominio';
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

/** Status e título de cada erro de domínio; o `type` vem do code em kebab-case. */
const ERROS_DE_DOMINIO: Record<CodigoDeErro, { status: number; title: string }> = {
  NAO_AUTENTICADO: { status: HttpStatus.UNAUTHORIZED, title: 'Não autenticado' },
  CREDENCIAIS_INVALIDAS: { status: HttpStatus.UNAUTHORIZED, title: 'Credenciais inválidas' },
  SESSAO_INVALIDA: { status: HttpStatus.UNAUTHORIZED, title: 'Sessão inválida' },
  ACESSO_NEGADO: { status: HttpStatus.FORBIDDEN, title: 'Acesso negado' },
  MUITAS_TENTATIVAS: { status: HttpStatus.TOO_MANY_REQUESTS, title: 'Muitas tentativas' },
};

function tipoDoDominio(code: CodigoDeErro): TipoDeErro {
  return {
    code,
    slug: code.toLowerCase().replaceAll('_', '-'),
    title: ERROS_DE_DOMINIO[code].title,
  };
}

const POR_STATUS: Partial<Record<number, TipoDeErro>> = {
  [HttpStatus.BAD_REQUEST]: DADOS_INVALIDOS,
  [HttpStatus.UNAUTHORIZED]: tipoDoDominio('NAO_AUTENTICADO'),
  [HttpStatus.FORBIDDEN]: tipoDoDominio('ACESSO_NEGADO'),
  [HttpStatus.NOT_FOUND]: NAO_ENCONTRADO,
  [HttpStatus.TOO_MANY_REQUESTS]: tipoDoDominio('MUITAS_TENTATIVAS'),
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
  if (excecao instanceof ErroDeDominio) {
    const tipo = tipoDoDominio(excecao.code);
    return {
      type: `${BASE_TIPO}/${tipo.slug}`,
      title: tipo.title,
      status: ERROS_DE_DOMINIO[excecao.code].status,
      detail: excecao.detail,
      instance: contexto.instance,
      code: tipo.code,
      ...(contexto.requestId ? { requestId: contexto.requestId } : {}),
    };
  }

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
