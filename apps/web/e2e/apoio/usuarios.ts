import path from 'node:path';
import type { Browser, Page } from '@playwright/test';

/** Usuários do seed usados nas jornadas. Ana, Carla e Diego aparecem no modo demonstração. */
export const USUARIOS = {
  ana: { nome: 'Ana Souza', email: 'ana.souza@demo.test', noModoDemonstracao: true },
  bruno: { nome: 'Bruno Lima', email: 'bruno.lima@demo.test', noModoDemonstracao: false },
  carla: { nome: 'Carla Mendes', email: 'carla.mendes@demo.test', noModoDemonstracao: true },
  diego: { nome: 'Diego Alves', email: 'diego.alves@demo.test', noModoDemonstracao: true },
} as const;

export type Apelido = keyof typeof USUARIOS;

export const APELIDOS = Object.keys(USUARIOS) as Apelido[];

/** Senha dos usuários do seed (a mesma do `SEED_PASSWORD` do compose). */
export const SENHA_SEED = process.env.SEED_PASSWORD ?? 'Demo@2026';

/** Arquivo com os cookies da sessão do usuário, gravado pelo setup. */
export const estadoDoUsuario = (apelido: Apelido) =>
  path.join(__dirname, '..', '.auth', `${apelido}.json`);

/**
 * Executa `acao` numa página com a sessão do usuário, num contexto próprio que é fechado no fim.
 * Serve para as jornadas com mais de uma pessoa.
 *
 * Os contextos do mesmo usuário partem do mesmo refresh token. Com a suíte em segundos e o access
 * token de 15 min, nenhum precisa renovar. Se a suíte passar de 15 min, renovações paralelas com o
 * mesmo token cairiam na regra de reuso e revogariam a sessão: aí o setup teria de logar de novo.
 */
export async function comoUsuario<T>(
  browser: Browser,
  apelido: Apelido,
  acao: (page: Page) => Promise<T>,
): Promise<T> {
  const contexto = await browser.newContext({ storageState: estadoDoUsuario(apelido) });
  try {
    return await acao(await contexto.newPage());
  } finally {
    await contexto.close();
  }
}
