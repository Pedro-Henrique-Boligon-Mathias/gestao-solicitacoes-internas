'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarClienteApiAutenticado } from '@/lib/api/autenticado';
import type { components } from '@/lib/api/schema';
import type { z } from 'zod';
import { ehIdDeSolicitacao } from './id';
import type { ResultadoAcao, ResultadoExclusao, ResultadoFalha } from './resultado';
import { criacaoSchema, decisaoSchema, edicaoSchema, reaberturaSchema } from './schemas';
import type { Prioridade, ResultadoDecisao, Solicitacao } from './tipos';

type ProblemDetails = components['schemas']['ProblemDetails'];

const ERRO_GENERICO = 'Não foi possível concluir agora. Tente de novo em instantes.';
const ERRO_DE_DADOS = 'Revise os campos destacados.';
const CAMPO_NAO_PERMITIDO = 'Campo não permitido.';
/** Mesma resposta de uma solicitação inexistente: o id inválido nem chega à API. */
const NAO_ENCONTRADA: ResultadoFalha = {
  ok: false,
  erro: 'Solicitação não encontrada.',
  code: 'NAO_ENCONTRADO',
};
const TEMPO_LIMITE_MS = 10_000;
/** Rota que limpa os cookies e leva ao login quando a API recusa a sessão. */
const ENCERRAR_SESSAO = '/api/sessao/encerrar';

type RespostaApi = { data?: unknown; error?: unknown; response: Response };

/** Sinal interno: a API recusou a sessão (o redirect fica fora do try). */
const SESSAO_RECUSADA = Symbol('sessao-recusada');

function falhaDoProblema(problema: unknown): ResultadoFalha {
  const corpo = (problema ?? {}) as Partial<ProblemDetails>;
  const falha: ResultadoFalha = {
    ok: false,
    erro: corpo.detail?.trim() || ERRO_GENERICO,
  };
  if (corpo.code) falha.code = corpo.code;
  if (Array.isArray(corpo.errors) && corpo.errors.length > 0) {
    falha.errosDeCampo = Object.fromEntries(
      corpo.errors.map(({ campo, mensagem }) => [campo, mensagem]),
    );
  }
  return falha;
}

/**
 * Valida o corpo recebido pela action (ela é um endpoint público): a API continua sendo a
 * autoridade, mas um corpo fora do formato nem sai do servidor.
 */
function validar<T extends z.ZodType>(
  schema: T,
  dados: unknown,
): { ok: true; dados: z.output<T> } | ResultadoFalha {
  const resultado = schema.safeParse(dados);
  if (resultado.success) return { ok: true, dados: resultado.data };
  const errosDeCampo: Record<string, string> = {};
  for (const issue of resultado.error.issues) {
    const campos =
      issue.code === 'unrecognized_keys' ? issue.keys : issue.path.slice(0, 1).map(String);
    const mensagem = issue.code === 'unrecognized_keys' ? CAMPO_NAO_PERMITIDO : issue.message;
    for (const campo of campos) errosDeCampo[campo] ??= mensagem;
  }
  const falha: ResultadoFalha = { ok: false, erro: ERRO_DE_DADOS };
  if (Object.keys(errosDeCampo).length > 0) falha.errosDeCampo = errosDeCampo;
  return falha;
}

function revalidar(id: string) {
  revalidatePath(`/solicitacoes/${id}`);
  revalidatePath('/solicitacoes');
  revalidatePath('/dashboard');
}

/**
 * Chama a API em nome de quem está logado e traduz a resposta: sucesso revalida as telas,
 * Problem Details vira `erro`/`code`/`errosDeCampo`, 401 segue o fluxo de sessão.
 */
