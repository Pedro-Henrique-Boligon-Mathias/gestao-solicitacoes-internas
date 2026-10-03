import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { EnvWorker } from '../../../config/env-worker';
import { calcularAtraso, type ConfiguracaoBackoff } from '../domain/backoff';
import { classificarResposta } from '../domain/classificacao';
import {
  Heartbeat,
  RepositorioOutbox,
  SistemaExterno,
  type Desfecho,
  type EventoOutbox,
} from './portas';

export interface ResultadoCiclo {
  processados: number;
}

/**
 * Worker da outbox (ADR-010). Cada ciclo envia até OUTBOX_LOTE eventos, um por transação, e grava o
 * heartbeat depois de cada evento e no fim. Assim um ciclo longo (sistema externo lento, perto do
 * timeout) não passa da janela do healthcheck. Quem repete os ciclos no intervalo é o `worker.ts`;
 * aqui não há laço próprio.
 */
@Injectable()
export class ProcessadorOutbox {
  private readonly lote: number;
  private readonly maxTentativas: number;
  private readonly backoff: ConfiguracaoBackoff;

  constructor(
    private readonly repositorio: RepositorioOutbox,
    private readonly sistemaExterno: SistemaExterno,
    private readonly heartbeat: Heartbeat,
    config: ConfigService<EnvWorker, true>,
    @InjectPinoLogger(ProcessadorOutbox.name) private readonly logger: PinoLogger,
  ) {
    this.lote = config.get('OUTBOX_LOTE', { infer: true });
    this.maxTentativas = config.get('OUTBOX_MAX_TENTATIVAS', { infer: true });
    this.backoff = {
      baseMs: config.get('OUTBOX_BACKOFF_BASE_MS', { infer: true }),
      maxMs: config.get('OUTBOX_BACKOFF_MAX_MS', { infer: true }),
    };
  }

  /** Um ciclo: até um lote de eventos e o heartbeat, mesmo quando não havia nada para enviar. */
  async processarCiclo(): Promise<ResultadoCiclo> {
    let processados = 0;
    while (
      processados < this.lote &&
      (await this.repositorio.processarProximo((evento) => this.tentar(evento)))
    ) {
      processados += 1;
      await this.heartbeat.registrar(new Date());
    }
    if (processados === 0) await this.heartbeat.registrar(new Date());
    return { processados };
  }

  /** Envia o evento e decide o desfecho; cada tentativa vira uma linha de log estruturado. */
  private async tentar(evento: EventoOutbox): Promise<Desfecho> {
    const tentativa = evento.tentativas + 1;
    const resposta = await this.sistemaExterno.enviar(evento);
    const registro = {
      eventoId: evento.id,
      tipo: evento.tipo,
      agregadoId: evento.agregadoId,
      correlationId: evento.correlationId,
      tentativa,
      maxTentativas: this.maxTentativas,
      statusHttp: resposta.statusHttp,
      latenciaMs: resposta.latenciaMs,
    };

    const classificacao = classificarResposta(resposta.statusHttp);
    if (classificacao === 'SUCESSO') {
      this.logger.info({ ...registro, resultado: 'ENVIADO' }, 'Evento enviado ao sistema externo');
      return { status: 'ENVIADO' };
    }

    const erro = resposta.erro ?? `HTTP ${resposta.statusHttp ?? 'sem resposta'}`;
    if (classificacao === 'TRANSITORIO' && tentativa < this.maxTentativas) {
      const atrasoMs = calcularAtraso(tentativa, this.backoff);
      const proximaTentativaEm = new Date(Date.now() + atrasoMs).toISOString();
      this.logger.warn(
        { ...registro, resultado: 'NOVA_TENTATIVA', erro, atrasoMs, proximaTentativaEm },
        'Falha transitória; nova tentativa agendada',
      );
      return { status: 'PENDENTE', erro, atrasoMs };
    }

    const motivo = classificacao === 'PERMANENTE' ? 'ERRO_PERMANENTE' : 'TENTATIVAS_ESGOTADAS';
    this.logger.error(
      { ...registro, resultado: 'FALHOU', motivo, erro },
      'Evento marcado como FALHOU; reprocessamento manual pelo administrador',
    );
    return { status: 'FALHOU', erro };
  }
}
