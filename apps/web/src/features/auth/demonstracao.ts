import type { Cargo } from './usuario';

/** Usuário do seed (apps/api/prisma/seed.ts) mostrado no modo demonstração do login. */
export interface UsuarioDemonstracao {
  nome: string;
  email: string;
  cargo: Cargo;
  area: string;
}

/** Um usuário por cargo, na ordem do mock do login. Sem senha: ela vem de SEED_PASSWORD. */
export const USUARIOS_DEMONSTRACAO: readonly UsuarioDemonstracao[] = [
  { nome: 'Carla Mendes', email: 'carla.mendes@demo.test', cargo: 'ANALISTA', area: 'Tecnologia' },
  { nome: 'Ana Souza', email: 'ana.souza@demo.test', cargo: 'SOLICITANTE', area: 'Financeiro' },
  { nome: 'Diego Alves', email: 'diego.alves@demo.test', cargo: 'ADMIN', area: 'Tecnologia' },
];

/**
 * Modo demonstração (P1): ligado só com DEMO_MODE=true no servidor do web. Lido a cada
 * requisição, nunca no topo do módulo. Desligado, devolve null e a senha não sai do servidor.
 */
export function lerModoDemonstracao(): { senha: string } | null {
  if (process.env.DEMO_MODE !== 'true') return null;
  return { senha: process.env.SEED_PASSWORD ?? '' };
}
