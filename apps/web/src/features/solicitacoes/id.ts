const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O id de uma solicitação é sempre um UUID. Qualquer outra coisa ("..", barras, espaços) é
 * recusada antes de montar a URL da API, para não virar outro caminho.
 */
export function ehIdDeSolicitacao(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}
