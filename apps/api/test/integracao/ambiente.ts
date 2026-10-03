import path from 'node:path';

/** Raiz do pacote da API (onde ficam o prisma.config.ts e a pasta prisma/). */
export const RAIZ_API = path.resolve(__dirname, '..', '..');
/** Raiz do monorepo (onde fica a pasta infra/). */
export const RAIZ_REPOSITORIO = path.resolve(RAIZ_API, '..', '..');

export const IMAGEM_POSTGRES = 'postgres:17-alpine';
export const BANCO_PRINCIPAL = 'solicitacoes';

// Senhas descartáveis, só para o container efêmero dos testes.
export const SENHA_SUPERUSUARIO = 'teste-super';
export const SENHA_OWNER = 'teste-owner';
export const SENHA_RUNTIME = 'teste-runtime';
export const SENHA_WORKER = 'teste-worker';

/** Variáveis que o setup global publica para os arquivos de teste. */
export const VARIAVEIS = {
  host: 'TESTE_PG_HOST',
  porta: 'TESTE_PG_PORTA',
} as const;

export type Papel = 'superusuario' | 'owner' | 'runtime' | 'worker';

const CREDENCIAIS: Record<Papel, { usuario: string; senha: string }> = {
  superusuario: { usuario: 'postgres', senha: SENHA_SUPERUSUARIO },
  owner: { usuario: 'app_owner', senha: SENHA_OWNER },
  runtime: { usuario: 'app_runtime', senha: SENHA_RUNTIME },
  worker: { usuario: 'app_worker', senha: SENHA_WORKER },
};

/** URL de conexão do container de testes para o papel e o banco informados. */
export function urlBanco(papel: Papel, banco: string = BANCO_PRINCIPAL): string {
  const host = process.env[VARIAVEIS.host];
  const porta = process.env[VARIAVEIS.porta];
  if (!host || !porta) {
    throw new Error(
      'O container de testes não foi iniciado (rode com jest.integration.config.mjs).',
    );
  }
  const { usuario, senha } = CREDENCIAIS[papel];
  return `postgresql://${usuario}:${senha}@${host}:${porta}/${banco}`;
}
