'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabeçalho da área logada com a saudação. No celular, só o dashboard o mostra: nas outras telas o
 * topo fica com o título da própria página (lista) ou com o "Voltar" (detalhe), como no redesenho.
 */
export function CabecalhoAreaLogada({ children }: { children: ReactNode }) {
  const caminho = usePathname();
  const noDashboard = caminho === '/dashboard';
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-1 pt-1.5',
        !noDashboard && 'max-[760px]:hidden',
      )}
    >
      {children}
    </header>
  );
}
