'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const INTERVALO_MS = 30_000;

function segundosDesde(geradoEm: string | undefined): number {
  if (!geradoEm) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(geradoEm).getTime()) / 1000));
}

/**
 * Polling do dashboard: router.refresh() a cada 30 s só com a aba visível, e uma vez ao voltar
 * para ela. Mostra "atualizado há N s" contado do geradoEm, sem anunciar a cada segundo. Sem
 * geradoEm (resumo indisponível), continua atualizando e só não mostra o rótulo.
 */
export function AtualizacaoAutomatica({
  geradoEm,
  atualizar = true,
  className,
}: {
  geradoEm?: string;
  /**
   * false: só o rótulo. Quando a mesma tela mostra o rótulo em mais de um bloco, só um deles
   * faz o polling, para não chamar router.refresh() duas vezes.
   */
  atualizar?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [segundos, setSegundos] = useState(() => segundosDesde(geradoEm));
  const [geradoAnterior, setGeradoAnterior] = useState(geradoEm);

  // Novo geradoEm (depois do refresh): recomeça a contagem já neste render.
  if (geradoAnterior !== geradoEm) {
    setGeradoAnterior(geradoEm);
    setSegundos(segundosDesde(geradoEm));
  }

  useEffect(() => {
    const relogio = setInterval(() => setSegundos(segundosDesde(geradoEm)), 1000);
    return () => clearInterval(relogio);
  }, [geradoEm]);

  useEffect(() => {
    if (!atualizar) return;
    let temporizador: ReturnType<typeof setInterval> | undefined;
    const iniciar = () => {
      clearInterval(temporizador);
      temporizador = setInterval(() => router.refresh(), INTERVALO_MS);
    };
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        iniciar();
      } else {
        clearInterval(temporizador);
      }
    };
    if (document.visibilityState === 'visible') iniciar();
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      clearInterval(temporizador);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, [router, atualizar]);

  if (!geradoEm) return null;
  return (
    <span
      aria-live="off"
      suppressHydrationWarning
      title="Atualiza sozinho a cada 30 s enquanto a aba está visível"
      className={cn(
        'text-muted-foreground inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap tabular-nums',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--status-aprovada-dot)]" />
      atualizado há {segundos} s
    </span>
  );
}
