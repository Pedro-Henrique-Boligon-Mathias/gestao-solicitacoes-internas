import type { EventoDetalhado, ItemSolicitacao } from '../application/repositorio-solicitacoes';
import type { Pagina, SolicitacaoComAcoes } from '../application/solicitacoes.service';
import { formatarCodigo } from '../domain/codigo';
import type {
  EventoHistoricoDto,
  ItemListaDto,
  PaginaSolicitacoesDto,
  SolicitacaoDto,
} from './solicitacoes.dto';

export function paraItemLista(item: ItemSolicitacao): ItemListaDto {
  return {
    id: item.id,
    codigo: formatarCodigo(item.codigo),
    titulo: item.titulo,
    prioridade: item.prioridade,
    status: item.status,
    solicitante: item.solicitante,
    area: item.area,
    analista: item.analista,
    dataSolicitacao: item.dataSolicitacao.toISOString(),
    atualizadoEm: item.atualizadoEm.toISOString(),
  };
}

export function paraPagina(pagina: Pagina): PaginaSolicitacoesDto {
  return {
    data: pagina.itens.map(paraItemLista),
    meta: {
      page: pagina.page,
      pageSize: pagina.pageSize,
      total: pagina.total,
      totalPages: pagina.totalPages,
    },
  };
}

export function paraSolicitacao(solicitacao: SolicitacaoComAcoes): SolicitacaoDto {
  const { status, decisaoComentario, decididoEm, decididoPor } = solicitacao;
  const decidida = status === 'APROVADA' || status === 'REJEITADA';
  return {
    ...paraItemLista(solicitacao),
    descricao: solicitacao.descricao,
    decisao:
      decidida && decisaoComentario !== null && decididoEm !== null && decididoPor !== null
        ? {
            resultado: status,
            comentario: decisaoComentario,
            decididoEm: decididoEm.toISOString(),
            decididoPor,
          }
        : null,
    versao: solicitacao.versao,
    acoesPermitidas: solicitacao.acoesPermitidas,
  };
}

export function paraEvento(evento: EventoDetalhado): EventoHistoricoDto {
  return {
    id: evento.id,
    tipo: evento.tipo,
    statusAnterior: evento.statusAnterior,
    statusNovo: evento.statusNovo,
    comentario: evento.comentario,
    autor: evento.autor,
    dados: evento.dados,
    criadoEm: evento.criadoEm.toISOString(),
  };
}
