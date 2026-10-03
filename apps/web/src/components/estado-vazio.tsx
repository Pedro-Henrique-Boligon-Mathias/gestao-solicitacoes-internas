import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Estado vazio: ícone num quadrado de 52px, título, uma frase e a próxima ação. */
export function EstadoVazio({
  Icone,
  titulo,
  children,
  acao,
  className,
}: {
  Icone: LucideIcon;
  titulo: string;
  children?: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 px-5 py-12 text-center max-[760px]:py-9',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="bg-muted text-foreground rounded-field grid size-[52px] place-items-center"
      >
        <Icone className="size-[18px]" strokeWidth={1.8} />
      </span>
      <p className="font-display text-lg leading-[1.2] font-semibold tracking-[-0.02em]">
        {titulo}
      </p>
      {children && <div className="text-muted-foreground max-w-sm text-sm">{children}</div>}
      {acao && <div className="pt-1">{acao}</div>}
    </div>
  );
}
