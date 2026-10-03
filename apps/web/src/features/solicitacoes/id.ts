const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto no formato de UUID (ids de solicitação e de área). */
export function ehUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

/**
 * O id de uma solicitação é sempre um UUID. Qualquer outra coisa ("..", barras, espaços) é
 * recusada antes de montar a URL da API, para não virar outro caminho.
 */
export function ehIdDeSolicitacao(id: unknown): id is string {
  return ehUuid(id);
}
