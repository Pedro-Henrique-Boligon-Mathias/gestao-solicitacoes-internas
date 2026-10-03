'use server';

import { redirect } from 'next/navigation';
import { criarClienteApi } from '@/lib/api/client';
import { destinoSeguro } from './destino';
import { apagarSessao, cabecalhosDoNavegador, gravarSessao, lerAccessToken } from './sessao';

export type EstadoEntrar = { erro: string } | undefined;

const MENSAGENS_POR_STATUS: Record<number, string> = {
  401: 'E-mail ou senha inválidos.',
  429: 'Muitas tentativas. Aguarde 1 minuto.',
};
const ERRO_GENERICO = 'Não foi possível entrar agora. Tente de novo em instantes.';
const TEMPO_LIMITE_MS = 10_000;

function texto(dados: FormData, campo: string): string {
  const valor = dados.get(campo);
  return typeof valor === 'string' ? valor : '';
}

/** Login: a API confere as credenciais; o Next guarda o par de tokens em cookies httpOnly. */
export async function entrar(
  _estadoAnterior: EstadoEntrar,
  dados: FormData,
): Promise<EstadoEntrar> {
  const email = texto(dados, 'email');
  const senha = texto(dados, 'senha');

  try {
    const { data, response } = await criarClienteApi().POST('/api/v1/auth/login', {
      body: { email, senha },
      headers: await cabecalhosDoNavegador(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!data) return { erro: MENSAGENS_POR_STATUS[response.status] ?? ERRO_GENERICO };
    await gravarSessao(data);
  } catch {
    return { erro: ERRO_GENERICO };
  }

  // Fora do try: o redirect do Next interrompe a action lançando um erro próprio
  redirect(destinoSeguro(texto(dados, 'next')));
}

/** Logout: revoga a sessão na API (se falhar, sai assim mesmo) e apaga os cookies. */
export async function sair(): Promise<void> {
  const accessToken = await lerAccessToken();
  if (accessToken) {
    try {
      await criarClienteApi({ accessToken }).POST('/api/v1/auth/logout', {
        cache: 'no-store',
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch {
      // A sessão expira sozinha; o importante é limpar os cookies deste navegador
    }
  }
  await apagarSessao();
  redirect('/login');
}
