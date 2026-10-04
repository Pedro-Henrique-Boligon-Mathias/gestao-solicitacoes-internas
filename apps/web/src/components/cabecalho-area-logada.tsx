'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabeçalho da área logada com a saudação, fora do dashboard (lá a saudação vai para a barra do
 * próprio dashboard). No celular some: o topo fica com o título da página ou com o "Voltar".
 */
export function CabecalhoAreaLogada({ children }: { children: ReactNode }) {
  const caminho = usePathname();
  // No dashboard, a saudação fica na barra do próprio dashboard, junto da data e das ações
  if (caminho === '/dashboard') return null;
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-1 pt-1.5',
        'max-[760px]:hidden',
      )}
    >
      {children}
    </header>
  );
}
