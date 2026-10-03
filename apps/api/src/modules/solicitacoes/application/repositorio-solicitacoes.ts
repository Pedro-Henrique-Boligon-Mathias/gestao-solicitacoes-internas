import type { StatusOutbox, TipoEventoIntegracao } from '../../integracoes/domain/tipos';
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
  /** Só as dessas áreas (área do solicitante na criação). */
  areaIds?: string[];
  ordenarPor: 'dataSolicitacao' | 'prioridade';
  direcao: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

/** Evento de integração como a API o enxerga: só as colunas de status, sem o conteúdo. */
export interface EventoIntegracao {
  id: string;
  tipo: TipoEventoIntegracao;
  status: StatusOutbox;
  tentativas: number;
  proximaTentativaEm: Date;
  criadoEm: Date;
  enviadoEm: Date | null;
}

/** Evento gravado na outbox junto com a mudança de status (ADR-010). */
export interface NovoEventoIntegracao {
  /** Também é a chave de idempotência do envio e o `id` do payload. */
  id: string;
  tipo: TipoEventoIntegracao;
  agregadoId: string;
  payload: Record<string, unknown>;
  correlationId: string | null;
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
  /** Eventos de integração da solicitação, em ordem cronológica. */
  abstract listarEventosIntegracao(solicitacaoId: string): Promise<EventoIntegracao[]>;
  /** Grava o evento na outbox, na transação corrente, como PENDENTE e pronto para envio. */
  abstract registrarEventoIntegracao(evento: NovoEventoIntegracao): Promise<void>;
  /**
   * Devolve à fila o evento em FALHOU mais antigo da solicitação (PENDENTE, tentativas 0, próxima
   * tentativa agora). `false` se não havia evento em FALHOU.
   */
  abstract reprocessarIntegracao(solicitacaoId: string): Promise<boolean>;
}
