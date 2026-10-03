const PADRAO = '/dashboard';

/**
 * Destino depois do login (`?next=`). Só aceita caminho interno, para não virar open redirect:
 * começa com `/`, mas não com `//` nem `/\` (o navegador trata os dois como outro host).
 */
export function destinoSeguro(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return PADRAO;
  if (next.startsWith('//') || next.startsWith('/\\')) return PADRAO;
  // Caracteres de controle podem ser descartados pelo navegador e formar "//" depois
  if (/[\u0000-\u001f\u007f]/.test(next)) return PADRAO;
  return next;
}
