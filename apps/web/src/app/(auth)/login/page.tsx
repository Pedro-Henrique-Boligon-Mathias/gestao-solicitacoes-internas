import type { Metadata } from 'next';
import { Marca } from '@/components/marca';
import { lerModoDemonstracao, USUARIOS_DEMONSTRACAO } from '@/features/auth/demonstracao';
import { ProvedorModoDemonstracao } from './campos-login';
import { CardDemonstracao } from './card-demonstracao';
import { FormularioLogin } from './formulario-login';

export const metadata: Metadata = { title: 'Entrar' };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  // Lido a cada requisição: desligado, nem o card nem a senha do seed vão para o HTML
  const demonstracao = lerModoDemonstracao();

  const cardLogin = (
    <section
      aria-labelledby="titulo-login"
      className="bg-card rounded-card flex w-full flex-col gap-6 p-7 sm:p-10"
    >
      <Marca />
      <div className="flex flex-col gap-1.5">
        <h1
          id="titulo-login"
          className="font-display text-[32px] leading-[1.1] font-semibold tracking-[-0.035em]"
        >
          Entrar
        </h1>
        <p className="text-muted-foreground text-sm">Use o e-mail e a senha da sua conta.</p>
      </div>
      <FormularioLogin next={typeof next === 'string' ? next : ''} />
      <p className="text-muted-foreground text-[12.5px]">
        Você continua conectado por até 7 dias sem uso.
      </p>
    </section>
  );

  if (!demonstracao) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-2.5 py-10 sm:px-4">
        <div className="w-full max-w-[32rem]">{cardLogin}</div>
      </main>
    );
  }

  // Desktop: formulário à esquerda e demonstração à direita; celular: empilhados, formulário primeiro
  return (
    <main className="flex min-h-dvh items-center justify-center px-2.5 py-10 sm:px-4">
      <ProvedorModoDemonstracao senha={demonstracao.senha}>
        <div className="grid w-full max-w-[980px] grid-cols-[minmax(0,32fr)_minmax(0,28fr)] gap-4 max-[760px]:max-w-[32rem] max-[760px]:grid-cols-1">
          {cardLogin}
          <CardDemonstracao usuarios={USUARIOS_DEMONSTRACAO} />
        </div>
      </ProvedorModoDemonstracao>
    </main>
  );
}
