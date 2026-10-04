'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ModalFormularioSolicitacao } from '@/components/solicitacoes/modal-formulario-solicitacao';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { cn } from '@/lib/utils';
import { FolhaConta } from './folha-conta';
import { ITENS_NAVEGACAO, itemAtivo } from './menu-principal';

/** Detalhe de uma solicitação: lá a barra de ações ocupa o rodapé no lugar da navegação. */
const ehDetalhe = (caminho: string) => /^\/solicitacoes\/[^/]+/.test(caminho);

const classeItem = (ativo: boolean) =>
  cn(
    'group relative flex h-14 flex-col items-center justify-center gap-[3px] rounded-full text-[11px] font-medium outline-none transition-colors duration-150',
    'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
    ativo ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
  );

/** Ícone do item: no ativo ganha uma pílula de 44 × 28 em --accent, como no mock. */
const classeIcone = (ativo: boolean) =>
  cn(
    'grid h-7 w-11 place-items-center rounded-full transition-colors duration-150',
    ativo && 'bg-accent text-accent-foreground',
  );

/**
 * Barra de navegação do celular (até 760px): pílula fixa no rodapé, acima da área segura, com
 * Dashboard · + (Nova solicitação) · Solicitações · Você. Some no desktop, onde o menu lateral
 * cumpre o papel, e no detalhe, onde a barra de ações fica no lugar. O contador da fila é de quem
 * analisa; o solicitante não o vê mesmo se receber (RN-13).
 */
export function BarraNavegacao({
  usuario,
  contador,
}: {
  usuario: UsuarioAtual;
  contador?: ReactNode;
}) {
  const caminho = usePathname();
  const [criando, setCriando] = useState(false);
  if (ehDetalhe(caminho)) return null;

  const [dashboard, solicitacoes] = ITENS_NAVEGACAO;
  const mostrarContador = usuario.cargo !== 'SOLICITANTE';

  return (
    <>
      <nav
        aria-label="Barra de navegação"
        className={cn(
          'bg-card fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-1/2 z-40 hidden h-[68px] w-[min(366px,calc(100%-24px))] -translate-x-1/2 grid-cols-4 items-center rounded-full px-1.5',
          'shadow-[0_10px_30px_rgb(14_22_38/18%)] max-[760px]:grid dark:shadow-[0_0_0_1px_var(--border),0_10px_30px_rgb(0_0_0/50%)]',
        )}
      >
        {dashboard && (
          <Link
            href={dashboard.href}
            aria-current={itemAtivo(caminho, dashboard.href) ? 'page' : undefined}
            className={classeItem(itemAtivo(caminho, dashboard.href))}
          >
            <span className={classeIcone(itemAtivo(caminho, dashboard.href))}>
              <dashboard.Icone aria-hidden="true" className="size-[22px]" strokeWidth={1.8} />
            </span>
            <span>{dashboard.rotulo}</span>
          </Link>
        )}

        <button
          type="button"
          aria-label="Nova solicitação"
          onClick={() => setCriando(true)}
          className={cn(
            'bg-primary text-primary-foreground grid size-[60px] cursor-pointer place-items-center justify-self-center rounded-full shadow-[0_0_0_5px_var(--card)] outline-none',
            'focus-visible:outline-ring transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2',
          )}
        >
          <Plus aria-hidden="true" className="size-[26px]" strokeWidth={2.2} />
        </button>

        {solicitacoes && (
          <Link
            href={solicitacoes.href}
            aria-current={itemAtivo(caminho, solicitacoes.href) ? 'page' : undefined}
            className={classeItem(itemAtivo(caminho, solicitacoes.href))}
          >
            <span className={classeIcone(itemAtivo(caminho, solicitacoes.href))}>
              <solicitacoes.Icone aria-hidden="true" className="size-[22px]" strokeWidth={1.8} />
            </span>
            <span>{solicitacoes.rotulo}</span>
            {mostrarContador && contador && (
              <span className="absolute top-1 left-[calc(50%+6px)] flex">{contador}</span>
            )}
          </Link>
        )}

        <FolhaConta usuario={usuario} />
      </nav>
      <ModalFormularioSolicitacao usuario={usuario} aberto={criando} aoMudarAberto={setCriando} />
    </>
  );
}
