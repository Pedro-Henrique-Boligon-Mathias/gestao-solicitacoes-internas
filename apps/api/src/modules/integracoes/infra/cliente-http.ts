import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvWorker } from '../../../config/env-worker';
import { SistemaExterno, type EventoOutbox, type RespostaEnvio } from '../application/portas';

/** Tamanho máximo da descrição do erro gravada em ultimo_erro. */
const MAX_ERRO = 500;

/**
 * POST {EXT_URL}/eventos com o contrato do evento. O id do evento vai no Idempotency-Key (a
 * entrega é at-least-once, e o receptor ignora duplicatas) e o requestId da requisição que gerou
 * o evento vai no X-Correlation-Id.
 */
@Injectable()
export class ClienteHttpSistemaExterno extends SistemaExterno {
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<EnvWorker, true>) {
    super();
    this.url = `${config.get('EXT_URL', { infer: true })}/eventos`;
    this.timeoutMs = config.get('OUTBOX_TIMEOUT_MS', { infer: true });
  }

  async enviar(evento: EventoOutbox): Promise<RespostaEnvio> {
    const inicio = performance.now();
    const latencia = () => Math.round(performance.now() - inicio);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': evento.id,
    };
    if (evento.correlationId) headers['X-Correlation-Id'] = evento.correlationId;

    try {
      const resposta = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(evento.payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      // Lê o corpo para liberar a conexão; o conteúdo não importa para o desfecho
      await resposta.arrayBuffer().catch(() => undefined);
      return {
        statusHttp: resposta.status,
        latenciaMs: latencia(),
        ...(resposta.ok ? {} : { erro: `HTTP ${resposta.status}` }),
      };
    } catch (erro) {
      const tempoEsgotado = erro instanceof Error && erro.name === 'TimeoutError';
      const descricao = tempoEsgotado
        ? `Tempo esgotado (${this.timeoutMs} ms)`
        : `Falha de rede: ${erro instanceof Error ? (erro.cause instanceof Error ? erro.cause.message : erro.message) : String(erro)}`;
      return { statusHttp: null, latenciaMs: latencia(), erro: descricao.slice(0, MAX_ERRO) };
    }
  }
}
