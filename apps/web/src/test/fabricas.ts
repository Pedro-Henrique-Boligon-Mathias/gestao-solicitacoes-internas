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
  nome: 'Diego Alves',
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

/**
 * Campos do item da lista que alimentam os dashboards por cargo (Fase 3.5, PR 4B), no formato do
 * contrato da API. Fixados aqui para os testes não dependerem de quando o schema.d.ts for
 * regenerado; depois da regeneração, `ItemLista` já os tem e a interseção não muda nada.
 */
export type DecisaoItem = NonNullable<Solicitacao['decisao']>;
export interface CamposDashboardItem {
  /** Último início de análise; só em EM_ANALISE (null nas demais). */
  analiseIniciadaEm: string | null;
  /** Decisão das decididas, igual à do detalhe; null nas outras. */
  decisao: DecisaoItem | null;
}
export type ItemComDashboard = ItemLista & CamposDashboardItem;

/** Decisão de uma solicitação decidida (padrão: aprovada pela Carla). */
export function decisao(parcial: Partial<DecisaoItem> = {}): DecisaoItem {
  return {
    resultado: 'APROVADA',
    comentario: 'Aprovado conforme a política de perfis.',
    decididoEm: '2026-10-02T15:00:00.000Z',
    decididoPor: { id: CARLA.id, nome: CARLA.nome },
    ...parcial,
  } as DecisaoItem;
}

