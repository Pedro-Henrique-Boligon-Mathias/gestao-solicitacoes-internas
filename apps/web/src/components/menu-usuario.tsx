'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore, useTransition } from 'react';
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

const TEMAS = [
  { valor: 'system', rotulo: 'Sistema' },
  { valor: 'light', rotulo: 'Claro' },
  { valor: 'dark', rotulo: 'Escuro' },
] as const;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '';
  return `${primeira}${ultima}`.toUpperCase();
}

/** true só depois de hidratar: antes disso o tema salvo no navegador ainda é desconhecido. */
function useMontado(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

function Avatar({ nome }: { nome: string }) {
  return (
    <span
      aria-hidden="true"
      className="bg-accent text-accent-foreground grid size-8 flex-none place-items-center rounded-full text-xs font-semibold"
    >
      {iniciais(nome)}
    </span>
  );
}

/** Botão do usuário no cabeçalho: abre o menu com a troca de tema e o Sair. */
export function MenuUsuario({ usuario }: { usuario: UsuarioAtual }) {
  const { theme, setTheme } = useTheme();
  const montado = useMontado();
  const [saindo, iniciarSaida] = useTransition();
  const cargo = ROTULO_CARGO[usuario.cargo];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'bg-card text-foreground rounded-pill flex cursor-pointer items-center gap-2.5 py-1 pr-3 pl-1 text-left text-[13px] outline-none',
          'focus-visible:outline-ring transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2',
        )}
      >
        <Avatar nome={usuario.nome} />
        {/* No celular só o avatar aparece; o nome continua no nome acessível do botão */}
        <span className="leading-tight max-[760px]:sr-only">
          <span className="block font-medium">{usuario.nome}</span>
          <span className="text-muted-foreground text-xs">
            {cargo} · {usuario.area.nome}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[19rem]">
        <div className="flex items-center gap-2.5 px-2 pt-1 pb-2">
          <Avatar nome={usuario.nome} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{usuario.nome}</p>
            <p className="text-muted-foreground truncate text-xs">
              {cargo} · {usuario.area.nome}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />

        <DropdownMenuLabel id="rotulo-tema">Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          aria-labelledby="rotulo-tema"
          // A opção marcada só aparece depois de montar, para não divergir da renderização do servidor
          value={montado ? (theme ?? 'system') : ''}
          onValueChange={setTheme}
          className="bg-muted rounded-pill mx-1 grid grid-cols-3 gap-1 p-1"
        >
          {TEMAS.map((tema) => (
            <DropdownMenuRadioItem
              key={tema.valor}
              value={tema.valor}
              // Mantém o menu aberto para a pessoa ver o tema mudar
              onSelect={(evento) => evento.preventDefault()}
              className={cn(
                'rounded-pill text-muted-foreground flex h-8 items-center justify-center text-[13px] font-medium transition-colors duration-150',
                'data-[highlighted]:text-foreground data-[highlighted]:outline-ring data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2',
                'data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-[0_1px_2px_rgb(14_22_38/12%)]',
              )}
            >
              {tema.rotulo}
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
