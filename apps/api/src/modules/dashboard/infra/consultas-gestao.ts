import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { ContextoBanco } from '../../../database/contexto-banco';
import { BALDES, type Granularidade } from '../domain/granularidade';
import { FUSO_DOS_DASHBOARDS } from '../domain/periodo';

/** Janela de eventos: `inicio` inclusivo (null = sem limite); `fim` inclusivo ou não. */
export interface Janela {
  inicio: Date | null;
  fim: Date;
  fimInclusivo: boolean;
}

export interface LinhaEntradaSaida {
  entraram: number;
  sairam: number;
  aprovadas: number;
  rejeitadas: number;
  tempo_medio_dias: number | null;
  entraram_baixa: number;
  entraram_media: number;
  entraram_alta: number;
}

export interface LinhaFila {
  pendentes_baixa: number;
  pendentes_media: number;
  pendentes_alta: number;
  antiga_id: string | null;
  antiga_codigo: number | null;
  antiga_desde: Date | null;
  antiga_area_id: string | null;
  antiga_area_nome: string | null;
}

export interface LinhaBalde {
  inicio: Date;
  entraram: number;
  sairam: number;
}

export interface LinhaArea {
  id: string;
  nome: string;
  aberta: number;
  em_analise: number;
  aprovada: number;
  rejeitada: number;
}

export interface LinhaAnalista {
  id: string;
  nome: string;
  em_analise_agora: number;
  decididas: number;
  aprovadas: number;
}

export interface LinhaIntegracao {
  solicitacao_id: string;
  codigo: number;
  titulo: string;
  solicitante_id: string;
  solicitante_nome: string;
  area_id: string;
  area_nome: string;
  tipo: string;
  tentativas: number;
  ultimo_erro: string | null;
  ultima_tentativa_em: Date | null;
}

/** Corte do texto de erro do sistema externo antes de sair da API (revisão de 04/10/2026). */
export const LIMITE_ULTIMO_ERRO = 300;
export const LIMITE_INTEGRACOES_COM_FALHA = 20;

/** Filtro de `h.criado_em` pela janela. */
function naJanela(janela: Janela): Prisma.Sql {
  const inicio = janela.inicio
    ? Prisma.sql`h.criado_em >= ${janela.inicio}::timestamptz`
    : Prisma.sql`TRUE`;
  const fim = janela.fimInclusivo
    ? Prisma.sql`h.criado_em <= ${janela.fim}::timestamptz`
    : Prisma.sql`h.criado_em < ${janela.fim}::timestamptz`;
  return Prisma.sql`${inicio} AND ${fim}`;
}

/**
 * Consultas agregadas do painel de gestão (PR 4C), em SQL parametrizado. Rodam na transação com o
 * contexto do usuário (RLS no app_runtime); o acesso já foi restrito ao Admin pelo guard de cargo.
 * Eventos e solicitações excluídas ficam fora de todas as contagens (RN-12).
 */
@Injectable()
export class ConsultasGestao {
  constructor(private readonly banco: ContextoBanco) {}

  /** Entradas (CRIADA, REABERTA) e saídas (APROVADA, REJEITADA) do histórico na janela. */
  async entradaSaida(janela: Janela): Promise<LinhaEntradaSaida> {
    const [linha] = await this.banco.cliente.$queryRaw<LinhaEntradaSaida[]>`
      SELECT (count(*) FILTER (WHERE h.tipo IN ('CRIADA', 'REABERTA')))::int AS entraram,
             (count(*) FILTER (WHERE h.tipo IN ('APROVADA', 'REJEITADA')))::int AS sairam,
             (count(*) FILTER (WHERE h.tipo = 'APROVADA'))::int AS aprovadas,
             (count(*) FILTER (WHERE h.tipo = 'REJEITADA'))::int AS rejeitadas,
             (avg(extract(epoch FROM h.criado_em - s.data_solicitacao) / 86400)
                FILTER (WHERE h.tipo IN ('APROVADA', 'REJEITADA')))::float8 AS tempo_medio_dias,
             (count(*) FILTER (WHERE h.tipo IN ('CRIADA', 'REABERTA')
                                 AND s.prioridade = 'BAIXA'))::int AS entraram_baixa,
             (count(*) FILTER (WHERE h.tipo IN ('CRIADA', 'REABERTA')
                                 AND s.prioridade = 'MEDIA'))::int AS entraram_media,
             (count(*) FILTER (WHERE h.tipo IN ('CRIADA', 'REABERTA')
                                 AND s.prioridade = 'ALTA'))::int AS entraram_alta
        FROM solicitacao_historico h
        JOIN solicitacoes s ON s.id = h.solicitacao_id AND s.excluido_em IS NULL
       WHERE h.tipo IN ('CRIADA', 'REABERTA', 'APROVADA', 'REJEITADA')
         AND ${naJanela(janela)}`;
    return linha!;
  }

