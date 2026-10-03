const PREFIXO = 'SOL-';
const CODIGO = /^(?:sol-)?(\d+)$/i;
/** Maior valor da coluna `codigo` (integer do Postgres). */
const MAIOR_CODIGO = 2_147_483_647;

/** Código exibido: `SOL-` + o sequencial com pelo menos 6 dígitos (42 → SOL-000042). */
export function formatarCodigo(codigo: number): string {
  return `${PREFIXO}${String(codigo).padStart(6, '0')}`;
}

/** Número do código em `SOL-000042`, `sol-42`, `42` ou `000042`; `null` se o texto não for um código. */
export function interpretarCodigo(texto: string): number | null {
  const encontrado = CODIGO.exec(texto.trim());
  if (!encontrado) return null;
  const numero = Number(encontrado[1]);
  return numero <= MAIOR_CODIGO ? numero : null;
}
