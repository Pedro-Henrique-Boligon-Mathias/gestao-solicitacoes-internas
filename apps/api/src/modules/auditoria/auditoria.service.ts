import { Injectable } from '@nestjs/common';
import { Transactional } from '../../database/transacao';
import { formatarCodigo } from '../solicitacoes/domain/codigo';
import type { IntegridadeDto } from './auditoria.dto';
import { ConsultasAuditoria } from './infra/consultas-auditoria';

/**
 * Auditoria do histórico com hash encadeado (RN-10, doc 16). A verificação só lê: recalcula as
 * correntes de todas as solicitações numa consulta, na transação com o contexto do usuário.
 */
@Injectable()
export class AuditoriaService {
  constructor(private readonly consultas: ConsultasAuditoria) {}

  @Transactional()
  async verificarIntegridade(): Promise<IntegridadeDto> {
    const linha = await this.consultas.verificarCorrentes();
    return {
      integro: linha.total_divergencias === 0,
      eventosVerificados: linha.eventos,
      solicitacoesVerificadas: linha.solicitacoes,
      totalDivergencias: linha.total_divergencias,
      divergencias: linha.divergencias.map((item) => ({
        solicitacao: { id: item.solicitacao_id, codigo: formatarCodigo(item.codigo) },
        eventoId: item.evento_id,
        tipo: item.tipo,
        criadoEm: item.criado_em,
        motivo: item.motivo,
      })),
      verificadoEm: new Date().toISOString(),
    };
  }
}
