'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitivo } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitivo.Root;
export const DialogTrigger = DialogPrimitivo.Trigger;
export const DialogClose = DialogPrimitivo.Close;

/**
 * Modal do shadcn/ui com os tokens Marinho: card de 22px sobre o --scrim, foco preso e Esc
 * fecha (Radix). Abaixo de 760px ocupa a largura da tela e o rodapé fica fixo embaixo.
 */
export function DialogContent({
  className,
  children,
  comFechar = true,
  ...props
}: ComponentProps<typeof DialogPrimitivo.Content> & { comFechar?: boolean }) {
  return (
    <DialogPrimitivo.Portal>
      <DialogPrimitivo.Overlay className="bg-scrim fixed inset-0 z-50 data-[state=open]:animate-[surgir_200ms_ease-out]" />
      <DialogPrimitivo.Content
        className={cn(
          'bg-card text-foreground rounded-card fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto p-7 shadow-[0_24px_56px_rgb(14_22_38/28%)] outline-none data-[state=open]:animate-[surgir_200ms_ease-out]',
          'max-[760px]:top-auto max-[760px]:bottom-0 max-[760px]:max-h-[calc(100dvh-24px)] max-[760px]:w-full max-[760px]:max-w-none max-[760px]:translate-y-0 max-[760px]:rounded-b-none max-[760px]:p-5 max-[760px]:pb-0',
          className,
        )}
        {...props}
      >
        {children}
        {comFechar && (
          <DialogPrimitivo.Close
            aria-label="Fechar"
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring absolute top-6 right-6 grid size-9 cursor-pointer place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:top-4 max-[760px]:right-4 max-[760px]:size-11"
          >
            <X aria-hidden="true" className="size-4" />
          </DialogPrimitivo.Close>
        )}
      </DialogPrimitivo.Content>
    </DialogPrimitivo.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-12', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitivo.Title>) {
  return (
    <DialogPrimitivo.Title
      className={cn(
        'font-display text-2xl leading-[1.2] font-semibold tracking-[-0.02em]',
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitivo.Description>) {
  return (
    <DialogPrimitivo.Description
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

/** Rodapé com os botões; no celular fica fixo no fim do modal. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2.5 pt-2',
        'max-[760px]:bg-card max-[760px]:sticky max-[760px]:bottom-0 max-[760px]:-mx-5 max-[760px]:mt-auto max-[760px]:px-5 max-[760px]:py-4 max-[760px]:shadow-[0_-1px_0_var(--border)] max-[760px]:[&>*]:h-11 max-[760px]:[&>*]:flex-1',
        className,
      )}
      {...props}
    />
  );
}
