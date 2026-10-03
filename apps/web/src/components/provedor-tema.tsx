'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/** Tema claro/escuro pela classe `.dark` no <html>, seguindo o aparelho por padrão. */
export function ProvedorTema({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
