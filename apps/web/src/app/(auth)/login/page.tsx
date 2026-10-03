import type { Metadata } from 'next';
import { Marca } from '@/components/marca';
import { FormularioLogin } from './formulario-login';

export const metadata: Metadata = { title: 'Entrar' };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-2.5 py-10 sm:px-4">
      <section
        aria-labelledby="titulo-login"
        className="bg-card rounded-card flex w-full max-w-[32rem] flex-col gap-6 p-7 sm:p-10"
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
    </main>
  );
}
