import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** 404: solicitação inexistente, invisível para o usuário ou endereço errado. */
export function PaginaNaoEncontrada() {
  return (
    <section className="bg-card rounded-card flex flex-col items-center gap-3 px-5 py-14 text-center">
      <p
        aria-hidden="true"
        className="font-display text-[84px] leading-[0.95] font-semibold tracking-[-0.035em]"
      >
        404
      </p>
      <h1 className="font-display text-xl font-semibold tracking-[-0.02em]">
        Página não encontrada
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Esta solicitação não existe ou você não tem acesso a ela.
      </p>
      <Button variant="soft" asChild className="mt-1">
        <Link href="/dashboard">Voltar ao dashboard</Link>
      </Button>
    </section>
  );
}
