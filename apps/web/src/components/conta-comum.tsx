'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

/**
 * Peças da conta usadas pelo menu do usuário (desktop) e pela folha da conta (celular): as opções
 * de tema, o avatar com as iniciais e o aviso de montagem para o tema salvo no navegador.
 */

export const TEMAS: { valor: 'system' | 'light' | 'dark'; rotulo: string; Icone: LucideIcon }[] = [
  { valor: 'system', rotulo: 'Sistema', Icone: Monitor },
  { valor: 'light', rotulo: 'Claro', Icone: Sun },
  { valor: 'dark', rotulo: 'Escuro', Icone: Moon },
];

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '';
  return `${primeira}${ultima}`.toUpperCase();
}

/** true só depois de hidratar: antes disso o tema salvo no navegador ainda é desconhecido. */
export function useMontado(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-accent text-accent-foreground grid size-8 flex-none place-items-center rounded-full text-xs font-semibold',
        className,
      )}
    >
      {iniciais(nome)}
    </span>
  );
}
