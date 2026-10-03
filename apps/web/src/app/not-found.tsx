import type { Metadata } from 'next';
import { PaginaNaoEncontrada } from '@/components/pagina-nao-encontrada';

export const metadata: Metadata = { title: 'Página não encontrada' };

/** Endereço fora das rotas conhecidas. */
export default function NaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center p-4">
      <PaginaNaoEncontrada />
    </main>
  );
}
