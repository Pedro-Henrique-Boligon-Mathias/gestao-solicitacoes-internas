'use client';

import { ChevronUp, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sair } from '@/features/auth/actions';
import { ROTULO_CARGO, type UsuarioAtual } from '@/features/auth/usuario';
import { cn } from '@/lib/utils';
import { Avatar, TEMAS, useMontado } from './conta-comum';

/**
 * Usuário no rodapé do menu lateral (desktop): avatar, nome e "cargo · área" numa linha. Abre para
 * cima com o e-mail, o tema em controle segmentado (Sistema, Claro, Escuro) e Sair.
 */
export function MenuUsuario({ usuario }: { usuario: UsuarioAtual }) {
  const { theme, setTheme } = useTheme();
  const montado = useMontado();
  const [saindo, iniciarSaida] = useTransition();
  const cargo = ROTULO_CARGO[usuario.cargo];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'bg-muted text-foreground flex w-full cursor-pointer items-center gap-2.5 rounded-[16px] p-2 text-left outline-none',
          'focus-visible:outline-ring transition-colors duration-150 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        )}
      >
        <Avatar nome={usuario.nome} className="bg-card dark:bg-accent size-9" />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13.5px] font-semibold">{usuario.nome}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {cargo} · {usuario.area.nome}
          </span>
        </span>
        <ChevronUp aria-hidden="true" className="text-muted-foreground size-4 flex-none" />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-[19rem]">
        <p className="truncate px-2 pt-1 pb-1 font-mono text-[13px]">{usuario.email}</p>
        <DropdownMenuSeparator />

        <DropdownMenuLabel id="rotulo-tema" className="text-muted-foreground font-normal">
          Tema
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-labelledby="rotulo-tema"
          // A opção marcada só aparece depois de montar, para não divergir da renderização do servidor
          value={montado ? (theme ?? 'system') : ''}
          onValueChange={setTheme}
          className="bg-muted rounded-pill mx-1 grid grid-cols-3 gap-1 p-1"
        >
          {TEMAS.map(({ valor, rotulo, Icone }) => (
            <DropdownMenuRadioItem
              key={valor}
              value={valor}
              // Mantém o menu aberto para a pessoa ver o tema mudar
              onSelect={(evento) => evento.preventDefault()}
              className={cn(
                'rounded-pill text-muted-foreground flex h-9 items-center justify-center gap-1.5 text-[13px] font-medium transition-colors duration-150',
                'data-[highlighted]:text-foreground data-[highlighted]:outline-ring data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2',
                'data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-[0_1px_2px_rgb(14_22_38/12%)]',
                'dark:data-[state=checked]:bg-accent dark:data-[state=checked]:text-accent-foreground dark:data-[state=checked]:shadow-none',
              )}
            >
              <Icone aria-hidden="true" className="size-3.5" />
              {rotulo}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <p className="text-muted-foreground px-2 pt-2 text-xs">
          Sistema segue a preferência do aparelho.
        </p>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={saindo}
          onSelect={() => {
            iniciarSaida(async () => {
              await sair();
            });
          }}
        >
          <LogOut aria-hidden="true" />
          {saindo ? 'Saindo…' : 'Sair'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
