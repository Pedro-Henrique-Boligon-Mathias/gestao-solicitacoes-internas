import { Injectable } from '@nestjs/common';
import { ContextoBanco } from '../../../database/contexto-banco';
import { Prisma } from '../../../generated/prisma/client';
import type { TipoEventoIntegracao } from '../../integracoes/domain/tipos';
import type { Prioridade, Resultado, Status } from '../domain/tipos';
import {
  RepositorioSolicitacoes,
  type CamposEditaveis,
  type EventoDetalhado,
  type EventoIntegracao,
  type NovoEventoIntegracao,
  type FiltrosLista,
  type ColunasDecisao,
  type ItemListaSolicitacao,
  type ItemSolicitacao,
  type NovoEvento,
  type PaginaSolicitacoes,
  type Pessoa,
  type SolicitacaoDetalhada,
  type Visao,
} from '../application/repositorio-solicitacoes';

const PESSOA = { select: { id: true, nome: true } } as const;

interface LinhaLista {
  id: string;
  codigo: number;
  titulo: string;
  prioridade: Prioridade;
  status: Status;
  data_solicitacao: Date;
  atualizado_em: Date;
  solicitante_id: string;
  solicitante_nome: string;
  area_id: string;
  area_nome: string;
  analista_id: string | null;
  analista_nome: string | null;
}

interface LinhaDecisao {
  decisao_comentario: string | null;
  decidido_em: Date | null;
  decidido_por_id: string | null;
  decidido_por_nome: string | null;
}

interface LinhaItemLista extends LinhaLista, LinhaDecisao {
  analise_iniciada_em: Date | null;
}

interface LinhaDetalhe extends LinhaLista, LinhaDecisao {
  descricao: string;
  versao: number;
}

// Uma consulta só, com os nomes das pessoas e da área por JOIN (usuarios e areas ficam fora da RLS)
const COLUNAS_LISTA = Prisma.sql`
  s.id, s.codigo, s.titulo, s.prioridade::text AS prioridade, s.status::text AS status,
  s.data_solicitacao, s.atualizado_em,
  us.id AS solicitante_id, us.nome AS solicitante_nome,
  a.id AS area_id, a.nome AS area_nome,
  ua.id AS analista_id, ua.nome AS analista_nome`;

const ORIGEM = Prisma.sql`
  solicitacoes s
  JOIN usuarios us ON us.id = s.solicitante_id
  JOIN areas a ON a.id = s.area_id
  LEFT JOIN usuarios ua ON ua.id = s.analista_id`;

function pessoaOuNull(id: string | null, nome: string | null): Pessoa | null {
  return id !== null && nome !== null ? { id, nome } : null;
}

// Decisão vigente: colunas da própria solicitação, com o nome de quem decidiu por JOIN
const COLUNAS_DECISAO = Prisma.sql`
  s.decisao_comentario, s.decidido_em,
  ud.id AS decidido_por_id, ud.nome AS decidido_por_nome`;

const JOIN_DECISAO = Prisma.sql`LEFT JOIN usuarios ud ON ud.id = s.decidido_por_id`;

/*
 * Início da análise atual (dashboard): o evento mais recente entre ANALISE_INICIADA e REABERTA,
 * só em EM_ANALISE. Se for uma REABERTA, a análise atual ainda não começou e fica null. Uma linha
 * por solicitação da página, pelo índice (solicitacao_id, criado_em); o histórico tem RLS própria.
 */
