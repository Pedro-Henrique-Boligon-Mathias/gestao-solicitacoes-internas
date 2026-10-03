/**
 * Dados de teste das telas de solicitações, no formato do contrato da API (schema.d.ts).
 * Só para testes: nada aqui é importado pelo código de produção.
 */
import type { components } from '@/lib/api/schema';

type Schemas = components['schemas'];

export type Usuario = Schemas['UsuarioAtualDto'];
export type Cargo = Usuario['cargo'];
export type Solicitacao = Schemas['SolicitacaoDto'];
export type Pagina = Schemas['PaginaSolicitacoesDto'];
export type ItemLista = Pagina['data'][number];
export type Resumo = Schemas['ResumoDto'];
export type Evento = Schemas['EventoHistoricoDto'];
export type Area = Schemas['AreaDto'];
export type Status = Solicitacao['status'];
export type Prioridade = Solicitacao['prioridade'];
export type Acao = Solicitacao['acoesPermitidas'][number] | 'REPROCESSAR_INTEGRACAO';

/**
 * Integração com o sistema externo no detalhe (ADR-010), no formato do contrato da API. Fixado
 * aqui para os testes não dependerem de quando o schema.d.ts for regenerado.
 */
export type StatusIntegracao = 'PENDENTE' | 'ENVIADO' | 'FALHOU';
export type TipoEventoIntegracao = 'SolicitacaoAprovada' | 'SolicitacaoReaberta';
export interface EventoIntegracao {
  id: string;
  tipo: TipoEventoIntegracao;
  status: StatusIntegracao;
  tentativas: number;
  criadoEm: string;
  enviadaEm: string | null;
}
/** Campos de topo: os do evento em foco (o mais antigo ainda não enviado; senão, o mais recente). */
export interface Integracao {
  status: StatusIntegracao;
  tipo: TipoEventoIntegracao;
  tentativas: number;
  maxTentativas: number;
  proximaTentativaEm: string;
  enviadaEm: string | null;
  /** Eventos não enviados depois do evento em foco. */
  aguardando: number;
  eventos: EventoIntegracao[];
}

/** Campos que os testes podem sobrescrever numa solicitação (inclui a integração). */
export type ParcialSolicitacao = Omit<Partial<Solicitacao>, 'acoesPermitidas'> & {
  acoesPermitidas?: Acao[];
  integracao?: Integracao | null;
};

export const ANA: Usuario = {
  id: '6a1f0c2e-0000-4000-8000-000000000001',
  nome: 'Ana Souza',
  email: 'ana.souza@demo.test',
  cargo: 'SOLICITANTE',
  area: { id: 'a0000000-0000-4000-8000-000000000001', nome: 'Financeiro' },
};

export const CARLA: Usuario = {
  id: '6a1f0c2e-0000-4000-8000-000000000002',
  nome: 'Carla Mendes',
  email: 'carla.mendes@demo.test',
  cargo: 'ANALISTA',
  area: { id: 'a0000000-0000-4000-8000-000000000002', nome: 'Tecnologia' },
};

export const DIEGO: Usuario = {
  id: '6a1f0c2e-0000-4000-8000-000000000003',
  nome: 'Diego Lima',
  email: 'diego.lima@demo.test',
  cargo: 'ADMIN',
  area: { id: 'a0000000-0000-4000-8000-000000000002', nome: 'Tecnologia' },
};

/** Áreas devolvidas por GET /areas, em ordem de nome (Financeiro é a da Ana; Tecnologia, a da Carla). */
export const AREAS: Area[] = [
  { id: 'a0000000-0000-4000-8000-000000000003', nome: 'Comercial' },
  { id: 'a0000000-0000-4000-8000-000000000001', nome: 'Financeiro' },
  { id: 'a0000000-0000-4000-8000-000000000004', nome: 'Recursos Humanos' },
  { id: 'a0000000-0000-4000-8000-000000000002', nome: 'Tecnologia' },
];

export const pessoa = (usuario: Usuario) => ({ id: usuario.id, nome: usuario.nome });

