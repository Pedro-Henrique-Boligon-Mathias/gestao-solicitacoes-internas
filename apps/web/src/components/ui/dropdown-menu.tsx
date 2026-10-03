'use client';

import { DropdownMenu as Primitivo } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Menu suspenso do shadcn/ui (Radix) com a sombra de "flutuante" da identidade visual. */
export const DropdownMenu = Primitivo.Root;
export const DropdownMenuTrigger = Primitivo.Trigger;
export const DropdownMenuGroup = Primitivo.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Primitivo.Content>) {
  return (
    <Primitivo.Portal>
      <Primitivo.Content
        sideOffset={sideOffset}
        className={cn(
          'bg-card text-foreground rounded-inner z-50 min-w-[16rem] p-2 shadow-[0_0_0_1px_var(--border),0_6px_18px_rgb(14_22_38/8%)] outline-none',
          className,
        )}
        {...props}
      />
    </Primitivo.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitivo.Item>) {
  return (
    <Primitivo.Item
      className={cn(
        'rounded-field flex h-10 cursor-pointer items-center gap-2.5 px-3 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-60 data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitivo.Label>) {
  return (
    <Primitivo.Label className={cn('px-2 py-1.5 text-xs font-medium', className)} {...props} />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitivo.Separator>) {
  return <Primitivo.Separator className={cn('bg-border mx-1 my-2 h-px', className)} {...props} />;
}

export const DropdownMenuRadioGroup = Primitivo.RadioGroup;

export function DropdownMenuRadioItem({
  className,
  ...props
}: ComponentProps<typeof Primitivo.RadioItem>) {
  return (
    <Primitivo.RadioItem
      className={cn('cursor-pointer outline-none select-none', className)}
      {...props}
    />
  );
}