  /** Pendentes (ABERTA e EM_ANALISE) por prioridade e a ABERTA mais antiga: estado atual. */
  async fila(): Promise<LinhaFila> {
    const [linha] = await this.banco.cliente.$queryRaw<LinhaFila[]>`
      SELECT p.pendentes_baixa, p.pendentes_media, p.pendentes_alta,
             a.id AS antiga_id, a.codigo AS antiga_codigo, a.data_solicitacao AS antiga_desde,
             a.area_id AS antiga_area_id, a.area_nome AS antiga_area_nome
        FROM (SELECT (count(*) FILTER (WHERE prioridade = 'BAIXA'))::int AS pendentes_baixa,
                     (count(*) FILTER (WHERE prioridade = 'MEDIA'))::int AS pendentes_media,
                     (count(*) FILTER (WHERE prioridade = 'ALTA'))::int AS pendentes_alta
                FROM solicitacoes
               WHERE excluido_em IS NULL AND status IN ('ABERTA', 'EM_ANALISE')) p
        LEFT JOIN LATERAL (
              SELECT s.id, s.codigo, s.data_solicitacao, ar.id AS area_id, ar.nome AS area_nome
                FROM solicitacoes s
                JOIN areas ar ON ar.id = s.area_id
               WHERE s.excluido_em IS NULL AND s.status = 'ABERTA'
               ORDER BY s.data_solicitacao, s.codigo
               LIMIT 1) a ON TRUE`;
    return linha!;
  }

  /** Instante do evento contado mais antigo: começo do intervalo da série em `tudo`. */
  async primeiroEvento(): Promise<Date | null> {
    const [linha] = await this.banco.cliente.$queryRaw<{ primeiro: Date | null }[]>`
      SELECT min(h.criado_em) AS primeiro
        FROM solicitacao_historico h
        JOIN solicitacoes s ON s.id = h.solicitacao_id AND s.excluido_em IS NULL
       WHERE h.tipo IN ('CRIADA', 'REABERTA', 'APROVADA', 'REJEITADA')`;
    return linha?.primeiro ?? null;
  }

  /**
   * Série da Entrada e saída: um balde por dia, semana (começa na segunda, como o `date_trunc`)
   * ou mês no fuso dos dashboards, de `de` até o fim da janela. Baldes sem evento voltam com zero.
   */
  async serie(janela: Janela, de: Date, granularidade: Granularidade): Promise<LinhaBalde[]> {
    const { unidade, passo } = BALDES[granularidade];
    const fuso = FUSO_DOS_DASHBOARDS;
    return this.banco.cliente.$queryRaw<LinhaBalde[]>`
      WITH baldes AS (
        SELECT generate_series(
                 date_trunc(${unidade}::text, ${de}::timestamptz AT TIME ZONE ${fuso}::text),
                 date_trunc(${unidade}::text, ${janela.fim}::timestamptz AT TIME ZONE ${fuso}::text),
                 ${passo}::interval) AS local
      ), eventos AS (
        SELECT date_trunc(${unidade}::text, h.criado_em AT TIME ZONE ${fuso}::text) AS local,
               (count(*) FILTER (WHERE h.tipo IN ('CRIADA', 'REABERTA')))::int AS entraram,
               (count(*) FILTER (WHERE h.tipo IN ('APROVADA', 'REJEITADA')))::int AS sairam
          FROM solicitacao_historico h
          JOIN solicitacoes s ON s.id = h.solicitacao_id AND s.excluido_em IS NULL
         WHERE h.tipo IN ('CRIADA', 'REABERTA', 'APROVADA', 'REJEITADA')
           AND ${naJanela(janela)}
         GROUP BY 1
      )
      SELECT b.local AT TIME ZONE ${fuso}::text AS inicio,
             coalesce(e.entraram, 0)::int AS entraram, coalesce(e.sairam, 0)::int AS sairam
        FROM baldes b
        LEFT JOIN eventos e ON e.local = b.local
       ORDER BY b.local`;
  }

