import type { Cargo, Prioridade, Resultado, Status } from '../domain/tipos';

export interface Pessoa {
  id: string;
  nome: string;
}

/** Quem consulta: o repositório recorta pelo solicitante quando o cargo é SOLICITANTE (RN-13). */
export interface Visao {
  usuarioId: string;
  cargo: Cargo;
}

export interface ItemSolicitacao {
  id: string;
  codigo: number;
  titulo: string;
  prioridade: Prioridade;
  status: Status;
  solicitante: Pessoa;
  area: Pessoa;
  analista: Pessoa | null;
  dataSolicitacao: Date;
  atualizadoEm: Date;
}

export interface SolicitacaoDetalhada extends ItemSolicitacao {
  solicitanteId: string;
  analistaId: string | null;
  descricao: string;
  decisaoComentario: string | null;
  decididoEm: Date | null;
  decididoPor: Pessoa | null;
  versao: number;
}

export type TipoEvento =
  'CRIADA' | 'EDITADA' | 'ANALISE_INICIADA' | 'APROVADA' | 'REJEITADA' | 'REABERTA' | 'EXCLUIDA';

export interface NovoEvento {
  solicitacaoId: string;
  tipo: TipoEvento;
  statusAnterior: Status | null;
  statusNovo: Status | null;
  comentario: string | null;
  autorId: string;
  dados: Record<string, unknown> | null;
}

export interface EventoDetalhado {
  id: string;
  tipo: TipoEvento;
  statusAnterior: Status | null;
  statusNovo: Status | null;
  comentario: string | null;
  autor: Pessoa;
  dados: Record<string, unknown> | null;
  criadoEm: Date;
}

export interface CamposEditaveis {
  titulo?: string;
  descricao?: string;
  prioridade?: Prioridade;
}

export interface FiltrosLista {
  /** Termo já sem espaços nas pontas; busca no título e na descrição, sem acento. */
  termo?: string;
  /** Código interpretado do termo (SOL-000042, 42), também comparado com `codigo`. */
  codigo?: number;
  status?: Status[];
  prioridade?: Prioridade[];
  /** Só as que têm este usuário como analista responsável. */
  analistaId?: string;
  ordenarPor: 'dataSolicitacao' | 'prioridade';
  direcao: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface PaginaSolicitacoes {
  itens: ItemSolicitacao[];
  total: number;
}

/**
 * Porta de persistência das solicitações (implementada com Prisma em infra/). Toda leitura ignora
 * as excluídas (RN-12). As escritas de estado são condicionais: devolvem `false` quando nenhuma
 * linha atendeu à condição (status ou versão mudaram no meio do caminho, RN-11).
 */
export abstract class RepositorioSolicitacoes {
  abstract buscar(id: string, visao: Visao): Promise<SolicitacaoDetalhada | null>;
  abstract listar(filtros: FiltrosLista, visao: Visao): Promise<PaginaSolicitacoes>;
  abstract criar(dados: {
    titulo: string;
    descricao: string;
    prioridade: Prioridade;
    solicitanteId: string;
    areaId: string;
    agora: Date;
  }): Promise<string>;
  abstract editar(
    id: string,
    condicao: { versao: number; statusPermitidos: Status[] },
    campos: CamposEditaveis,
    agora: Date,
  ): Promise<boolean>;
  abstract excluir(
    id: string,
    condicao: { statusPermitidos: Status[] },
    agora: Date,
  ): Promise<boolean>;
  abstract iniciarAnalise(id: string, analistaId: string, agora: Date): Promise<boolean>;
  abstract decidir(
    id: string,
    decisao: { resultado: Resultado; comentario: string; decididoPorId: string },
    agora: Date,
  ): Promise<boolean>;
  abstract reabrir(id: string, statusAtual: Status, agora: Date): Promise<boolean>;
  /**
   * Grava o evento com `criado_em` do relógio do banco no momento do INSERT (clock_timestamp()), e
   * não com a hora do início da requisição: em corridas, a linha do tempo segue a ordem real das
   * gravações.
   */
  abstract registrarEvento(evento: NovoEvento): Promise<void>;
  abstract listarHistorico(solicitacaoId: string): Promise<EventoDetalhado[]>;
}
