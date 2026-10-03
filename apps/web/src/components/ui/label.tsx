'use client';

import { Label as LabelPrimitivo } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitivo.Root>) {
  return (
    <LabelPrimitivo.Root
      className={cn('text-foreground text-[13px] leading-none font-medium select-none', className)}
      {...props}
    />
  );
}
