'use client';

import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Popover as PopoverPrimitivo } from 'radix-ui';
import { useState, useSyncExternalStore, type ComponentProps } from 'react';
import { Dialog, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FolhaContent } from '@/components/ui/folha';
import {
  PERIODOS,
  intervaloPeriodo,
  rotuloPeriodo,
  type Periodo,
} from '@/features/dashboard/periodo';
import { cn } from '@/lib/utils';

const CONSULTA_CELULAR = '(max-width: 760px)';

/** Consulta da tela; sem matchMedia (ambientes sem layout), conta como desktop. */
function consultaTela(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(CONSULTA_CELULAR) : null;
}

function assinarTela(aoMudar: () => void): () => void {
  const consulta = consultaTela();
  consulta?.addEventListener('change', aoMudar);
  return () => consulta?.removeEventListener('change', aoMudar);
}

/** Celular (até 760px) abre a folha; no servidor e no desktop, o popover. */
function useCelular(): boolean {
  return useSyncExternalStore(
    assinarTela,
    () => consultaTela()?.matches ?? false,
    () => false,
  );
}

function Gatilho({ periodo, ...props }: { periodo: Periodo } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="bg-card text-foreground hover:bg-muted focus-visible:outline-ring inline-flex h-10 cursor-pointer items-center gap-2 rounded-full pr-3.5 pl-4 text-sm font-medium transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:h-11"
      {...props}
    >
      <CalendarDays aria-hidden="true" className="size-4" />
      <span className="text-muted-foreground text-[13px] font-normal">Período</span>{' '}
      {rotuloPeriodo(periodo)}
      <ChevronDown aria-hidden="true" className="text-muted-foreground size-4" />
    </button>
  );
}

function Opcoes({ atual, aoEscolher }: { atual: Periodo; aoEscolher: (p: Periodo) => void }) {
  const agora = new Date();
  return (
    <div role="radiogroup" aria-label="Período" className="flex flex-col">
      {PERIODOS.map((p) => {
        const marcado = p === atual;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={marcado}
            onClick={() => aoEscolher(p)}
            className={cn(
              'text-foreground hover:bg-muted focus-visible:bg-muted flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-left text-sm outline-none',
              marcado && 'font-semibold',
            )}
          >
            {rotuloPeriodo(p)}
            <small
              className={cn(
                'text-muted-foreground text-xs font-normal',
                p !== 'tudo' && 'font-mono',
              )}
            >
              {intervaloPeriodo(p, agora)}
            </small>
            {marcado && <Check aria-hidden="true" className="ml-auto size-4" />}
          </button>
        );
      })}
    </div>
  );
}

const DICA = 'Vale para todos os indicadores da tela';

/**
 * Seletor de período dos dashboards. A escolha vai para ?periodo= (Tudo tira o parâmetro).
 * Desktop: popover. Celular (até 760px): folha de baixo para cima, com "Fechar".
 */
export function SeletorPeriodo({ periodo }: { periodo: Periodo }) {
  const router = useRouter();
  const busca = useSearchParams();
  const celular = useCelular();
  const [aberto, setAberto] = useState(false);

  function escolher(novo: Periodo) {
    setAberto(false);
    if (novo === periodo) return;
    const params = new URLSearchParams(busca.toString());
    if (novo === 'tudo') params.delete('periodo');
    else params.set('periodo', novo);
    const query = params.toString();
    router.push(query ? `/dashboard?${query}` : '/dashboard', { scroll: false });
  }

  if (celular) {
    return (
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Gatilho periodo={periodo} />
        </DialogTrigger>
        <FolhaContent aria-describedby={undefined}>
          <DialogTitle className="text-lg">Período</DialogTitle>
          <p className="text-muted-foreground mt-1 mb-3 text-sm">{DICA}</p>
          <Opcoes atual={periodo} aoEscolher={escolher} />
        </FolhaContent>
      </Dialog>
    );
  }

  return (
    <PopoverPrimitivo.Root open={aberto} onOpenChange={setAberto}>
      <PopoverPrimitivo.Trigger asChild>
        <Gatilho periodo={periodo} />
      </PopoverPrimitivo.Trigger>
      <PopoverPrimitivo.Portal>
        <PopoverPrimitivo.Content
          aria-label="Período"
          align="end"
          sideOffset={8}
          className="bg-card z-50 w-[280px] rounded-2xl p-1.5 shadow-[0_24px_56px_rgb(14_22_38/18%)] outline-none"
        >
          <p className="text-muted-foreground px-3 pt-1.5 pb-1 text-xs">{DICA}</p>
          <Opcoes atual={periodo} aoEscolher={escolher} />
        </PopoverPrimitivo.Content>
      </PopoverPrimitivo.Portal>
    </PopoverPrimitivo.Root>
  );
}
