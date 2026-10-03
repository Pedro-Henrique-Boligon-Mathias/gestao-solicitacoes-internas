import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Área de texto com a mesma borda e foco do Input. */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'rounded-field bg-card text-foreground placeholder:text-muted-foreground min-h-28 w-full min-w-0 resize-y px-3.5 py-2.5 text-[15px] leading-normal shadow-[inset_0_0_0_1px_var(--input)] transition-[box-shadow] duration-150 outline-none sm:text-sm',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
        'aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
