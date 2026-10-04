'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitivo } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Folha do celular: Radix Dialog que sobe do rodapé, com raio de 28px no topo, alça de 40 × 5px e
 * botão de fechar. Fica sobre o --scrim e por cima da barra de navegação (z-50 contra z-40).
 * Prende o foco, fecha com Esc, pelo "Fechar" ou tocando fora, e devolve o foco a quem abriu.
 * Use com `Dialog` e `DialogTrigger` de `ui/dialog`, e com um `DialogTitle` dentro.
 */
export function FolhaContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitivo.Content>) {
  return (
    <DialogPrimitivo.Portal>
      <DialogPrimitivo.Overlay className="bg-scrim fixed inset-0 z-50 data-[state=open]:animate-[surgir_200ms_ease-out]" />
      <DialogPrimitivo.Content
        className={cn(
          'bg-card text-foreground fixed bottom-0 left-1/2 z-50 flex max-h-[calc(100dvh-24px)] w-full max-w-[560px] -translate-x-1/2 flex-col overflow-y-auto rounded-t-[28px] px-5 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[0_24px_56px_rgb(14_22_38/28%)] outline-none data-[state=open]:animate-[subir_240ms_cubic-bezier(0.32,0.72,0,1)]',
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className="bg-border mx-auto mb-[18px] block h-[5px] w-10 flex-none rounded-full"
        />
        {children}
        <DialogPrimitivo.Close
          aria-label="Fechar"
          className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring absolute top-3 right-3 grid size-11 cursor-pointer place-items-center rounded-full transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X aria-hidden="true" className="size-4" />
        </DialogPrimitivo.Close>
      </DialogPrimitivo.Content>
    </DialogPrimitivo.Portal>
  );
}