  /** Todas as áreas ativas com as solicitações de dataSolicitacao no período, por status. */
  async porArea(inicio: Date | null, fim: Date): Promise<LinhaArea[]> {
    return this.banco.cliente.$queryRaw<LinhaArea[]>`
      SELECT a.id, a.nome,
             (count(s.id) FILTER (WHERE s.status = 'ABERTA'))::int AS aberta,
             (count(s.id) FILTER (WHERE s.status = 'EM_ANALISE'))::int AS em_analise,
             (count(s.id) FILTER (WHERE s.status = 'APROVADA'))::int AS aprovada,
             (count(s.id) FILTER (WHERE s.status = 'REJEITADA'))::int AS rejeitada
        FROM areas a
        LEFT JOIN solicitacoes s
               ON s.area_id = a.id
              AND s.excluido_em IS NULL
              AND (${inicio}::timestamptz IS NULL OR s.data_solicitacao >= ${inicio}::timestamptz)
              AND s.data_solicitacao <= ${fim}::timestamptz
       WHERE a.ativo
       GROUP BY a.id, a.nome
       ORDER BY a.nome`;
  }

  /**
   * Analistas e admins ativos com análise agora ou decisão na janela. As decisões são os eventos
   * APROVADA e REJEITADA do histórico pelo autor, a mesma base de "saíram".
   */
  async porAnalista(janela: Janela): Promise<LinhaAnalista[]> {
    return this.banco.cliente.$queryRaw<LinhaAnalista[]>`
      WITH em_analise AS (
        SELECT analista_id AS id, count(*)::int AS total
          FROM solicitacoes
         WHERE excluido_em IS NULL AND status = 'EM_ANALISE' AND analista_id IS NOT NULL
         GROUP BY analista_id
      ), decisoes AS (
        SELECT h.autor_id AS id, count(*)::int AS decididas,
               (count(*) FILTER (WHERE h.tipo = 'APROVADA'))::int AS aprovadas
          FROM solicitacao_historico h
          JOIN solicitacoes s ON s.id = h.solicitacao_id AND s.excluido_em IS NULL
         WHERE h.tipo IN ('APROVADA', 'REJEITADA')
           AND ${naJanela(janela)}
         GROUP BY h.autor_id
      )
      SELECT u.id, u.nome,
             coalesce(ea.total, 0)::int AS em_analise_agora,
             coalesce(d.decididas, 0)::int AS decididas,
             coalesce(d.aprovadas, 0)::int AS aprovadas
        FROM usuarios u
        LEFT JOIN em_analise ea ON ea.id = u.id
        LEFT JOIN decisoes d ON d.id = u.id
       WHERE u.ativo AND u.cargo IN ('ANALISTA', 'ADMIN')
         AND (ea.total IS NOT NULL OR d.decididas IS NOT NULL)
       ORDER BY em_analise_agora DESC, u.nome, u.id`;
  }

  /**
   * Solicitações cujo evento em foco (o mais antigo ainda não ENVIADO, ADR-010) está FALHOU, da
   * última tentativa mais recente para a mais antiga. Só aqui a API seleciona `ultimo_erro`, já
   * cortado em LIMITE_ULTIMO_ERRO caracteres.
   */
  async integracoesComFalha(): Promise<LinhaIntegracao[]> {
    return this.banco.cliente.$queryRaw<LinhaIntegracao[]>`
      WITH foco AS (
        SELECT DISTINCT ON (e.agregado_id)
               e.agregado_id, e.tipo, e.status, e.tentativas, e.ultimo_erro,
               e.ultima_tentativa_em, e.criado_em
          FROM outbox_eventos e
         WHERE e.status <> 'ENVIADO'
         ORDER BY e.agregado_id, e.criado_em, e.id
      )
      SELECT s.id AS solicitacao_id, s.codigo, s.titulo,
             u.id AS solicitante_id, u.nome AS solicitante_nome,
             a.id AS area_id, a.nome AS area_nome,
             f.tipo, f.tentativas,
             left(f.ultimo_erro, ${LIMITE_ULTIMO_ERRO}::int) AS ultimo_erro,
             f.ultima_tentativa_em
        FROM foco f
        JOIN solicitacoes s ON s.id = f.agregado_id AND s.excluido_em IS NULL
        JOIN usuarios u ON u.id = s.solicitante_id
        JOIN areas a ON a.id = s.area_id
       WHERE f.status = 'FALHOU'
       ORDER BY f.ultima_tentativa_em DESC NULLS LAST, f.criado_em DESC, s.codigo DESC
       LIMIT ${LIMITE_INTEGRACOES_COM_FALHA}::int`;
  }
}
