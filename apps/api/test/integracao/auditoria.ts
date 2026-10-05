import type { INestApplication } from '@nestjs/common';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { api, type Sessao } from './api-solicitacoes';

/** Semente da corrente: hash_anterior do primeiro evento de cada solicitação. */
export const SEMENTE = '0'.repeat(64);
export const HASH_HEX = /^[0-9a-f]{64}$/;

export type Motivo = 'CONTEUDO_ALTERADO' | 'CORRENTE_QUEBRADA';

export interface Divergencia {
  solicitacao: { id: string; codigo: string };
  eventoId: string;
  tipo: string;
  criadoEm: string;
  motivo: Motivo;
}

export interface Integridade {
  integro: boolean;
  eventosVerificados: number;
  solicitacoesVerificadas: number;
  totalDivergencias: number;
  divergencias: Divergencia[];
  verificadoEm: string;
}

export function pedirIntegridade(app: INestApplication<App>, sessao?: Sessao) {
  return api(app, sessao).get('/auditoria/integridade');
}

export async function verificar(app: INestApplication<App>, admin: Sessao): Promise<Integridade> {
  const resposta = await pedirIntegridade(app, admin).expect(200);
  return resposta.body as Integridade;
}

/**
 * Conteúdo canônico do evento (doc 16): campos na ordem fixa, separados por '|', NULL como texto
 * vazio, `dados` (jsonb) como texto e `criado_em` em UTC com microssegundos. Fica aqui, no teste,
 * para fixar o formato que o trigger precisa reproduzir.
 */
export const CONTEUDO_CANONICO = `
  h.solicitacao_id::text
  || '|' || h.tipo::text
  || '|' || coalesce(h.status_anterior::text, '')
  || '|' || coalesce(h.status_novo::text, '')
  || '|' || h.autor_id::text
  || '|' || coalesce(h.comentario, '')
  || '|' || coalesce(h.dados::text, '')
  || '|' || to_char(h.criado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** hash = sha256(hash_anterior || '|' || conteúdo canônico), em hexadecimal minúsculo. */
export const HASH_RECALCULADO = `
  encode(sha256(convert_to(h.hash_anterior || '|' || ${CONTEUDO_CANONICO}, 'UTF8')), 'hex')`;

export interface EventoDaCorrente {
  id: string;
  tipo: string;
  criado_em: Date;
  hash_anterior: string;
  hash: string;
  recalculado: string;
}

/** Eventos de uma solicitação na ordem da corrente, com o hash recalculado em SQL (app_owner). */
export async function corrente(owner: Client, solicitacaoId: string): Promise<EventoDaCorrente[]> {
  const resultado = await owner.query<EventoDaCorrente>(
    `SELECT h.id, h.tipo::text AS tipo, h.criado_em, h.hash_anterior, h.hash,
            ${HASH_RECALCULADO} AS recalculado
       FROM solicitacao_historico h
      WHERE h.solicitacao_id = $1
      ORDER BY h.criado_em, h.id`,
    [solicitacaoId],
  );
  return resultado.rows;
}

/**
 * Adulteração feita por quem tem acesso alto ao banco: roda o comando como app_owner com os
 * triggers de usuário da tabela desligados só nesta transação (se a implementação acrescentar
 * algum bloqueio de UPDATE/DELETE, ele não mascara o que a verificação precisa detectar).
 */
export async function adulterar(
  owner: Client,
  sql: string,
  parametros: unknown[],
): Promise<number> {
  await owner.query('BEGIN');
  try {
    await owner.query('ALTER TABLE solicitacao_historico DISABLE TRIGGER USER');
    const resultado = await owner.query(sql, parametros);
    await owner.query('ALTER TABLE solicitacao_historico ENABLE TRIGGER USER');
    await owner.query('COMMIT');
    return resultado.rowCount ?? 0;
  } catch (erro) {
    await owner.query('ROLLBACK');
    throw erro;
  }
}

/** Totais do histórico inteiro (inclui solicitações excluídas), lidos como app_owner. */
export async function totaisDoHistorico(
  owner: Client,
): Promise<{ eventos: number; solicitacoes: number }> {
  const resultado = await owner.query<{ eventos: number; solicitacoes: number }>(
    `SELECT count(*)::int AS eventos, count(DISTINCT solicitacao_id)::int AS solicitacoes
       FROM solicitacao_historico`,
  );
  return resultado.rows[0]!;
}

/** Divergências de uma solicitação na resposta da verificação. */
export function divergenciasDe(integridade: Integridade, solicitacaoId: string): Divergencia[] {
  return integridade.divergencias.filter((item) => item.solicitacao.id === solicitacaoId);
}
