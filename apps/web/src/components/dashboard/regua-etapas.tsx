import type { components } from '@/lib/api/schema';
import { cn } from '@/lib/utils';

type Status = components['schemas']['PaginaSolicitacoesDto']['data'][number]['status'];

const ETAPAS = ['Aberta', 'Em análise', 'Decisão'] as const;

function indiceDaEtapa(status: Status): number {
  if (status === 'ABERTA') return 0;
  if (status === 'EM_ANALISE') return 1;
  return 2;
}

/**
 * Régua Aberta → Em análise → Decisão do "Em andamento" (sobre o card escuro). O ponto e o halo
 * são visuais; o leitor de tela recebe a etapa atual no nome da lista e no aria-current.
 */
export function ReguaEtapas({ status, className }: { status: Status; className?: string }) {
  const atual = indiceDaEtapa(status);
  return (
    <ol aria-label={`Etapa atual: ${ETAPAS[atual]}`} className={cn('grid grid-cols-3', className)}>
      {ETAPAS.map((etapa, indice) => {
        const feita = indice < atual;
        const eAtual = indice === atual;
        return (
          <li
            key={etapa}
            aria-current={eAtual ? 'step' : undefined}
            className={cn(
              'relative flex flex-col items-center gap-2 text-center text-[11.5px]',
              eAtual ? 'font-semibold text-hero-foreground' : 'text-hero-muted',
            )}
          >
            {indice < ETAPAS.length - 1 ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-[5px] left-[calc(50%+6px)] h-0.5 w-[calc(100%-12px)]',
                  feita ? 'bg-brand-orange' : 'bg-hero-muted/35',
                )}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-[1] size-3 rounded-full',
                feita || eAtual
                  ? 'bg-brand-orange'
                  : 'bg-hero ring-2 ring-hero-muted/35 ring-inset',
                eAtual && 'shadow-[0_0_0_4px_rgba(252,163,17,0.28)]',
              )}
            />
            {etapa}
          </li>
        );
      })}
    </ol>
  );
}
