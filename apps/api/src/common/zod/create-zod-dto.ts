import { createZodDto as createZodDtoBase, type ZodDto } from 'nestjs-zod';

type Esquema = Parameters<typeof createZodDtoBase>[0];

/** Fábrica que o @nestjs/swagger chama para ler as propriedades de um DTO. */
type Fabrica = (this: unknown) => Record<string, unknown>;
type ComMetadados = { _OPENAPI_METADATA_FACTORY: Fabrica };

// Valores literais: o que estiver dentro deles é dado, não JSON Schema
const CHAVES_DE_VALOR = new Set(['default', 'enum', 'const', 'example', 'examples']);

/**
 * O zod junta `anyOf: [{ type: 'string' }, { type: 'null' }]` em `type: ['string', 'null']`
 * (equivalente em JSON Schema). O @nestjs/swagger lê `type` em forma de lista como "lista de
 * itens desse tipo" e gera `{ type: 'array', items: { type: 'string' } }`, perdendo o null;
 * o nestjs-zod só converte para o `nullable` do OpenAPI 3.0 a forma com `anyOf`.
 * Aqui a lista volta a ser `anyOf`, antes de o swagger ler as propriedades.
 */
function separarTiposEmAnyOf(valor: unknown, raiz = true): unknown {
  if (Array.isArray(valor)) return valor.map((item) => separarTiposEmAnyOf(item, false));
  if (!valor || typeof valor !== 'object') return valor;

  const saida: Record<string, unknown> = {};
  for (const [chave, filho] of Object.entries(valor)) {
    saida[chave] = CHAVES_DE_VALOR.has(chave) ? filho : separarTiposEmAnyOf(filho, false);
  }

  const { type: tipo } = saida;
  if (Array.isArray(tipo) && !('anyOf' in saida)) {
    saida.anyOf = tipo.map((umTipo: unknown) => ({ type: umTipo }));
    // Na propriedade de topo o nestjs-zod espera `type: ''` e o remove na limpeza do documento
    if (raiz) saida.type = '';
    else delete saida.type;
  }
  return saida;
}

function corrigirMetadados(metadados: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadados).map(([propriedade, esquema]) => [
      propriedade,
      separarTiposEmAnyOf(esquema),
    ]),
  );
}

/**
 * Troca a fábrica na própria classe gerada pelo nestjs-zod, sem subclasse: o @nestjs/swagger
 * percorre a cadeia de protótipos e junta as propriedades de cada fábrica que encontrar, então
 * uma fábrica original que sobrasse num ancestral traria o `type` em lista de volta.
 */
function corrigirFabrica<T>(dto: T): T {
  const classe = dto as T & ComMetadados;
  const original = (classe as Partial<ComMetadados> | undefined)?._OPENAPI_METADATA_FACTORY;
  // Sem a fábrica (classe ausente ou API do nestjs-zod mudou), não há o que corrigir
  if (typeof original !== 'function') return classe;
  Object.defineProperty(classe, '_OPENAPI_METADATA_FACTORY', {
    value(this: unknown) {
      return corrigirMetadados(original.call(this));
    },
  });
  return classe;
}

/**
 * `createZodDto` do nestjs-zod com o OpenAPI de tipos nuláveis corrigido (ver
 * `separarTiposEmAnyOf`). Todos os DTOs da API devem vir daqui.
 */
export function createZodDto<TSchema extends Esquema, TCodec extends boolean = false>(
  schema: TSchema,
  options?: { codec: TCodec },
): ZodDto<TSchema, TCodec> {
  const dto = corrigirFabrica(createZodDtoBase<TSchema, TCodec>(schema, options));
  // `Output` cria outra classe a cada leitura (DTO de saída); ela recebe a mesma correção
  const descritorSaida = Object.getOwnPropertyDescriptor(dto, 'Output');
  Object.defineProperty(dto, 'Output', {
    get(this: unknown): ZodDto | undefined {
      return corrigirFabrica(descritorSaida?.get?.call(this) as ZodDto | undefined);
    },
  });
  return dto;
}
