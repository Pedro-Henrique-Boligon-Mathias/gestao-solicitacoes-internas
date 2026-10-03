import { cn } from '@/lib/utils';

export type Estado = 'ok' | 'falha';

// Selo com fundo, ponto e texto: o estado nunca depende só da cor
const ESTILOS: Record<Estado, { selo: string; ponto: string; rotulo: string }> = {
  ok: {
    selo: 'bg-status-aprovada-bg text-status-aprovada-fg',
    ponto: 'bg-status-aprovada-dot',
    rotulo: 'Operando',
  },
  falha: {
    selo: 'bg-status-rejeitada-bg text-status-rejeitada-fg',
    ponto: 'bg-status-rejeitada-dot',
    rotulo: 'Indisponível',
  },
};

export function IndicadorStatus({
  componente,
  estado,
  detalhe,
}: {
  componente: string;
  estado: Estado;
  detalhe?: string;
}) {
  const estilo = ESTILOS[estado];
  return (
    <li className="flex min-h-13 items-center justify-between gap-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{componente}</p>
        {detalhe ? <p className="text-muted-foreground text-[12.5px]">{detalhe}</p> : null}
      </div>
      <span
        className={cn(
          'rounded-pill inline-flex h-6 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium',
          estilo.selo,
        )}
      >
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', estilo.ponto)} />
        {estilo.rotulo}
      </span>
    </li>
  );
}
