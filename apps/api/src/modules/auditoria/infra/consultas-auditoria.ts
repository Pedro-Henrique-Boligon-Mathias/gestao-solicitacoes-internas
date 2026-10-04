import { Injectable } from '@nestjs/common';
import { ContextoBanco } from '../../../database/contexto-banco';
import type { TipoEvento } from '../../../generated/prisma/client';
import { LIMITE_DIVERGENCIAS, type MotivoDivergencia } from '../domain/integridade';

export interface LinhaDivergencia {
  solicitacao_id: string;
  codigo: number;
  evento_id: string;
  tipo: TipoEvento;
  /** ISO 8601 em UTC, truncado em milissegundos. */
  criado_em: string;
  motivo: MotivoDivergencia;
}

export interface LinhaIntegridade {
  eventos: number;
  solicitacoes: number;
  total_divergencias: number;
  divergencias: LinhaDivergencia[];
}

@Injectable()
export class ConsultasAuditoria {
  constructor(private readonly banco: ContextoBanco) {}

  /**
   * Recalcula todas as correntes numa consulta. O hash de cada evento é recalculado com o
   * hash_anterior gravado nele (CONTEUDO_ALTERADO); o elo é conferido com lag() do hash do evento
   * anterior da mesma solicitação, na ordem (criado_em, id), ou a semente no primeiro
   * (CORRENTE_QUEBRADA, só quando o conteúdo confere). Roda com o contexto do usuário: a RLS deixa
   * o Admin ver todo o histórico, inclusive o das solicitações excluídas.
   */
  async verificarCorrentes(): Promise<LinhaIntegridade> {
    const [linha] = await this.banco.cliente.$queryRaw<LinhaIntegridade[]>`
      WITH eventos AS (
        SELECT h.id, h.solicitacao_id, h.tipo, h.criado_em, h.hash, h.hash_anterior,
               app.hash_do_evento(h.hash_anterior, app.conteudo_canonico_historico(h)) AS recalculado,
               lag(h.hash) OVER (PARTITION BY h.solicitacao_id ORDER BY h.criado_em, h.id)
                 AS hash_do_anterior
          FROM solicitacao_historico h
      ),
      classificados AS (
        SELECT e.*,
               CASE
                 WHEN e.recalculado <> e.hash THEN 'CONTEUDO_ALTERADO'
                 WHEN e.hash_anterior <> coalesce(e.hash_do_anterior, repeat('0', 64))
                   THEN 'CORRENTE_QUEBRADA'
               END AS motivo
          FROM eventos e
      ),
      primeiras AS (
        SELECT c.solicitacao_id, s.codigo, c.id AS evento_id, c.tipo, c.motivo,
               c.criado_em AS instante
          FROM classificados c
          JOIN solicitacoes s ON s.id = c.solicitacao_id
         WHERE c.motivo IS NOT NULL
         ORDER BY c.criado_em, c.id
         LIMIT ${LIMITE_DIVERGENCIAS}::int
      )
      SELECT (SELECT count(*)::int FROM classificados) AS eventos,
             (SELECT count(DISTINCT solicitacao_id)::int FROM classificados) AS solicitacoes,
             (SELECT count(*)::int FROM classificados WHERE motivo IS NOT NULL) AS total_divergencias,
             coalesce(
               (SELECT json_agg(json_build_object(
                   'solicitacao_id', p.solicitacao_id, 'codigo', p.codigo,
                   'evento_id', p.evento_id, 'tipo', p.tipo, 'motivo', p.motivo,
                   'criado_em',
                   to_char(p.instante AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                 ) ORDER BY p.instante, p.evento_id)
                 FROM primeiras p),
               '[]'::json
             ) AS divergencias`;
    return linha!;
  }
}
