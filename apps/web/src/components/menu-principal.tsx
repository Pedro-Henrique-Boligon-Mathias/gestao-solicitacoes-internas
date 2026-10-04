'use client';

import { Inbox, LayoutDashboard, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Marca } from '@/components/marca';
import type { UsuarioAtual } from '@/features/auth/usuario';
import { cn } from '@/lib/utils';
import { MenuUsuario } from './menu-usuario';

export const ITENS_NAVEGACAO: { href: string; rotulo: string; Icone: LucideIcon }[] = [
  { href: '/dashboard', rotulo: 'Dashboard', Icone: LayoutDashboard },
  { href: '/solicitacoes', rotulo: 'Solicitações', Icone: Inbox },
];

export const itemAtivo = (caminho: string, href: string) =>
  caminho === href || caminho.startsWith(`${href}/`);

/**
 * Menu lateral do desktop: fixo com a altura da tela (sticky), 244px, e o usuário no rodapé.
 * Só a coluna de conteúdo rola. Abaixo de 760px some: a barra de navegação ocupa o lugar dele.
 * O contador da fila é de quem analisa; o solicitante não o vê mesmo se receber (RN-13).
 */
export function MenuPrincipal({
  usuario,
  contador,
}: {
  usuario: UsuarioAtual;
  contador?: ReactNode;
}) {
  const caminho = usePathname();
  const mostrarContador = usuario.cargo !== 'SOLICITANTE';

  return (
    <nav
      aria-label="Principal"
      className={cn(
        'bg-card rounded-card sticky top-4 flex h-[calc(100dvh-32px)] w-[244px] flex-none flex-col gap-1 px-3 pt-4 pb-3',
        'max-[760px]:hidden',
      )}
    >
      <Link
        href="/dashboard"
        className="rounded-field focus-visible:outline-ring px-2 pt-0.5 pb-[18px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Marca />
      </Link>
      <ul className="contents">
        {ITENS_NAVEGACAO.map(({ href, rotulo, Icone }) => {
          const ativo = itemAtivo(caminho, href);
          return (
            <li key={href} className="contents">
              <Link
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'rounded-pill flex h-11 items-center gap-3 px-3.5 text-sm font-medium transition-colors duration-150 outline-none',
                  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
                  ativo
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icone aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
                <span>{rotulo}</span>
                {href === '/solicitacoes' && mostrarContador && contador && (
                  <span className="ml-auto flex">{contador}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto">
        <MenuUsuario usuario={usuario} />
      </div>
    </nav>
  );
}
