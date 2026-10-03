import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { Avisos } from '@/components/avisos';
import { ProvedorTema } from '@/components/provedor-tema';
import { cn } from '@/lib/utils';
import './globals.css';

// Cada fonte vira uma variável CSS lida pelos tokens --font-display, --font-sans e --font-mono
const fonteDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--fonte-display',
});
const fonteSans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fonte-sans',
});
const fonteMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--fonte-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Gestão de Solicitações Internas',
    template: '%s · Gestão de Solicitações Internas',
  },
  description: 'Registro, análise e acompanhamento de solicitações internas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // O next-themes ajusta a classe do <html> antes da hidratação
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={cn(fonteDisplay.variable, fonteSans.variable, fonteMono.variable)}
    >
      <body>
        <ProvedorTema>
          {children}
          <Avisos />
        </ProvedorTema>
      </body>
    </html>
  );
}
