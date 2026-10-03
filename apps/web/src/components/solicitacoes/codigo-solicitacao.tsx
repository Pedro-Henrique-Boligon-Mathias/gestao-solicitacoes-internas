import { cn } from '@/lib/utils';

/** Código de exibição (SOL-000042) em fonte mono com algarismos tabulares. */
export function CodigoSolicitacao({ codigo, className }: { codigo: string; className?: string }) {
  return (
    <span
      className={cn(
        'text-muted-foreground font-mono text-[12.5px] whitespace-nowrap tabular-nums',
        className,
      )}
    >
      {codigo}
    </span>
  );
}
