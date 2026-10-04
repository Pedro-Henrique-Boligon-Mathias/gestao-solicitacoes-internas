import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CONFIGURACAO_INTEGRACAO, type ConfiguracaoIntegracao } from '../../../config/integracao';
import { Transactional } from '../../../database/transacao';
import { eventoEmFoco } from '../../integracoes/domain/foco';
import type { StatusOutbox, TipoEventoIntegracao } from '../../integracoes/domain/tipos';
import { interpretarCodigo } from '../domain/codigo';
import { ConflitoDeVersao, SolicitacaoNaoEncontrada, TransicaoInvalida } from '../domain/erros';
import { transicionar } from '../domain/maquina-de-estados';
import { acoesPermitidas, verificarAcao } from '../domain/politicas';
import type { Acao, Cargo, Prioridade, Resultado, Status } from '../domain/tipos';
import { montarPayload } from './eventos-integracao';
import {
  RepositorioSolicitacoes,
  type CamposEditaveis,
  type EventoDetalhado,
  type EventoIntegracao,
  type FiltrosLista,
  type ItemListaSolicitacao,
  type SolicitacaoDetalhada,
  type Visao,
} from './repositorio-solicitacoes';

/** Quem executa o caso de uso (vem do JwtAuthGuard). */
export interface Executor {
  id: string;
  nome: string;
  cargo: Cargo;
  areaId: string;
}

/**
 * Situação da integração com o sistema externo (ADR-010). Os campos de topo são do evento em
 * foco: o mais antigo ainda não enviado (que segura a fila) ou, se todos foram, o mais recente.
 */
export interface Integracao {
  status: StatusOutbox;
  tipo: TipoEventoIntegracao;
  tentativas: number;
  maxTentativas: number;
  proximaTentativaEm: Date;
  enviadaEm: Date | null;
  /** Eventos não enviados atrás do evento em foco. */
  aguardando: number;
  /** Todos os eventos, em ordem cronológica. */
  eventos: EventoIntegracao[];
}

export interface SolicitacaoComAcoes extends SolicitacaoDetalhada {
  integracao: Integracao | null;
  acoesPermitidas: Acao[];
}

/** Solicitação lida com os eventos de integração, que a política usa no reprocessamento. */
interface SolicitacaoCarregada extends SolicitacaoDetalhada {
  eventosIntegracao: EventoIntegracao[];
  statusIntegracao: StatusOutbox | null;
}

export interface ConsultaLista {
  q?: string;
  status?: Status[];
  prioridade?: Prioridade[];
  analista?: 'eu';
  area?: string[];
  ordenarPor: FiltrosLista['ordenarPor'];
  direcao: FiltrosLista['direcao'];
  page: number;
  pageSize: number;
}

