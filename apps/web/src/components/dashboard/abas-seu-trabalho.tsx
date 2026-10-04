'use client';

import { Tabs } from 'radix-ui';
import type { ReactNode } from 'react';

type Aba = 'minhas' | 'fila';

const classeAba =
  'flex h-11 flex-1 items-center justify-center gap-2 rounded-pill text-sm font-medium text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=active]:bg-primary data-[state=active]:text-primary-foreground';

/*
 * No celular (<760px) as duas listas do analista viram abas. No desktop a barra de abas some e
 * os dois painéis (forceMount) ficam lado a lado, 7fr/5fr como no redesenho.
 */
const classePainel =
  'flex min-w-0 tela:min-h-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=inactive]:hidden min-[761px]:data-[state=inactive]:flex [&>*]:flex-1';

/**
 * "Seu trabalho" do analista: abas Radix "Minhas análises N | Fila N" no celular. Os totais são os
 * meta.total das duas consultas. Começa em Minhas análises se houver itens; senão, na Fila.
 */
export function AbasSeuTrabalho({
  totalMinhasAnalises,
  totalFila,
  minhasAnalises,
  fila,
}: {
  totalMinhasAnalises: number;
  totalFila: number;
  minhasAnalises: ReactNode;
  fila: ReactNode;
}) {
  const inicial: Aba = totalMinhasAnalises > 0 ? 'minhas' : 'fila';
  return (
    <Tabs.Root defaultValue={inicial} className="flex flex-col gap-3 tela:min-h-0 tela:flex-1">
      <Tabs.List
        aria-label="Seu trabalho"
        className="flex gap-1 rounded-pill bg-card p-1 shadow-[inset_0_0_0_1px_var(--border)] min-[761px]:hidden"
      >
        <Tabs.Trigger value="minhas" className={classeAba}>
          Minhas análises <span className="font-mono text-xs">{totalMinhasAnalises}</span>
        </Tabs.Trigger>
        <Tabs.Trigger value="fila" className={classeAba}>
          Fila <span className="font-mono text-xs">{totalFila}</span>
        </Tabs.Trigger>
      </Tabs.List>
      <div className="flex flex-col gap-4 min-[761px]:grid min-[761px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] tela:min-h-0 tela:flex-1">
        <Tabs.Content value="minhas" forceMount className={classePainel}>
          {minhasAnalises}
        </Tabs.Content>
        <Tabs.Content value="fila" forceMount className={classePainel}>
          {fila}
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}
