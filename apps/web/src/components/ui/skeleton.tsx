import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Bloco de carregamento em --muted, no formato do conteúdo que vai chegar. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-muted animate-pulse rounded-field motion-reduce:animate-none', className)}
      {...props}
    />
  );
}
