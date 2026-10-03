import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Campo de 42px com borda --input (3:1 sobre o card) e anel de foco --ring. */
export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'rounded-field bg-card text-foreground placeholder:text-muted-foreground h-[42px] w-full min-w-0 px-3.5 text-[15px] shadow-[inset_0_0_0_1px_var(--input)] transition-[box-shadow] duration-150 outline-none sm:text-sm',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
        'aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
