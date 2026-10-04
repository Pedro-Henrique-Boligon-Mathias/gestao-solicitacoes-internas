'use server';

import { redirect } from 'next/navigation';
import { lerAccessToken } from '@/features/auth/sessao';
import { criarClienteApi } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ResultadoIntegridade } from './tipos';

type ProblemDetails = components['schemas']['ProblemDetails'];

const ERRO_GENERICO = 'Não foi possível concluir agora. Tente de novo em instantes.';
const TEMPO_LIMITE_MS = 30_000;
/** Rota que limpa os cookies e leva ao login quando a API recusa a sessão. */
const ENCERRAR_SESSAO = '/api/sessao/encerrar';

/**
 * Verifica a corrente de hashes do histórico (RN-10, doc 16): GET /auditoria/integridade em
 * nome de quem está logado (só o Admin passa). Adulteração é resultado (`ok: true`), não erro.
 * Só lê: não revalida nada. 401 segue o fluxo de sessão; as outras falhas trazem o requestId
 * (o da API ou, sem resposta, o enviado no X-Request-Id) para o suporte.
 */
export async function verificarIntegridade(): Promise<ResultadoIntegridade> {
  const requestId = crypto.randomUUID();
  let resultado: ResultadoIntegridade | 'sessao-recusada';
  try {
    const accessToken = await lerAccessToken();
    const cliente = criarClienteApi(accessToken ? { accessToken, requestId } : { requestId });
    const { data, error, response } = await cliente.GET('/api/v1/auditoria/integridade', {
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (response.status === 401) resultado = 'sessao-recusada';
    else if (response.ok && data) resultado = { ok: true, integridade: data };
    else resultado = falhaDoProblema(error, requestId);
  } catch {
    resultado = { ok: false, erro: ERRO_GENERICO, requestId };
  }

  if (resultado === 'sessao-recusada') redirect(ENCERRAR_SESSAO);
  return resultado;
}

function falhaDoProblema(problema: unknown, requestIdEnviado: string): ResultadoIntegridade {
  const corpo = (problema ?? {}) as Partial<ProblemDetails>;
  const falha: ResultadoIntegridade = {
    ok: false,
    erro: corpo.detail?.trim() || ERRO_GENERICO,
    requestId: corpo.requestId || requestIdEnviado,
  };
  if (corpo.code) falha.code = corpo.code;
  return falha;
}
