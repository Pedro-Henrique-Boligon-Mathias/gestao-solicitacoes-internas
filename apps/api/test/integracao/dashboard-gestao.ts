import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { DIA, api, type Prioridade, type Sessao, type Status } from './api-solicitacoes';

/*
 * Utilitários dos testes de GET /dashboard/gestao (PR 4C). Os dados são gravados direto no banco
 * como app_owner (fora da RLS), com datas controladas, para as contagens serem exatas.
 */

export type Periodo = 'hoje' | '7d' | '30d' | 'tudo';
export type Granularidade = 'dia' | 'semana' | 'mes';
export const HORA = 60 * 60 * 1000;

interface Ref {
  id: string;
  nome: string;
}

export interface Gestao {
  periodo: {
    valor: Periodo;
    inicio: string | null;
    fim: string;
    granularidade: Granularidade | null;
  };
  entradaSaida: {
    entraram: number;
    sairam: number;
    aprovadas: number;
    rejeitadas: number;
    saldo: number;
    anterior: { entraram: number; sairam: number; tempoMedioDecisaoDias: number | null } | null;
    tempoMedioDecisaoDias: number | null;
    maisAntigaNaFila: { id: string; codigo: string; area: Ref; desde: string } | null;
    prioridadeEntraram: Record<Prioridade, number>;
    pendentesPorPrioridade: Record<Prioridade, number>;
    serie: { inicio: string; entraram: number; sairam: number }[];
  };
  porArea: { area: Ref; total: number; porStatus: Record<Status, number> }[];
  porAnalista: {
    analista: Ref;
    emAnaliseAgora: number;
    decididas: number;
    aprovadas: number;
    taxaAprovacao: number | null;
  }[];
  integracoesComFalha: {
    solicitacao: { id: string; codigo: string; titulo: string; solicitante: Ref; area: Ref };
    tipo: string;
    tentativas: number;
    maxTentativas: number;
    ultimoErro: string | null;
    ultimaTentativaEm: string | null;
  }[];
  geradoEm: string;
}

/** GET /dashboard/gestao com o período informado (sem parâmetro quando `periodo` não vem). */
export function pedirGestao(app: INestApplication<App>, sessao: Sessao, periodo?: string) {
  const query = periodo === undefined ? '' : `?periodo=${encodeURIComponent(periodo)}`;
  return api(app, sessao).get(`/dashboard/gestao${query}`);
}

export async function gestao(
  app: INestApplication<App>,
  sessao: Sessao,
  periodo?: Periodo,
): Promise<Gestao> {
  const resposta = await pedirGestao(app, sessao, periodo);
  expect(resposta.status).toBe(200);
  return resposta.body as Gestao;
}

/*
 * Datas no fuso America/Sao_Paulo. Desde 2019 o fuso não tem horário de verão: é sempre UTC−3,
 * então meia-noite em São Paulo é 03:00Z.
 */
const DESLOCAMENTO_SP = 3 * HORA;

/** Meia-noite (São Paulo) do dia em que `data` cai. */
export function meiaNoiteSP(data: Date): Date {
  const local = new Date(data.getTime() - DESLOCAMENTO_SP);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + DESLOCAMENTO_SP);
}

/** Dia da semana em São Paulo (0 = domingo, 1 = segunda). */
export function diaDaSemanaSP(data: Date): number {
  return new Date(data.getTime() - DESLOCAMENTO_SP).getUTCDay();
}

/** Segunda-feira 00:00 (São Paulo) da semana em que `data` cai. */
export function segundaSP(data: Date): Date {
  const meiaNoite = meiaNoiteSP(data);
  return new Date(meiaNoite.getTime() - ((diaDaSemanaSP(data) + 6) % 7) * DIA);
}

/** Dia 1 às 00:00 (São Paulo) do mês em que `data` cai. */
export function inicioDoMesSP(data: Date): Date {
  const local = new Date(data.getTime() - DESLOCAMENTO_SP);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + DESLOCAMENTO_SP);
}

/** Próximo mês (São Paulo) a partir do início de um mês. */
export function proximoMesSP(inicio: Date): Date {
  const local = new Date(inicio.getTime() - DESLOCAMENTO_SP);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) + DESLOCAMENTO_SP);
}

/** Um instante de hoje (São Paulo), entre a meia-noite e agora. */
export function momentoDeHoje(agora: Date = new Date()): Date {
  const meiaNoite = meiaNoiteSP(agora).getTime();
  return new Date(meiaNoite + Math.floor((agora.getTime() - meiaNoite) / 2));
}

export function diasAtras(dias: number, agora: Date = new Date()): Date {
  return new Date(agora.getTime() - dias * DIA);
}

export function formatarCodigo(codigo: number): string {
  return `SOL-${String(codigo).padStart(6, '0')}`;
}

