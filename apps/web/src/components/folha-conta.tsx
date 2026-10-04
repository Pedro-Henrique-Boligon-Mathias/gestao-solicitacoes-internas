'use client';

import { LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { RadioGroup } from 'radix-ui';
import { useTransition } from 'react';
import { Dialog, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FolhaContent } from '@/components/ui/folha';
import { sair } from '@/features/auth/actions';
import { ROTULO_CARGO, type UsuarioAtual } from '@/features/auth/usuario';
import { cn } from '@/lib/utils';
import { Avatar, TEMAS, useMontado } from './conta-comum';

/**
 * Conta no celular: o avatar "Você" da barra de navegação abre uma folha com nome, "cargo · área",
 * e-mail, o tema em controle segmentado e Sair. Equivale ao menu do usuário do desktop.
 */
export function FolhaConta({ usuario }: { usuario: UsuarioAtual }) {
  const { theme, setTheme } = useTheme();
  const montado = useMontado();
  const [saindo, iniciarSaida] = useTransition();
  const cargo = ROTULO_CARGO[usuario.cargo];

  return (
    <Dialog>
      <DialogTrigger
        // O texto visível é "Você"; o nome falado diz de quem é a conta
        aria-label={`Você · conta de ${usuario.nome}`}
        className={cn(
          'group text-muted-foreground flex h-14 cursor-pointer flex-col items-center justify-center gap-[3px] rounded-full text-[11px] font-medium outline-none',
          'focus-visible:outline-ring transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2',
          'data-[state=open]:text-foreground',
        )}
      >
        <Avatar
          nome={usuario.nome}
          className="size-7 text-[11px] group-data-[state=open]:shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--primary)]"
        />
        <span>Você</span>
      </DialogTrigger>

      <FolhaContent>
        <div className="flex items-center gap-3 pr-12">
          <Avatar nome={usuario.nome} className="size-12 text-sm" />
          <div className="min-w-0">
            <DialogTitle className="font-display truncate text-lg font-semibold tracking-[-0.02em]">
              {usuario.nome}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground truncate text-sm">
              {cargo} · {usuario.area.nome}
            </DialogDescription>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 truncate font-mono text-[13px]">{usuario.email}</p>

        <div className="border-border mt-5 border-t pt-4">
          <p id="folha-rotulo-tema" className="text-muted-foreground mb-2 text-sm">
            Tema
          </p>
          <RadioGroup.Root
            aria-labelledby="folha-rotulo-tema"
            // A opção marcada só aparece depois de montar, para não divergir da renderização do servidor
            value={montado ? (theme ?? 'system') : ''}
            onValueChange={setTheme}
            className="bg-muted rounded-pill grid grid-cols-3 gap-1 p-1"
          >
            {TEMAS.map(({ valor, rotulo, Icone }) => (
              <RadioGroup.Item
                key={valor}
                value={valor}
                className={cn(
                  'rounded-pill text-muted-foreground flex h-11 cursor-pointer items-center justify-center gap-1.5 text-sm font-medium outline-none transition-colors duration-150',
                  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2',
                  'data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-[0_1px_2px_rgb(14_22_38/12%)]',
                  'dark:data-[state=checked]:bg-accent dark:data-[state=checked]:text-accent-foreground dark:data-[state=checked]:shadow-none',
                )}
              >
                <Icone aria-hidden="true" className="size-4" />
                {rotulo}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
          <p className="text-muted-foreground pt-2 text-xs">
            Sistema segue a preferência do aparelho.
          </p>
        </div>

        <div className="border-border mt-4 border-t pt-3">
          <button
            type="button"
            disabled={saindo}
            onClick={() => {
              iniciarSaida(async () => {
                await sair();
              });
            }}
            className={cn(
              'rounded-field hover:bg-muted flex h-12 w-full cursor-pointer items-center gap-3 px-3 text-left text-sm font-medium outline-none transition-colors duration-150',
              'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60',
            )}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {saindo ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      </FolhaContent>
    </Dialog>
  );
}
