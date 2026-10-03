import { ROTULO_PRIORIDADE } from '@/features/solicitacoes/rotulos';
import type { Prioridade } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';

const BARRAS_PREENCHIDAS: Record<Prioridade, number> = { BAIXA: 1, MEDIA: 2, ALTA: 3 };

export const COR_PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: 'text-priority-baixa',
  MEDIA: 'text-priority-media',
  ALTA: 'text-priority-alta',
};

/** Três barras crescentes de 12px: Baixa preenche uma, Média duas, Alta três. */
export function IconePrioridade({
  prioridade,
  className,
}: {
  prioridade: Prioridade;
  className?: string;
}) {
  const preenchidas = BARRAS_PREENCHIDAS[prioridade];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={cn('size-3 flex-none fill-current', className)}
    >
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          data-preenchida={i < preenchidas ? 'true' : 'false'}
          x={i * 4.5}
          y={8 - i * 3.5}
          width="3"
          height={4 + i * 3.5}
          rx="0.8"
          opacity={i < preenchidas ? 1 : 0.28}
        />
      ))}
    </svg>
  );
}

/** Selo de prioridade: só contorno, ícone de barras e texto (forma diferente do status). */
export function SeloPrioridade({
  prioridade,
  className,
}: {
  prioridade: Prioridade;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-pill inline-flex h-6 flex-none items-center gap-1.5 px-2.5 text-xs font-medium whitespace-nowrap shadow-[inset_0_0_0_1px_currentColor]',
        COR_PRIORIDADE[prioridade],
        className,
      )}
    >
      <IconePrioridade prioridade={prioridade} />
      {ROTULO_PRIORIDADE[prioridade]}
    </span>
  );
}
