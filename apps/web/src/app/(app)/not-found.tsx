import type { Metadata } from 'next';
import { PaginaNaoEncontrada } from '@/components/pagina-nao-encontrada';

export const metadata: Metadata = { title: 'Página não encontrada' };

export default function NaoEncontrada() {
  return <PaginaNaoEncontrada />;
}
