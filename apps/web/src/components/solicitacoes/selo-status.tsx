import { ROTULO_STATUS } from '@/features/solicitacoes/rotulos';
import type { Status } from '@/features/solicitacoes/tipos';
import { cn } from '@/lib/utils';

/** Classes de cor por status (fundo claro, texto e ponto). */
export const CORES_STATUS: Record<Status, { selo: string; ponto: string; barra: string }> = {
  ABERTA: {
    selo: 'bg-status-aberta-bg text-status-aberta-fg',
    ponto: 'bg-status-aberta-dot',
    barra: 'bg-status-aberta-dot',
  },
  EM_ANALISE: {
    selo: 'bg-status-analise-bg text-status-analise-fg',
    ponto: 'bg-status-analise-dot',
    barra: 'bg-status-analise-dot',
  },
  APROVADA: {
    selo: 'bg-status-aprovada-bg text-status-aprovada-fg',
    ponto: 'bg-status-aprovada-dot',
    barra: 'bg-status-aprovada-dot',
  },
  REJEITADA: {
    selo: 'bg-status-rejeitada-bg text-status-rejeitada-fg',
    ponto: 'bg-status-rejeitada-dot',
    barra: 'bg-status-rejeitada-dot',
  },
};

/** Ponto colorido decorativo (o texto ao lado é que informa). */
export function PontoStatus({ status, className }: { status: Status; className?: string }) {
  return (
    <span aria-hidden="true" className="inline-flex">
      <span
        data-ponto
        className={cn('size-1.5 flex-none rounded-full', CORES_STATUS[status].ponto, className)}
      />
    </span>
  );
}

/** Selo de status: fundo claro, ponto e texto, 24px. Nunca só cor. */
export function SeloStatus({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        'rounded-pill inline-flex h-6 flex-none items-center gap-1.5 px-2.5 text-xs font-medium whitespace-nowrap',
        CORES_STATUS[status].selo,
        className,
      )}
    >
      <PontoStatus status={status} />
      {/* O leitor de tela ouve "Status: Aprovada", o que distingue o selo do mesmo texto no histórico */}
      <span className="sr-only">Status: </span>
      <span>{ROTULO_STATUS[status]}</span>
    </span>
  );
}
