'use client';

import { useTheme } from 'next-themes';
import { Toaster } from 'sonner';

/**
 * Toasts no canto inferior direito, com os tokens do tema. Sucesso some em 5 s; os erros
 * são disparados com duração infinita e ficam até a pessoa fechar.
 */
export function Avisos() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      duration={5000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            '!bg-card !text-foreground !rounded-inner !border-0 !shadow-[0_0_0_1px_var(--border),0_6px_18px_rgb(14_22_38/8%)] !font-sans',
          success: '[&_[data-icon]]:!text-status-aprovada-dot',
          error: '[&_[data-icon]]:!text-destructive',
          closeButton: '!bg-card !text-muted-foreground !border-border',
        },
      }}
    />
  );
}
