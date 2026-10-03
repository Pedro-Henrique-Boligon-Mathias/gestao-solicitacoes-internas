import type { Cargo } from '../../../generated/prisma/client';

export interface UsuarioComArea {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  cargo: Cargo;
  ativo: boolean;
  area: { id: string; nome: string };
}

export interface SessaoComUsuario {
  id: string;
  familiaId: string;
  expiraEm: Date;
  usadoEm: Date | null;
  revogadaEm: Date | null;
  usuario: UsuarioComArea;
}

export interface NovaSessao {
  usuarioId: string;
  familiaId: string;
  refreshHash: string;
  expiraEm: Date;
  ip: string | null;
  userAgent: string | null;
}

export type MotivoRevogacao = 'LOGOUT' | 'REUSO';

/** Porta de persistência do módulo de autenticação (implementada com Prisma em infra/). */
export abstract class RepositorioAuth {
  abstract buscarUsuarioPorEmail(email: string): Promise<UsuarioComArea | null>;
  abstract buscarUsuarioPorId(id: string): Promise<UsuarioComArea | null>;
  abstract buscarSessaoPorRefreshHash(refreshHash: string): Promise<SessaoComUsuario | null>;
  abstract criarSessao(sessao: NovaSessao): Promise<{ id: string }>;
  /** Marca o token como usado só se ainda não foi usado nem revogado; devolve se conseguiu. */
  abstract marcarComoUsada(sessaoId: string, agora: Date): Promise<boolean>;
  abstract revogarFamilia(familiaId: string, motivo: MotivoRevogacao, agora: Date): Promise<void>;
  abstract revogarFamiliaDaSessao(
    sessaoId: string,
    motivo: MotivoRevogacao,
    agora: Date,
  ): Promise<void>;
}
