import { Logger } from '@nestjs/common';

export interface ErroRegistrado {
  /** Contexto do Logger que registrou (o nome da classe). */
  contexto: string | undefined;
  /** Primeiro argumento do `logger.error`: `{ err, requestId }` no ProblemDetailsFilter. */
  dados: Record<string, unknown>;
}

/**
 * Captura o `Logger.error` do Nest só nas chamadas com o requestId informado (é assim que o
 * ProblemDetailsFilter registra os erros 500) e silencia essas chamadas. Qualquer outro erro
 * continua saindo no console. Use só no teste que provoca o erro e chame `restaurar()` no fim.
 */
export function capturarErroRegistrado(requestId: string) {
  const original = Logger.prototype.error;
  const capturados: ErroRegistrado[] = [];
  const espiao = jest.spyOn(Logger.prototype, 'error').mockImplementation(function (
    this: Logger,
    ...argumentos: unknown[]
  ) {
    const [dados] = argumentos;
    if (typeof dados === 'object' && dados !== null) {
      const registro = dados as Record<string, unknown>;
      if (registro.requestId === requestId) {
        const contexto = (this as unknown as { context?: string }).context;
        capturados.push({ contexto, dados: registro });
        return;
      }
    }
    original.apply(this, argumentos as Parameters<typeof original>);
  });
  return { capturados: () => capturados, restaurar: () => espiao.mockRestore() };
}
