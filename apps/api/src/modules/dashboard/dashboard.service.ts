import { Injectable } from '@nestjs/common';
import type { Cargo } from '../../generated/prisma/client';
import { ContextoBanco } from '../../database/contexto-banco';
import { Transactional } from '../../database/transacao';
import type { ResumoDto } from './dashboard.dto';
import { limitesDoPeriodo, type Periodo } from './domain/periodo';

interface Grupo {
  status: keyof ResumoDto['porStatus'];
  prioridade: keyof ResumoDto['porPrioridade'];
  /** Com dataSolicitacao no período. */
  no_periodo: number;
  /** Todas, para o estado atual (filaAlta e aberturaMaisAntiga ignoram o período). */
  total: number;
  mais_antiga: Date;
}

/**
 * Indicadores do dashboard (RF-04). O período filtra total, porStatus e porPrioridade por
 * `data_solicitacao`; filaAlta e aberturaMaisAntiga mostram sempre o estado atual.
 *
 * Uma consulta agrupada, sem filtro por usuário: a RLS recorta
 * as linhas, e o mesmo SQL devolve a visão geral para analista e administrador e só as próprias
 * para o solicitante.
 *
 * Atenção: o recorte do SOLICITANTE depende só da RLS (decisão das notas 05 e 06), ao contrário da
 * lista e do detalhe, que também filtram no repositório. Se a RLS de `solicitacoes` for removida ou
 * afrouxada, é preciso filtrar aqui por `solicitante_id` quando o cargo for SOLICITANTE; sem isso,
 * o solicitante passa a ver os números de todo mundo.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly banco: ContextoBanco) {}

  @Transactional()
  async resumo(cargo: Cargo, periodo: Periodo = 'tudo'): Promise<ResumoDto> {
    const { valor, inicio, fim } = limitesDoPeriodo(periodo, new Date());
    const grupos = await this.banco.cliente.$queryRaw<Grupo[]>`
      SELECT status::text AS status, prioridade::text AS prioridade,
             (count(*) FILTER (
                WHERE (${inicio}::timestamptz IS NULL OR data_solicitacao >= ${inicio}::timestamptz)
                  AND data_solicitacao <= ${fim}::timestamptz))::int AS no_periodo,
             count(*)::int AS total, min(data_solicitacao) AS mais_antiga
        FROM solicitacoes
       WHERE excluido_em IS NULL
       GROUP BY status, prioridade`;

    const resumo: ResumoDto = {
      escopo: cargo === 'SOLICITANTE' ? 'PROPRIAS' : 'GERAL',
      total: 0,
      porStatus: { ABERTA: 0, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0 },
      porPrioridade: { BAIXA: 0, MEDIA: 0, ALTA: 0 },
      periodo: { valor, inicio: inicio?.toISOString() ?? null, fim: fim.toISOString() },
      filaAlta: 0,
      aberturaMaisAntiga: null,
      geradoEm: fim.toISOString(),
    };
    let maisAntiga: Date | null = null;
    for (const grupo of grupos) {
      resumo.total += grupo.no_periodo;
      resumo.porStatus[grupo.status] += grupo.no_periodo;
      resumo.porPrioridade[grupo.prioridade] += grupo.no_periodo;
      if (grupo.status !== 'ABERTA') continue;
      if (grupo.prioridade === 'ALTA') resumo.filaAlta += grupo.total;
      if (!maisAntiga || grupo.mais_antiga < maisAntiga) maisAntiga = grupo.mais_antiga;
    }
    resumo.aberturaMaisAntiga = maisAntiga?.toISOString() ?? null;
    return resumo;
  }
}