export function solicitacao(parcial: ParcialSolicitacao = {}): Solicitacao {
  return {
    id: 'c0000000-0000-4000-8000-000000000042',
    codigo: 'SOL-000042',
    titulo: 'Acesso ao sistema de folha',
    descricao: 'Preciso de acesso ao sistema de folha para fechar o mês.',
    prioridade: 'MEDIA',
    status: 'ABERTA',
    solicitante: pessoa(ANA),
    area: ANA.area,
    analista: null,
    decisao: null,
    dataSolicitacao: '2026-10-01T13:00:00.000Z',
    atualizadoEm: '2026-10-01T13:00:00.000Z',
    versao: 1,
    acoesPermitidas: [],
    integracao: null,
    ...parcial,
  } as Solicitacao;
}

export function eventoIntegracao(parcial: Partial<EventoIntegracao> = {}): EventoIntegracao {
  return {
    id: crypto.randomUUID(),
    tipo: 'SolicitacaoAprovada',
    status: 'PENDENTE',
    tentativas: 0,
    criadoEm: '2026-10-02T18:00:00.000Z',
    enviadaEm: null,
    ...parcial,
  };
}

/** Integração com um único evento, coerente com o status informado (padrão: PENDENTE). */
export function integracao(parcial: Partial<Integracao> = {}): Integracao {
  const status = parcial.status ?? 'PENDENTE';
  const tipo = parcial.tipo ?? 'SolicitacaoAprovada';
  const tentativas = parcial.tentativas ?? 0;
  const enviadaEm =
    parcial.enviadaEm !== undefined
      ? parcial.enviadaEm
      : status === 'ENVIADO'
        ? '2026-10-02T18:01:00.000Z'
        : null;
  return {
    status,
    tipo,
    tentativas,
    maxTentativas: 8,
    proximaTentativaEm: '2026-10-02T18:05:00.000Z',
    enviadaEm,
    aguardando: 0,
    eventos: [eventoIntegracao({ tipo, status, tentativas, enviadaEm })],
    ...parcial,
  };
}

export function item(parcial: Partial<ItemLista> = {}): ItemLista {
  return {
    id: 'c0000000-0000-4000-8000-000000000042',
    codigo: 'SOL-000042',
    titulo: 'Acesso ao sistema de folha',
    prioridade: 'MEDIA',
    status: 'ABERTA',
    solicitante: pessoa(ANA),
    area: ANA.area,
    analista: null,
    dataSolicitacao: '2026-10-01T13:00:00.000Z',
    atualizadoEm: '2026-10-01T13:00:00.000Z',
    ...parcial,
  };
}

export function pagina(itens: ItemLista[], meta: Partial<Pagina['meta']> = {}): Pagina {
  return {
    data: itens,
    meta: {
      page: 1,
      pageSize: 20,
      total: itens.length,
      totalPages: itens.length === 0 ? 0 : 1,
      ...meta,
    },
  };
}

export function resumo(parcial: Partial<Resumo> = {}): Resumo {
  return {
    escopo: 'GERAL',
    total: 40,
    porStatus: { ABERTA: 12, EM_ANALISE: 8, APROVADA: 14, REJEITADA: 6 },
    porPrioridade: { BAIXA: 10, MEDIA: 18, ALTA: 12 },
    filaAlta: 3,
    aberturaMaisAntiga: '2026-09-28T12:00:00.000Z',
    geradoEm: '2026-10-03T12:00:00.000Z',
    ...parcial,
  };
}

/**
 * Evento do histórico. O `comentario` é texto ou null na API; o cast cobre o tipo gerado
 * enquanto o schema.d.ts não reflete isso.
 */
export function evento(
  parcial: Omit<Partial<Evento>, 'comentario'> & { comentario?: string | null },
): Evento {
  return {
    id: crypto.randomUUID(),
    tipo: 'CRIADA',
    statusAnterior: null,
    statusNovo: 'ABERTA',
    comentario: null,
    autor: pessoa(ANA),
    dados: null,
    criadoEm: '2026-10-01T13:00:00.000Z',
    ...parcial,
  } as unknown as Evento;
}

/** Corpo de erro no formato Problem Details (RFC 9457) devolvido pela API. */
export function problema(
  status: number,
  code: string,
  extra: Partial<Schemas['ProblemDetails']> = {},
): Schemas['ProblemDetails'] {
  return {
    type: `https://httpstatuses.io/${status}`,
    title: 'Erro',
    status,
    code,
    instance: '/api/v1/solicitacoes',
    requestId: 'req-123',
    ...extra,
  };
}
