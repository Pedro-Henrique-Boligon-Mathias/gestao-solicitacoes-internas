import { z } from 'zod';

/**
 * OUTBOX_MAX_TENTATIVAS: o worker para de tentar ao atingir esse número (FALHOU), e a API usa o
 * mesmo valor para mostrar "tentativa N de M". Os dois processos leem a mesma variável.
 */
export const maxTentativasSchema = z.coerce.number().int().min(1).max(100).default(8);

/** Configuração da integração que a API usa (lida e validada na subida). */
export interface ConfiguracaoIntegracao {
  maxTentativas: number;
}

export const CONFIGURACAO_INTEGRACAO = Symbol('CONFIGURACAO_INTEGRACAO');

export function lerConfiguracaoIntegracao(valor: unknown): ConfiguracaoIntegracao {
  const resultado = maxTentativasSchema.safeParse(valor === '' ? undefined : valor);
  if (!resultado.success) {
    throw new Error(
      `Configuração de ambiente inválida. OUTBOX_MAX_TENTATIVAS: ${resultado.error.issues[0]?.message ?? 'valor inválido'}`,
    );
  }
  return { maxTentativas: resultado.data };
}
