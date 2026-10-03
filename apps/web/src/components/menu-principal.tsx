'use client';

import { Inbox, LayoutDashboard, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Marca } from '@/components/marca';
import { cn } from '@/lib/utils';

const ITENS: { href: string; rotulo: string; Icone: LucideIcon }[] = [
  { href: '/dashboard', rotulo: 'Dashboard', Icone: LayoutDashboard },
  { href: '/solicitacoes', rotulo: 'Solicitações', Icone: Inbox },
];

/** Menu lateral; abaixo de 760px vira uma pílula horizontal no topo. */
export function MenuPrincipal() {
  const caminho = usePathname();

  return (
    <nav
      aria-label="Principal"
      className={cn(
        'bg-card rounded-card flex flex-[1_1_200px] flex-col gap-1 px-3.5 py-[18px]',
        'max-[760px]:rounded-pill max-[760px]:basis-full max-[760px]:flex-row max-[760px]:items-center max-[760px]:gap-0.5 max-[760px]:p-1.5',
      )}
    >
      <Link
        href="/dashboard"
        className="rounded-field focus-visible:outline-ring px-2 pt-1 pb-[18px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 max-[760px]:px-0.5 max-[760px]:py-0"
      >
        <Marca className="max-[760px]:[&>span:last-child]:sr-only" />
      </Link>
      <ul className="contents">
        {ITENS.map(({ href, rotulo, Icone }) => {
          const ativo = caminho === href || caminho.startsWith(`${href}/`);
          return (
            <li key={href} className="contents">
              <Link
                href={href}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'rounded-pill flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors duration-150 outline-none',
                  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
                  ativo
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  'max-[760px]:gap-2 max-[760px]:px-3 max-[760px]:py-[9px] max-[760px]:text-[13px]',
                  !ativo && 'max-[760px]:px-2.5',
                )}
              >
                <Icone aria-hidden="true" className="size-[18px]" strokeWidth={1.8} />
                {/* No celular, os itens inativos mostram só o ícone */}
                <span className={cn(!ativo && 'max-[760px]:sr-only')}>{rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