export function item(parcial: Partial<ItemComDashboard> = {}): ItemComDashboard {
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
    analiseIniciadaEm: null,
    decisao: null,
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
    // Sem ?periodo= a API devolve tudo: início nulo e fim no instante da consulta
    periodo: { valor: 'tudo', inicio: null, fim: '2026-10-03T12:00:00.000Z' },
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

// ---- Painel de gestão do admin (GET /dashboard/gestao, Fase 3.5, PR 4C) ----

export type Gestao = Schemas['GestaoDto'];
export type PeriodoGestao = Gestao['periodo'];
export type PeriodoValor = PeriodoGestao['valor'];
export type Granularidade = PeriodoGestao['granularidade'];
export type EntradaSaida = Gestao['entradaSaida'];
export type BaldeSerie = EntradaSaida['serie'][number];
export type AreaGestao = Gestao['porArea'][number];
export type AnalistaGestao = Gestao['porAnalista'][number];
/** O contrato gera `tipo: string`; nos testes ele fica restrito aos dois eventos da outbox. */
export type IntegracaoComFalha = Omit<Gestao['integracoesComFalha'][number], 'tipo'> & {
  tipo: TipoEventoIntegracao;
};
type Contagem<K extends string> = Record<K, number>;

/** Áreas do painel: as quatro com solicitações e as duas sem nenhuma (Jurídico e Operações). */
export const AREA_JURIDICO: Area = { id: 'a0000000-0000-4000-8000-000000000005', nome: 'Jurídico' };
export const AREA_OPERACOES: Area = {
  id: 'a0000000-0000-4000-8000-000000000006',
  nome: 'Operações',
};
const areaPorNome = (nome: string): Area => AREAS.find((a) => a.nome === nome)!;

export function areaGestao(area: Area, porStatus: Partial<Contagem<Status>> = {}): AreaGestao {
  const status = { ABERTA: 0, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0, ...porStatus };
  const total = status.ABERTA + status.EM_ANALISE + status.APROVADA + status.REJEITADA;
  return { area: { id: area.id, nome: area.nome }, total, porStatus: status };
}

export function analistaGestao(parcial: Partial<AnalistaGestao> = {}): AnalistaGestao {
  const base = {
    analista: { id: CARLA.id, nome: CARLA.nome },
    emAnaliseAgora: 4,
    decididas: 11,
    aprovadas: 8,
    ...parcial,
  };
  const taxa = base.decididas > 0 ? base.aprovadas / base.decididas : null;
  return { taxaAprovacao: taxa, ...base };
}

/** N analistas extras (para "Ver todos"), com carga decrescente depois dos três do seed. */
export function analistasExtras(quantidade: number): AnalistaGestao[] {
  return Array.from({ length: quantidade }, (_, i) =>
    analistaGestao({
      analista: {
        id: `6a1f0c2e-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
        nome: `Analista Extra ${String(i + 1).padStart(2, '0')}`,
      },
      emAnaliseAgora: 0,
      decididas: 1,
      aprovadas: 1,
    }),
  );
}

export function integracaoComFalha(parcial: Partial<IntegracaoComFalha> = {}): IntegracaoComFalha {
  return {
    solicitacao: {
      id: 'c0000000-0000-4000-8000-000000000024',
      codigo: 'SOL-000024',
      titulo: 'Liberação de acesso ao internet banking da empresa',
      solicitante: pessoa(ANA),
      area: areaPorNome('Financeiro'),
    },
    tipo: 'SolicitacaoAprovada',
    tentativas: 5,
    maxTentativas: 5,
    ultimoErro: 'Sistema externo respondeu 503',
    ultimaTentativaEm: '2026-10-04T11:15:00.000Z', // 04/10 08:15 em São Paulo
    ...parcial,
  };
}

/** Um balde por dia dos últimos 7 dias (27/09 a 04/10), à meia-noite de São Paulo. */
const SERIE_7D: BaldeSerie[] = [
  [1, 1],
  [2, 4],
  [1, 3],
  [2, 2],
  [3, 0],
  [2, 0],
  [1, 0],
  [0, 0],
].map(([entraram, sairam], i) => ({
  inicio: new Date(Date.UTC(2026, 8, 27 + i, 3)).toISOString(),
  entraram: entraram!,
  sairam: sairam!,
}));

/** Entrada e saída do Diego em "Últimos 7 dias" (critério de aceite do 4C). */
export function entradaSaida(parcial: Partial<EntradaSaida> = {}): EntradaSaida {
  return {
    entraram: 12,
    sairam: 10,
    aprovadas: 7,
    rejeitadas: 3,
    saldo: 2,
    anterior: { entraram: 9, sairam: 9, tempoMedioDecisaoDias: 12 },
    tempoMedioDecisaoDias: 10,
    maisAntigaNaFila: {
      id: 'c0000000-0000-4000-8000-000000000009',
      codigo: 'SOL-000009',
      area: areaPorNome('Recursos Humanos'),
      desde: '2026-09-04T12:00:00.000Z', // 30 dias antes de 04/10
    },
    prioridadeEntraram: { BAIXA: 2, MEDIA: 4, ALTA: 6 },
    pendentesPorPrioridade: { BAIXA: 4, MEDIA: 7, ALTA: 6 },
    serie: SERIE_7D,
    ...parcial,
  };
}

/** Analistas do seed: Carla 4 · 11 · 73%, Rafael 3 · 9 · 56%, Diego 0 · 6 · 50%. */
export const RAFAEL_REF = { id: '6a1f0c2e-0000-4000-8000-000000000004', nome: 'Rafael Costa' };
export const ANALISTAS_SEED: AnalistaGestao[] = [
  analistaGestao(),
  analistaGestao({ analista: RAFAEL_REF, emAnaliseAgora: 3, decididas: 9, aprovadas: 5 }),
  analistaGestao({ analista: pessoa(DIEGO), emAnaliseAgora: 0, decididas: 6, aprovadas: 3 }),
];

/** Áreas do seed em Tudo: quatro com solicitações e Jurídico e Operações zeradas. */
export const AREAS_SEED: AreaGestao[] = [
  areaGestao(areaPorNome('Financeiro'), { ABERTA: 2, EM_ANALISE: 2, APROVADA: 5, REJEITADA: 2 }),
  areaGestao(areaPorNome('Comercial'), { ABERTA: 3, EM_ANALISE: 2, APROVADA: 4, REJEITADA: 1 }),
  areaGestao(areaPorNome('Recursos Humanos'), {
    ABERTA: 3,
    EM_ANALISE: 1,
    APROVADA: 4,
    REJEITADA: 2,
  }),
  areaGestao(areaPorNome('Tecnologia'), { ABERTA: 2, EM_ANALISE: 2, APROVADA: 2, REJEITADA: 3 }),
  areaGestao(AREA_JURIDICO),
  areaGestao(AREA_OPERACOES),
];

/** Segunda integração com falha do mock (Comercial, tempo esgotado). */
export const FALHA_CRM = integracaoComFalha({
  solicitacao: {
    id: 'c0000000-0000-4000-8000-000000000020',
    codigo: 'SOL-000020',
    titulo: 'Acesso ao CRM para o novo representante',
    solicitante: { id: '6a1f0c2e-0000-4000-8000-000000000007', nome: 'Camila Rocha' },
    area: areaPorNome('Comercial'),
  },
  ultimoErro: 'Tempo de resposta esgotado (10s)',
  ultimaTentativaEm: '2026-10-04T01:40:00.000Z', // 03/10 22:40 em São Paulo
});

/**
 * Painel de gestão do Diego em "Últimos 7 dias" (27/09 09:42 a 04/10 09:42 em São Paulo), com
 * as áreas e os analistas do seed e duas integrações com falha.
 */
export function gestao(parcial: Partial<Gestao> = {}): Gestao {
  return {
    periodo: {
      valor: '7d',
      inicio: '2026-09-27T12:42:00.000Z',
      fim: '2026-10-04T12:42:00.000Z',
      granularidade: 'dia',
    },
    entradaSaida: entradaSaida(),
    porArea: AREAS_SEED,
    porAnalista: ANALISTAS_SEED,
    integracoesComFalha: [integracaoComFalha(), FALHA_CRM],
    geradoEm: '2026-10-04T12:41:48.000Z',
    ...parcial,
  };
}

/** O mesmo painel em "Hoje": sem série, sem granularidade e sem período anterior. */
export function gestaoHoje(parcial: Partial<Gestao> = {}): Gestao {
  return gestao({
    periodo: {
      valor: 'hoje',
      inicio: '2026-10-04T03:00:00.000Z',
      fim: '2026-10-04T12:42:00.000Z',
      granularidade: null,
    },
    entradaSaida: entradaSaida({
      entraram: 0,
      sairam: 0,
      aprovadas: 0,
      rejeitadas: 0,
      saldo: 0,
      anterior: null,
      tempoMedioDecisaoDias: null,
      prioridadeEntraram: { BAIXA: 0, MEDIA: 0, ALTA: 0 },
      serie: [],
    }),
    ...parcial,
  });
}

/** Auditoria do histórico (RN-10): tipos do contrato OpenAPI. */
export type MotivoDivergencia = Schemas['MotivoDivergencia'];
export type DivergenciaIntegridade = Schemas['DivergenciaHistorico'];
export type Integridade = Schemas['IntegridadeDto'];

export function divergencia(parcial: Partial<DivergenciaIntegridade> = {}): DivergenciaIntegridade {
  return {
    solicitacao: {
      id: 'c0000000-0000-4000-8000-000000000012',
      codigo: 'SOL-000012',
      excluida: false,
    },
    eventoId: 'e0000000-0000-4000-8000-000000000101',
    tipo: 'APROVADA',
    criadoEm: '2026-10-02T17:30:00.000Z',
    motivo: 'CONTEUDO_ALTERADO',
    ...parcial,
  };
}

/** Resultado da verificação: por padrão, íntegro (412 eventos de 40 solicitações, 09:42 em SP). */
export function integridade(parcial: Partial<Integridade> = {}): Integridade {
  const divergencias = parcial.divergencias ?? [];
  return {
    integro: divergencias.length === 0,
    eventosVerificados: 412,
    solicitacoesVerificadas: 40,
    totalDivergencias: divergencias.length,
    divergencias,
    verificadoEm: '2026-10-04T12:42:00.000Z',
    ...parcial,
  };
}