async function executar(
  chamada: (
    cliente: Awaited<ReturnType<typeof criarClienteApiAutenticado>>,
    opcoes: { cache: 'no-store'; signal: AbortSignal },
  ) => Promise<RespostaApi>,
  idConhecido?: string,
): Promise<{ ok: true; data: unknown } | ResultadoFalha> {
  let resultado: { ok: true; data: unknown } | ResultadoFalha | typeof SESSAO_RECUSADA;
  try {
    const cliente = await criarClienteApiAutenticado();
    const { data, error, response } = await chamada(cliente, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (response.status === 401) resultado = SESSAO_RECUSADA;
    else if (response.ok) resultado = { ok: true, data };
    else resultado = falhaDoProblema(error);
  } catch {
    resultado = { ok: false, erro: ERRO_GENERICO };
  }

  if (resultado === SESSAO_RECUSADA) redirect(ENCERRAR_SESSAO);
  if (resultado.ok) {
    const id = idConhecido ?? (resultado.data as Solicitacao | undefined)?.id;
    if (id) revalidar(id);
  }
  return resultado;
}

async function comSolicitacao(
  promessa: Promise<{ ok: true; data: unknown } | ResultadoFalha>,
): Promise<ResultadoAcao> {
  const resultado = await promessa;
  return resultado.ok ? { ok: true, solicitacao: resultado.data as Solicitacao } : resultado;
}

export async function criarSolicitacao(dados: {
  titulo: string;
  descricao: string;
  prioridade: Prioridade;
}): Promise<ResultadoAcao> {
  const corpo = validar(criacaoSchema, dados);
  if (!corpo.ok) return corpo;
  return comSolicitacao(
    executar((cliente, opcoes) =>
      cliente.POST('/api/v1/solicitacoes', { body: corpo.dados, ...opcoes }),
    ),
  );
}

export async function editarSolicitacao(
  id: string,
  dados: { titulo?: string; descricao?: string; prioridade?: Prioridade; versao: number },
): Promise<ResultadoAcao> {
  if (!ehIdDeSolicitacao(id)) return NAO_ENCONTRADA;
  const corpo = validar(edicaoSchema, dados);
  if (!corpo.ok) return corpo;
  return comSolicitacao(
    executar(
      (cliente, opcoes) =>
        cliente.PATCH('/api/v1/solicitacoes/{id}', {
          params: { path: { id } },
          body: corpo.dados,
          ...opcoes,
        }),
      id,
    ),
  );
}

export async function excluirSolicitacao(id: string): Promise<ResultadoExclusao> {
  if (!ehIdDeSolicitacao(id)) return NAO_ENCONTRADA;
  const resultado = await executar(
    (cliente, opcoes) =>
      cliente.DELETE('/api/v1/solicitacoes/{id}', { params: { path: { id } }, ...opcoes }),
    id,
  );
  return resultado.ok ? { ok: true } : resultado;
}

export async function iniciarAnalise(id: string): Promise<ResultadoAcao> {
  if (!ehIdDeSolicitacao(id)) return NAO_ENCONTRADA;
  return comSolicitacao(
    executar(
      (cliente, opcoes) =>
        cliente.POST('/api/v1/solicitacoes/{id}/analise', {
          params: { path: { id } },
          ...opcoes,
        }),
      id,
    ),
  );
}

export async function decidirSolicitacao(
  id: string,
  dados: { resultado: ResultadoDecisao; comentario: string },
): Promise<ResultadoAcao> {
  if (!ehIdDeSolicitacao(id)) return NAO_ENCONTRADA;
  const corpo = validar(decisaoSchema, dados);
  if (!corpo.ok) return corpo;
  return comSolicitacao(
    executar(
      (cliente, opcoes) =>
        cliente.POST('/api/v1/solicitacoes/{id}/decisao', {
          params: { path: { id } },
          body: corpo.dados,
          ...opcoes,
        }),
      id,
    ),
  );
}

export async function reabrirSolicitacao(
  id: string,
  dados: { justificativa: string },
): Promise<ResultadoAcao> {
  if (!ehIdDeSolicitacao(id)) return NAO_ENCONTRADA;
  const corpo = validar(reaberturaSchema, dados);
  if (!corpo.ok) return corpo;
  return comSolicitacao(
    executar(
      (cliente, opcoes) =>
        cliente.POST('/api/v1/solicitacoes/{id}/reabertura', {
          params: { path: { id } },
          body: corpo.dados,
          ...opcoes,
        }),
      id,
    ),
  );
}