const JOIN_ANALISE_INICIADA = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT h.tipo, h.criado_em
      FROM solicitacao_historico h
     WHERE s.status = 'EM_ANALISE'
       AND h.solicitacao_id = s.id
       AND h.tipo IN ('ANALISE_INICIADA', 'REABERTA')
     ORDER BY h.criado_em DESC
     LIMIT 1
  ) ultimo_inicio ON true`;

const COLUNA_ANALISE_INICIADA = Prisma.sql`
  CASE WHEN ultimo_inicio.tipo = 'ANALISE_INICIADA' THEN ultimo_inicio.criado_em END
    AS analise_iniciada_em`;

function paraDecisao(linha: LinhaDecisao): ColunasDecisao {
  return {
    decisaoComentario: linha.decisao_comentario,
    decididoEm: linha.decidido_em,
    decididoPor: pessoaOuNull(linha.decidido_por_id, linha.decidido_por_nome),
  };
}

function paraItemLista(linha: LinhaItemLista): ItemListaSolicitacao {
  return {
    ...paraItem(linha),
    ...paraDecisao(linha),
    analiseIniciadaEm: linha.analise_iniciada_em,
  };
}

function paraItem(linha: LinhaLista): ItemSolicitacao {
  return {
    id: linha.id,
    codigo: linha.codigo,
    titulo: linha.titulo,
    prioridade: linha.prioridade,
    status: linha.status,
    solicitante: { id: linha.solicitante_id, nome: linha.solicitante_nome },
    area: { id: linha.area_id, nome: linha.area_nome },
    analista: pessoaOuNull(linha.analista_id, linha.analista_nome),
    dataSolicitacao: linha.data_solicitacao,
    atualizadoEm: linha.atualizado_em,
  };
}

/** ORDER BY da lista; o código desempata, para a paginação ser estável. */
function ordemDaLista({ ordenarPor, direcao }: FiltrosLista): Prisma.Sql {
  switch (ordenarPor) {
    // Fila: ALTA → MEDIA → BAIXA e, dentro, a mais antiga primeiro; ignora a direção
    case 'prioridade':
      return Prisma.sql`s.prioridade DESC, s.data_solicitacao ASC, s.codigo ASC`;
    // Decididas: a decisão mais recente primeiro e as sem decisão no fim; ignora a direção
    case 'decididoEm':
      return Prisma.sql`s.decidido_em DESC NULLS LAST, s.codigo DESC`;
    case 'dataSolicitacao':
      return direcao === 'asc'
        ? Prisma.sql`s.data_solicitacao ASC, s.codigo ASC`
        : Prisma.sql`s.data_solicitacao DESC, s.codigo DESC`;
  }
}

/** Escapa os curingas do LIKE (`%`, `_`) e a própria barra, para o termo valer literalmente. */
function literalLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

/** Camada 1 da visibilidade: nada excluído (RN-12) e, para o solicitante, só as próprias (RN-13). */
function visiveis(visao: Visao): Prisma.Sql[] {
  const condicoes = [Prisma.sql`s.excluido_em IS NULL`];
  if (visao.cargo === 'SOLICITANTE') {
    condicoes.push(Prisma.sql`s.solicitante_id = ${visao.usuarioId}::uuid`);
  }
  return condicoes;
}

/**
 * Repositório Prisma. Usa o cliente da transação corrente (`@Transactional()` nos casos de uso),
 * que já tem o contexto do usuário para a RLS (camada 2). A camada 1 da visibilidade também fica
 * aqui: o solicitante só enxerga as próprias, e ninguém enxerga as excluídas.
 */
@Injectable()
export class RepositorioSolicitacoesPrisma extends RepositorioSolicitacoes {
  constructor(private readonly banco: ContextoBanco) {
    super();
  }

  async buscar(id: string, visao: Visao): Promise<SolicitacaoDetalhada | null> {
    const where = Prisma.join([Prisma.sql`s.id = ${id}::uuid`, ...visiveis(visao)], ' AND ');
    const [linha] = await this.banco.cliente.$queryRaw<LinhaDetalhe[]>`
      SELECT ${COLUNAS_LISTA}, ${COLUNAS_DECISAO}, s.descricao, s.versao
        FROM ${ORIGEM}
        ${JOIN_DECISAO}
       WHERE ${where}`;
    if (!linha) return null;
    return {
      ...paraItem(linha),
      solicitanteId: linha.solicitante_id,
      analistaId: linha.analista_id,
      descricao: linha.descricao,
      ...paraDecisao(linha),
      versao: linha.versao,
    };
  }

  async listar(filtros: FiltrosLista, visao: Visao): Promise<PaginaSolicitacoes> {
    const condicoes = visiveis(visao);
    if (filtros.status?.length) {
      const valores = filtros.status.map((status) => Prisma.sql`${status}::status_solicitacao`);
      condicoes.push(Prisma.sql`s.status IN (${Prisma.join(valores)})`);
    }
    if (filtros.prioridade?.length) {
      const valores = filtros.prioridade.map((prioridade) => Prisma.sql`${prioridade}::prioridade`);
      condicoes.push(Prisma.sql`s.prioridade IN (${Prisma.join(valores)})`);
    }
    if (filtros.areaIds?.length) {
      const valores = filtros.areaIds.map((areaId) => Prisma.sql`${areaId}::uuid`);
      condicoes.push(Prisma.sql`s.area_id IN (${Prisma.join(valores)})`);
    }
    if (filtros.analistaId) {
      condicoes.push(Prisma.sql`s.analista_id = ${filtros.analistaId}::uuid`);
    }
    if (filtros.termo) {
      // P-12: mesma expressão do índice idx_solicitacoes_busca, com o termo parametrizado
      const busca = Prisma.sql`app.sem_acento(lower(s.titulo || ' ' || s.descricao))
        LIKE '%' || app.sem_acento(lower(${literalLike(filtros.termo)})) || '%'`;
      condicoes.push(
        filtros.codigo === undefined
          ? busca
          : Prisma.sql`(${busca} OR s.codigo = ${filtros.codigo})`,
      );
    }
    const where = Prisma.join(condicoes, ' AND ');

    const ordem = ordemDaLista(filtros);

    const cliente = this.banco.cliente;
    const [contagem] = await cliente.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total FROM solicitacoes s WHERE ${where}`;
    const linhas = await cliente.$queryRaw<LinhaItemLista[]>`
      SELECT ${COLUNAS_LISTA}, ${COLUNAS_DECISAO}, ${COLUNA_ANALISE_INICIADA}
        FROM ${ORIGEM}
        ${JOIN_DECISAO}
        ${JOIN_ANALISE_INICIADA}
       WHERE ${where}
       ORDER BY ${ordem}
       LIMIT ${filtros.pageSize} OFFSET ${(filtros.page - 1) * filtros.pageSize}`;

    return { total: contagem?.total ?? 0, itens: linhas.map(paraItemLista) };
  }

  async criar(dados: {
    titulo: string;
    descricao: string;
    prioridade: Prioridade;
    solicitanteId: string;
    areaId: string;
    agora: Date;
  }): Promise<string> {
    const { id } = await this.banco.cliente.solicitacao.create({
      data: {
        titulo: dados.titulo,
        descricao: dados.descricao,
        prioridade: dados.prioridade,
        solicitanteId: dados.solicitanteId,
        areaId: dados.areaId,
        dataSolicitacao: dados.agora,
        atualizadoEm: dados.agora,
      },
      select: { id: true },
    });
    return id;
  }

  async editar(
    id: string,
    condicao: { versao: number; statusPermitidos: Status[] },
    campos: CamposEditaveis,
    agora: Date,
  ): Promise<boolean> {
    const { count } = await this.banco.cliente.solicitacao.updateMany({
      where: {
        id,
        versao: condicao.versao,
        status: { in: condicao.statusPermitidos },
        excluidoEm: null,
      },
      data: { ...campos, versao: { increment: 1 }, atualizadoEm: agora },
    });
    return count === 1;
  }

  async excluir(
    id: string,
    condicao: { statusPermitidos: Status[] },
    agora: Date,
  ): Promise<boolean> {
    const { count } = await this.banco.cliente.solicitacao.updateMany({
      where: { id, status: { in: condicao.statusPermitidos }, excluidoEm: null },
      data: { excluidoEm: agora, versao: { increment: 1 }, atualizadoEm: agora },
    });
    return count === 1;
  }

  async iniciarAnalise(id: string, analistaId: string, agora: Date): Promise<boolean> {
    const { count } = await this.banco.cliente.solicitacao.updateMany({
      where: { id, status: 'ABERTA', excluidoEm: null },
      data: {
        status: 'EM_ANALISE',
        analistaId,
        versao: { increment: 1 },
        atualizadoEm: agora,
      },
    });
    return count === 1;
  }

  async decidir(
    id: string,
    decisao: { resultado: Resultado; comentario: string; decididoPorId: string },
    agora: Date,
  ): Promise<boolean> {
    const { count } = await this.banco.cliente.solicitacao.updateMany({
      where: { id, status: 'EM_ANALISE', excluidoEm: null },
      data: {
        status: decisao.resultado,
        decisaoComentario: decisao.comentario,
        decididoEm: agora,
        decididoPorId: decisao.decididoPorId,
        versao: { increment: 1 },
        atualizadoEm: agora,
      },
    });
    return count === 1;
  }

  async reabrir(id: string, statusAtual: Status, agora: Date): Promise<boolean> {
    const { count } = await this.banco.cliente.solicitacao.updateMany({
      where: { id, status: statusAtual, excluidoEm: null },
      data: {
        status: 'ABERTA',
        analistaId: null,
        decisaoComentario: null,
        decididoEm: null,
        decididoPorId: null,
        versao: { increment: 1 },
        atualizadoEm: agora,
      },
    });
    return count === 1;
  }

  async registrarEvento(evento: NovoEvento): Promise<void> {
    // createMany não pede RETURNING: o INSERT só precisa passar pela política historico_insert.
    // Sem criadoEm: o default clock_timestamp() marca a hora real da gravação
    await this.banco.cliente.solicitacaoHistorico.createMany({
      data: [
        {
          solicitacaoId: evento.solicitacaoId,
          tipo: evento.tipo,
          statusAnterior: evento.statusAnterior,
          statusNovo: evento.statusNovo,
          comentario: evento.comentario,
          autorId: evento.autorId,
          dados: evento.dados === null ? Prisma.DbNull : (evento.dados as Prisma.InputJsonObject),
        },
      ],
    });
  }

  async listarHistorico(solicitacaoId: string): Promise<EventoDetalhado[]> {
    const eventos = await this.banco.cliente.solicitacaoHistorico.findMany({
      where: { solicitacaoId },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        tipo: true,
        statusAnterior: true,
        statusNovo: true,
        comentario: true,
        dados: true,
        criadoEm: true,
        autor: PESSOA,
      },
    });
    return eventos.map((evento) => ({
      ...evento,
      tipo: evento.tipo,
      dados: (evento.dados ?? null) as Record<string, unknown> | null,
    }));
  }

  async listarEventosIntegracao(solicitacaoId: string): Promise<EventoIntegracao[]> {
    // Só as colunas que o app_runtime pode ler: payload, último erro e correlation id ficam com o
    // worker. A RLS da outbox herda a visibilidade da solicitação.
    const eventos = await this.banco.cliente.outboxEvento.findMany({
      where: { agregadoId: solicitacaoId },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        tipo: true,
        status: true,
        tentativas: true,
        proximaTentativaEm: true,
        criadoEm: true,
        enviadoEm: true,
      },
    });
    return eventos.map((evento) => ({ ...evento, tipo: evento.tipo as TipoEventoIntegracao }));
  }

  async registrarEventoIntegracao(evento: NovoEventoIntegracao): Promise<void> {
    // createMany não pede RETURNING: o app_runtime não lê payload nem correlation_id
    await this.banco.cliente.outboxEvento.createMany({
      data: [
        {
          id: evento.id,
          tipo: evento.tipo,
          agregadoId: evento.agregadoId,
          payload: evento.payload as Prisma.InputJsonObject,
          correlationId: evento.correlationId,
        },
      ],
    });
  }

  async reprocessarIntegracao(solicitacaoId: string): Promise<boolean> {
    // Condicional a FALHOU: se o worker ou outro administrador mexeu antes, nada muda
    const afetadas = await this.banco.cliente.$executeRaw`
      UPDATE outbox_eventos
         SET status = 'PENDENTE', tentativas = 0, proxima_tentativa_em = clock_timestamp()
       WHERE status = 'FALHOU'
         AND id = (SELECT id FROM outbox_eventos
                    WHERE agregado_id = ${solicitacaoId}::uuid AND status = 'FALHOU'
                    ORDER BY criado_em, id
                    LIMIT 1)`;
    return afetadas === 1;
  }
}