export interface Pagina {
  itens: ItemListaSolicitacao[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Só o formato: um id que nem é UUID responde como inexistente (404), sem chegar ao banco.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Status em que a edição e a exclusão podem acontecer para este usuário (RN-02, RN-09). */
function statusEditaveis(executor: Executor): Status[] {
  return executor.cargo === 'ADMIN' ? ['ABERTA', 'EM_ANALISE'] : ['ABERTA'];
}

function visaoDe(executor: Executor): Visao {
  return { usuarioId: executor.id, cargo: executor.cargo };
}

/**
 * Casos de uso das solicitações. Cada um roda numa transação com o contexto do usuário no banco
 * (`@Transactional()`), aplica a política de domínio e persiste a mudança e o histórico juntos
 * (RN-10). Mudanças de status são UPDATEs condicionais ao status esperado (RN-11).
 */
@Injectable()
export class SolicitacoesService {
  constructor(
    private readonly repositorio: RepositorioSolicitacoes,
    private readonly cls: ClsService,
    @Inject(CONFIGURACAO_INTEGRACAO) private readonly integracao: ConfiguracaoIntegracao,
  ) {}

  @Transactional()
  async listar(executor: Executor, consulta: ConsultaLista): Promise<Pagina> {
    const codigo = consulta.q ? interpretarCodigo(consulta.q) : null;
    const { itens, total } = await this.repositorio.listar(
      {
        termo: consulta.q,
        codigo: codigo ?? undefined,
        status: consulta.status,
        prioridade: consulta.prioridade,
        analistaId: consulta.analista === 'eu' ? executor.id : undefined,
        areaIds: consulta.area,
        ordenarPor: consulta.ordenarPor,
        direcao: consulta.direcao,
        page: consulta.page,
        pageSize: consulta.pageSize,
      },
      visaoDe(executor),
    );
    return {
      itens,
      page: consulta.page,
      pageSize: consulta.pageSize,
      total,
      totalPages: Math.ceil(total / consulta.pageSize),
    };
  }

  @Transactional()
  async detalhar(executor: Executor, id: string): Promise<SolicitacaoComAcoes> {
    return this.comAcoes(executor, await this.carregar(executor, id));
  }

  @Transactional()
  async historico(executor: Executor, id: string): Promise<EventoDetalhado[]> {
    await this.carregar(executor, id);
    return this.repositorio.listarHistorico(id);
  }

  /** RN-01: solicitante, área, data e status vêm do servidor. */
  @Transactional()
  async criar(
    executor: Executor,
    dados: { titulo: string; descricao: string; prioridade: Prioridade },
  ): Promise<SolicitacaoComAcoes> {
    const agora = new Date();
    const id = await this.repositorio.criar({
      ...dados,
      solicitanteId: executor.id,
      areaId: executor.areaId,
      agora,
    });
    await this.repositorio.registrarEvento({
      solicitacaoId: id,
      tipo: 'CRIADA',
      statusAnterior: null,
      statusNovo: 'ABERTA',
      comentario: null,
      autorId: executor.id,
      dados: null,
    });
    return this.detalharNaTransacao(executor, id);
  }

  /** RN-02 / RN-03 / RN-10: só título, descrição e prioridade, com controle de versão. */
  @Transactional()
  async editar(
    executor: Executor,
    id: string,
    alteracao: CamposEditaveis & { versao: number },
  ): Promise<SolicitacaoComAcoes> {
    const atual = await this.carregar(executor, id);
    verificarAcao(executor, atual, 'EDITAR');
    if (atual.versao !== alteracao.versao) throw new ConflitoDeVersao();

    const mudancas: CamposEditaveis = {};
    const dados: Record<string, { antes: string; depois: string }> = {};
    for (const campo of ['titulo', 'descricao', 'prioridade'] as const) {
      const novo = alteracao[campo];
      if (novo !== undefined && novo !== atual[campo]) {
        Object.assign(mudancas, { [campo]: novo });
        dados[campo] = { antes: atual[campo], depois: novo };
      }
    }
    // Nada mudou: responde a solicitação como está, sem evento e sem nova versão
    if (Object.keys(mudancas).length === 0) return this.comAcoes(executor, atual);

    const agora = new Date();
    const editou = await this.repositorio.editar(
      id,
      { versao: alteracao.versao, statusPermitidos: statusEditaveis(executor) },
      mudancas,
      agora,
    );
    if (!editou) await this.recusarConcorrencia(executor, id, 'EDITAR', new ConflitoDeVersao());

    await this.repositorio.registrarEvento({
      solicitacaoId: id,
      tipo: 'EDITADA',
      statusAnterior: null,
      statusNovo: null,
      comentario: null,
      autorId: executor.id,
      dados,
    });
    return this.detalharNaTransacao(executor, id);
  }

  /** RN-09 / ADR-007: exclusão lógica, registrada no histórico. */
  @Transactional()
  async excluir(executor: Executor, id: string): Promise<void> {
    const atual = await this.carregar(executor, id);
    verificarAcao(executor, atual, 'EXCLUIR');

    const agora = new Date();
    const excluiu = await this.repositorio.excluir(
      id,
      { statusPermitidos: statusEditaveis(executor) },
      agora,
    );
    if (!excluiu) await this.recusarConcorrencia(executor, id, 'EXCLUIR');

    await this.repositorio.registrarEvento({
      solicitacaoId: id,
      tipo: 'EXCLUIDA',
      statusAnterior: null,
      statusNovo: null,
      comentario: null,
      autorId: executor.id,
      dados: null,
    });
  }

  /** RN-04: quem inicia a análise vira o analista responsável. */
  @Transactional()
  async iniciarAnalise(executor: Executor, id: string): Promise<SolicitacaoComAcoes> {
    const atual = await this.carregar(executor, id);
    verificarAcao(executor, atual, 'INICIAR_ANALISE');
    const novoStatus = transicionar(atual.status, 'INICIAR_ANALISE');

    const agora = new Date();
    if (!(await this.repositorio.iniciarAnalise(id, executor.id, agora))) {
      await this.recusarConcorrencia(executor, id, 'INICIAR_ANALISE');
    }
    await this.repositorio.registrarEvento({
      solicitacaoId: id,
      tipo: 'ANALISE_INICIADA',
      statusAnterior: atual.status,
      statusNovo: novoStatus,
      comentario: null,
      autorId: executor.id,
      dados: null,
    });
    return this.detalharNaTransacao(executor, id);
  }

  /** RN-05 / RN-06: o analista responsável continua o mesmo quando o administrador decide. */
  @Transactional()
  async decidir(
    executor: Executor,
    id: string,
    decisao: { resultado: Resultado; comentario: string },
  ): Promise<SolicitacaoComAcoes> {
    const atual = await this.carregar(executor, id);
    verificarAcao(executor, atual, 'DECIDIR', decisao.resultado);
    const novoStatus = transicionar(
      atual.status,
      decisao.resultado === 'APROVADA' ? 'APROVAR' : 'REJEITAR',
    );

    const agora = new Date();
    const decidiu = await this.repositorio.decidir(
      id,
      { ...decisao, decididoPorId: executor.id },
      agora,
    );
    if (!decidiu)
      await this.recusarConcorrencia(executor, id, 'DECIDIR', undefined, decisao.resultado);

    await this.repositorio.registrarEvento({
      solicitacaoId: id,
      tipo: decisao.resultado,
      statusAnterior: atual.status,
      statusNovo: novoStatus,
      comentario: decisao.comentario,
      autorId: executor.id,
      dados: null,
    });
    // RN-14: a aprovação gera o evento para o sistema externo, na mesma transação
    if (decisao.resultado === 'APROVADA') {
      await this.registrarEventoIntegracao('SolicitacaoAprovada', agora, atual, {
        resultado: 'APROVADA',
        comentario: decisao.comentario,
        decididoEm: agora,
        decididoPor: { id: executor.id, nome: executor.nome },
      });
    }
    return this.detalharNaTransacao(executor, id);
  }

  /** RN-16: volta para ABERTA sem analista e sem decisão; a decisão desfeita fica no histórico. */
  @Transactional()
  async reabrir(
    executor: Executor,
    id: string,
    justificativa: string,
  ): Promise<SolicitacaoComAcoes> {
    const atual = await this.carregar(executor, id);
    verificarAcao(executor, atual, 'REABRIR');
    const novoStatus = transicionar(atual.status, 'REABRIR');

    const agora = new Date();
    if (!(await this.repositorio.reabrir(id, atual.status, agora))) {
      await this.recusarConcorrencia(executor, id, 'REABRIR');
    }
    await this.repositorio.registrarEvento({
      solicitacaoId: id,
      tipo: 'REABERTA',
      statusAnterior: atual.status,
      statusNovo: novoStatus,
      comentario: justificativa,
      autorId: executor.id,
      dados: {
        decisaoAnterior: {
          resultado: atual.status,
          comentario: atual.decisaoComentario,
          decididoEm: atual.decididoEm?.toISOString() ?? null,
          decididoPor: atual.decididoPor,
          analista: atual.analista,
        },
      },
    });
    // RN-17: desfazer uma aprovação avisa o sistema externo; reabrir uma rejeitada não
    if (
      atual.status === 'APROVADA' &&
      atual.decisaoComentario !== null &&
      atual.decididoEm !== null &&
      atual.decididoPor !== null
    ) {
      await this.registrarEventoIntegracao(
        'SolicitacaoReaberta',
        agora,
        atual,
        {
          resultado: 'APROVADA',
          comentario: atual.decisaoComentario,
          decididoEm: atual.decididoEm,
          decididoPor: atual.decididoPor,
        },
        { justificativa, reabertaEm: agora, reabertaPor: { id: executor.id, nome: executor.nome } },
      );
    }
    return this.detalharNaTransacao(executor, id);
  }

  /**
   * ADR-010: o administrador devolve à fila o evento em FALHOU mais antigo, que pela ordem estrita
   * é o evento em foco. O payload e o id (chave de idempotência) continuam os mesmos.
   */
  @Transactional()
  async reprocessarIntegracao(executor: Executor, id: string): Promise<SolicitacaoComAcoes> {
    const atual = await this.carregar(executor, id);
    verificarAcao(executor, atual, 'REPROCESSAR_INTEGRACAO');

    if (!(await this.repositorio.reprocessarIntegracao(id))) {
      await this.recusarConcorrencia(executor, id, 'REPROCESSAR_INTEGRACAO');
    }
    return this.detalharNaTransacao(executor, id);
  }

  /** Solicitação visível e não excluída, ou 404 (não revela se existe). */
  private async carregar(executor: Executor, id: string): Promise<SolicitacaoCarregada> {
    const solicitacao = UUID.test(id) ? await this.repositorio.buscar(id, visaoDe(executor)) : null;
    if (!solicitacao) throw new SolicitacaoNaoEncontrada();
    const eventosIntegracao = await this.repositorio.listarEventosIntegracao(id);
    return {
      ...solicitacao,
      eventosIntegracao,
      statusIntegracao: eventoEmFoco(eventosIntegracao)?.evento.status ?? null,
    };
  }

  private async detalharNaTransacao(executor: Executor, id: string): Promise<SolicitacaoComAcoes> {
    return this.comAcoes(executor, await this.carregar(executor, id));
  }

  private comAcoes(executor: Executor, carregada: SolicitacaoCarregada): SolicitacaoComAcoes {
    return {
      ...carregada,
      integracao: this.resumirIntegracao(carregada.eventosIntegracao),
      acoesPermitidas: acoesPermitidas(executor, carregada),
    };
  }

  private resumirIntegracao(eventos: EventoIntegracao[]): Integracao | null {
    const foco = eventoEmFoco(eventos);
    if (!foco) return null;
    const { evento, aguardando } = foco;
    return {
      status: evento.status,
      tipo: evento.tipo,
      tentativas: evento.tentativas,
      maxTentativas: this.integracao.maxTentativas,
      proximaTentativaEm: evento.proximaTentativaEm,
      enviadaEm: evento.enviadoEm,
      aguardando,
      eventos,
    };
  }

  /** ADR-010: grava o evento na outbox, com o requestId da requisição como correlation id. */
  private async registrarEventoIntegracao(
    tipo: TipoEventoIntegracao,
    ocorridoEm: Date,
    solicitacao: SolicitacaoDetalhada,
    decisao: Parameters<typeof montarPayload>[0]['decisao'],
    reabertura?: Parameters<typeof montarPayload>[0]['reabertura'],
  ): Promise<void> {
    const eventoId = randomUUID();
    const correlationId = this.cls.isActive() ? (this.cls.getId() ?? null) : null;
    await this.repositorio.registrarEventoIntegracao({
      id: eventoId,
      tipo,
      agregadoId: solicitacao.id,
      correlationId,
      payload: montarPayload({
        id: eventoId,
        tipo,
        ocorridoEm,
        correlationId,
        solicitacao,
        decisao,
        reabertura,
      }),
    });
  }

  /**
   * O UPDATE condicional não afetou nenhuma linha: outra requisição mudou a solicitação depois da
   * leitura. Relê e responde com o erro da regra que agora bloqueia (409 na prática), ou com
   * `padrao` se a política ainda deixaria passar.
   */
  private async recusarConcorrencia(
    executor: Executor,
    id: string,
    acao: Acao,
    padrao?: Error,
    resultado?: Resultado,
  ): Promise<never> {
    const atual = await this.carregar(executor, id);
    verificarAcao(executor, atual, acao, resultado);
    throw (
      padrao ??
      new TransicaoInvalida('A solicitação foi alterada por outra pessoa. Recarregue a página.')
    );
  }
}
