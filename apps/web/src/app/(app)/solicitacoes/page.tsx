import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Solicitações' };

export default function PaginaSolicitacoes() {
  return (
    <section className="bg-card rounded-card p-5">
      <h1 className="font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] max-[760px]:text-2xl">
        Solicitações
      </h1>
    </section>
  );
}
