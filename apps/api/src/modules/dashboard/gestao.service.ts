import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACAO_INTEGRACAO, type ConfiguracaoIntegracao } from '../../config/integracao';
import { Transactional } from '../../database/transacao';
import { formatarCodigo } from '../solicitacoes/domain/codigo';
import { granularidadeDoPeriodo } from './domain/granularidade';
import { limitesDoPeriodo, type Periodo } from './domain/periodo';
import type { GestaoDto } from './gestao.dto';
import {
  ConsultasGestao,
  type Janela,
  type LinhaAnalista,
  type LinhaArea,
  type LinhaEntradaSaida,
  type LinhaFila,
  type LinhaIntegracao,
} from './infra/consultas-gestao';

type EntradaSaida = GestaoDto['entradaSaida'];

/**
 * Painel de gestão do Admin (RF-04, PR 4C). As consultas rodam em sequência na mesma transação,
 * com o contexto do usuário (RLS). Entrada e saída e Por analista contam eventos do histórico
 * (decisão 4): uma decisão desfeita por reabertura continua contando como saída, e o tempo médio
 * de uma reaberta conta desde a criação original. Limitações documentadas na especificação.
 */
@Injectable()
export class GestaoService {
  constructor(
    private readonly consultas: ConsultasGestao,
    @Inject(CONFIGURACAO_INTEGRACAO) private readonly integracao: ConfiguracaoIntegracao,
  ) {}

  @Transactional()
  async painel(periodo: Periodo = 'tudo'): Promise<GestaoDto> {
    const { valor, inicio, fim } = limitesDoPeriodo(periodo, new Date());
    const janela: Janela = { inicio, fim, fimInclusivo: true };

    const atual = await this.consultas.entradaSaida(janela);
    const anterior = await this.janelaAnterior(inicio, fim, valor);
    const fila = await this.consultas.fila();
    const primeiro = valor === 'tudo' ? await this.consultas.primeiroEvento() : null;
    const granularidade = granularidadeDoPeriodo(valor, primeiro, fim);
    const serie = granularidade
      ? await this.consultas.serie(janela, inicio ?? primeiro ?? fim, granularidade)
      : [];
    const areas = await this.consultas.porArea(inicio, fim);
    const analistas = await this.consultas.porAnalista(janela);
    const integracoes = await this.consultas.integracoesComFalha();

    return {
      periodo: {
        valor,
        inicio: inicio?.toISOString() ?? null,
        fim: fim.toISOString(),
        granularidade,
      },
      entradaSaida: {
        ...this.contagens(atual),
        anterior: anterior && {
          entraram: anterior.entraram,
          sairam: anterior.sairam,
          tempoMedioDecisaoDias: anterior.tempo_medio_dias,
        },
        tempoMedioDecisaoDias: atual.tempo_medio_dias,
        ...this.estadoDaFila(fila),
        serie: serie.map((balde) => ({ ...balde, inicio: balde.inicio.toISOString() })),
      },
      porArea: areas.map(paraArea),
      porAnalista: analistas.map(paraAnalista),
      integracoesComFalha: integracoes.map((linha) => this.paraIntegracao(linha)),
      geradoEm: fim.toISOString(),
    };
  }

  /** Janela de mesmo tamanho logo antes do período (fim exclusivo); só em 7d e 30d. */
  private async janelaAnterior(
    inicio: Date | null,
    fim: Date,
    valor: Periodo,
  ): Promise<LinhaEntradaSaida | null> {
    if (!inicio || valor === 'hoje' || valor === 'tudo') return null;
    const tamanho = fim.getTime() - inicio.getTime();
    return this.consultas.entradaSaida({
      inicio: new Date(inicio.getTime() - tamanho),
      fim: inicio,
      fimInclusivo: false,
    });
  }

  private contagens(linha: LinhaEntradaSaida) {
    return {
      entraram: linha.entraram,
      sairam: linha.sairam,
      aprovadas: linha.aprovadas,
      rejeitadas: linha.rejeitadas,
      saldo: linha.entraram - linha.sairam,
      prioridadeEntraram: {
        BAIXA: linha.entraram_baixa,
        MEDIA: linha.entraram_media,
        ALTA: linha.entraram_alta,
      },
    };
  }

  private estadoDaFila(
    fila: LinhaFila,
  ): Pick<EntradaSaida, 'maisAntigaNaFila' | 'pendentesPorPrioridade'> {
    const antiga =
      fila.antiga_id && fila.antiga_codigo !== null && fila.antiga_desde && fila.antiga_area_id
        ? {
            id: fila.antiga_id,
            codigo: formatarCodigo(fila.antiga_codigo),
            area: { id: fila.antiga_area_id, nome: fila.antiga_area_nome ?? '' },
            desde: fila.antiga_desde.toISOString(),
          }
        : null;
    return {
      maisAntigaNaFila: antiga,
      pendentesPorPrioridade: {
        BAIXA: fila.pendentes_baixa,
        MEDIA: fila.pendentes_media,
        ALTA: fila.pendentes_alta,
      },
    };
  }

  private paraIntegracao(linha: LinhaIntegracao): GestaoDto['integracoesComFalha'][number] {
    return {
      solicitacao: {
        id: linha.solicitacao_id,
        codigo: formatarCodigo(linha.codigo),
        titulo: linha.titulo,
        solicitante: { id: linha.solicitante_id, nome: linha.solicitante_nome },
        area: { id: linha.area_id, nome: linha.area_nome },
      },
      tipo: linha.tipo,
      tentativas: linha.tentativas,
      maxTentativas: this.integracao.maxTentativas,
      ultimoErro: linha.ultimo_erro,
      ultimaTentativaEm: linha.ultima_tentativa_em?.toISOString() ?? null,
    };
  }
}

function paraArea(linha: LinhaArea): GestaoDto['porArea'][number] {
  const porStatus = {
    ABERTA: linha.aberta,
    EM_ANALISE: linha.em_analise,
    APROVADA: linha.aprovada,
    REJEITADA: linha.rejeitada,
  };
  const total = porStatus.ABERTA + porStatus.EM_ANALISE + porStatus.APROVADA + porStatus.REJEITADA;
  return { area: { id: linha.id, nome: linha.nome }, total, porStatus };
}

function paraAnalista(linha: LinhaAnalista): GestaoDto['porAnalista'][number] {
  return {
    analista: { id: linha.id, nome: linha.nome },
    emAnaliseAgora: linha.em_analise_agora,
    decididas: linha.decididas,
    aprovadas: linha.aprovadas,
    taxaAprovacao: linha.decididas > 0 ? linha.aprovadas / linha.decididas : null,
  };
}
