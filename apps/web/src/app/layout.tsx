import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Gestão de Solicitações Internas',
    template: '%s · Gestão de Solicitações Internas',
  },
  description: 'Registro, análise e acompanhamento de solicitações internas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans">{children}</body>
    </html>
  );
}
