import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { MenuPrincipal } from '@/components/menu-principal';
import { MenuUsuario } from '@/components/menu-usuario';
import { obterUsuarioAtual } from '@/lib/api/autenticado';

/** Saudação pela hora de Brasília. */
function saudacao(agora = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'America/Sao_Paulo',
    }).format(agora),
  );
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Área logada: menu lateral, cabeçalho com o usuário e o conteúdo da página. */
export default async function LayoutAreaLogada({ children }: { children: ReactNode }) {
  const resultado = await obterUsuarioAtual();
  // Sessão recusada pela API com cookies ainda presentes: a rota limpa os cookies e leva ao login
  if (!resultado.autenticado) redirect('/api/sessao/encerrar');
  const { usuario } = resultado;
  const primeiroNome = usuario.nome.split(' ')[0];

  return (
    <div className="flex min-h-dvh flex-wrap content-start items-stretch gap-4 p-4 max-[760px]:gap-3 max-[760px]:p-2.5">
      <MenuPrincipal />
      {/* Base de 512px: com o menu de 200px e as margens, a quebra cai perto dos 760px */}
      <div className="flex min-w-0 flex-[999_1_512px] flex-col gap-4 max-[760px]:gap-3">
        <header className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1.5">
          <p className="font-display text-2xl leading-tight font-semibold tracking-[-0.03em]">
            {saudacao()}, <span className="text-muted-foreground font-normal">{primeiroNome}</span>
          </p>
          <MenuUsuario usuario={usuario} />
        </header>
        <main className="flex min-w-0 flex-col gap-4">{children}</main>
      </div>
    </div>
  );
}
