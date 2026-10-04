import type { components } from '@/lib/api/schema';

type Schemas = components['schemas'];

/** Resultado de GET /api/v1/auditoria/integridade (RN-10, doc 16), do contrato OpenAPI. */
export type Integridade = Schemas['IntegridadeDto'];
export type DivergenciaIntegridade = Schemas['DivergenciaHistorico'];
export type MotivoDivergencia = Schemas['MotivoDivergencia'];

/** Retorno próprio da action: a falha carrega o requestId para o suporte. */
export type ResultadoIntegridade =
  | { ok: true; integridade: Integridade }
  | { ok: false; erro: string; code?: string; requestId?: string };
