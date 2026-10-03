/** O que importa de uma sessão para decidir o destino de um refresh token. */
export interface EstadoDaSessao {
  expiraEm: Date;
  usadoEm: Date | null;
  revogadaEm: Date | null;
}

/**
 * - `ROTACIONAR`: token válido e ainda não usado; vira o próximo da família.
 * - `GRACA`: já foi trocado há poucos segundos (duas abas renovando juntas); emite outro par na
 *   mesma família, sem revogar.
 * - `REUSO`: já foi trocado fora da graça (possível roubo); a família inteira é revogada.
 * - `INVALIDA`: expirado ou revogado.
 */
export type DestinoDoRefresh = 'ROTACIONAR' | 'GRACA' | 'REUSO' | 'INVALIDA';

export function destinoDoRefresh(
  sessao: EstadoDaSessao,
  agora: Date,
  gracaSegundos: number,
): DestinoDoRefresh {
  if (sessao.revogadaEm || sessao.expiraEm.getTime() <= agora.getTime()) return 'INVALIDA';
  if (!sessao.usadoEm) return 'ROTACIONAR';
  const desdeOUso = agora.getTime() - sessao.usadoEm.getTime();
  return desdeOUso <= gracaSegundos * 1000 ? 'GRACA' : 'REUSO';
}