/** Apaga solicitações, histórico e outbox (app_owner), para cada teste partir do zero. */
export async function limparSolicitacoes(owner: Client): Promise<void> {
  await owner.query('DELETE FROM outbox_eventos');
  await owner.query('DELETE FROM solicitacao_historico');
  await owner.query('DELETE FROM solicitacoes');
}

/** Ids das áreas do seed, por nome. */
export async function areasDoSeed(owner: Client): Promise<Record<string, string>> {
  const linhas = await owner.query<{ id: string; nome: string }>('SELECT id, nome FROM areas');
  return Object.fromEntries(linhas.rows.map((linha) => [linha.nome, linha.id]));
}

/** Usuário sem senha utilizável (não faz login), só para aparecer nas agregações. */
export async function inserirUsuario(
  owner: Client,
  campos: {
    nome: string;
    cargo: 'SOLICITANTE' | 'ANALISTA' | 'ADMIN';
    areaId: string;
    ativo?: boolean;
  },
): Promise<string> {
  const email = `${campos.nome.toLowerCase().replaceAll(' ', '.')}.${randomUUID().slice(0, 8)}@teste.local`;
  const resultado = await owner.query<{ id: string }>(
    `INSERT INTO usuarios (nome, email, senha_hash, cargo, area_id, ativo)
     VALUES ($1, $2, 'hash-de-teste', $3, $4, $5) RETURNING id`,
    [campos.nome, email, campos.cargo, campos.areaId, campos.ativo ?? true],
  );
  return resultado.rows[0]!.id;
}

export type TipoHistorico = 'CRIADA' | 'ANALISE_INICIADA' | 'APROVADA' | 'REJEITADA' | 'REABERTA';

export interface EventoPlano {
  tipo: TipoHistorico;
  em: Date;
  /** Padrão: solicitante (CRIADA), analista (início), decisor ou analista (decisão). REABERTA exige. */
  autorId?: string;
}

export interface PlanoSolicitacao {
  solicitanteId: string;
  areaId: string;
  prioridade?: Prioridade;
  /** Status atual. Decidida exige `decisorId`; EM_ANALISE e decidida exigem `analistaId`. */
  status: Status;
  analistaId?: string | null;
  decisorId?: string;
  /** dataSolicitacao: padrão é a data do evento CRIADA. */
  data?: Date;
  excluidaEm?: Date;
  titulo?: string;
  eventos: EventoPlano[];
}

const COMENTARIO_EVENTO = 'Comentário registrado pelo teste do painel de gestão.';

/** Grava a solicitação e o histórico do plano. Devolve id e código numérico. */
export async function inserirComHistorico(
  owner: Client,
  plano: PlanoSolicitacao,
): Promise<{ id: string; codigo: number }> {
  const criada = plano.eventos.find((evento) => evento.tipo === 'CRIADA');
  const data = plano.data ?? criada?.em ?? new Date();
  const decidida = plano.status === 'APROVADA' || plano.status === 'REJEITADA';
  const ultimaDecisao = plano.eventos
    .filter((evento) => evento.tipo === 'APROVADA' || evento.tipo === 'REJEITADA')
    .at(-1);
  const resultado = await owner.query<{ id: string; codigo: number }>(
    `INSERT INTO solicitacoes (titulo, descricao, prioridade, status, solicitante_id, area_id,
       analista_id, data_solicitacao, decisao_comentario, decidido_em, decidido_por_id, excluido_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, codigo`,
    [
      plano.titulo ?? 'Solicitação do painel de gestão',
      'Descrição criada pelo teste do painel de gestão.',
      plano.prioridade ?? 'MEDIA',
      plano.status,
      plano.solicitanteId,
      plano.areaId,
      plano.status === 'ABERTA' ? null : (plano.analistaId ?? null),
      data,
      decidida ? COMENTARIO_EVENTO : null,
      decidida ? (ultimaDecisao?.em ?? data) : null,
      decidida ? (plano.decisorId ?? null) : null,
      plano.excluidaEm ?? null,
    ],
  );
  const { id, codigo } = resultado.rows[0]!;
  for (const evento of plano.eventos) {
    const padrao = {
      CRIADA: plano.solicitanteId,
      ANALISE_INICIADA: plano.analistaId,
      APROVADA: plano.decisorId ?? plano.analistaId,
      REJEITADA: plano.decisorId ?? plano.analistaId,
      REABERTA: undefined,
    }[evento.tipo];
    const autorId = evento.autorId ?? padrao;
    if (!autorId) throw new Error(`Evento ${evento.tipo} sem autor no plano do teste.`);
    const comComentario = ['APROVADA', 'REJEITADA', 'REABERTA'].includes(evento.tipo);
    await owner.query(
      `INSERT INTO solicitacao_historico (solicitacao_id, tipo, comentario, autor_id, criado_em)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, evento.tipo, comComentario ? COMENTARIO_EVENTO : null, autorId, evento.em],
    );
  }
  return { id, codigo };
}
