import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProvedorTema } from './provedor-tema';

/** O jsdom não tem matchMedia: simula a preferência de cor do sistema operacional. */
function simularSistema(escuro: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((consulta: string) => ({
      matches: escuro && consulta.includes('prefers-color-scheme: dark'),
      media: consulta,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const html = () => document.documentElement;

describe('ADR-013: ProvedorTema', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    html().className = '';
    html().removeAttribute('style');
  });

  it('ADR-013: renderiza o conteúdo envolvido', () => {
    simularSistema(false);
    render(
      <ProvedorTema>
        <p>Conteúdo da página</p>
      </ProvedorTema>,
    );
    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
  });

  it('ADR-013: segue o sistema escuro aplicando a classe dark no <html>', async () => {
    simularSistema(true);
    render(<ProvedorTema>conteúdo</ProvedorTema>);
    await waitFor(() => {
      expect(html()).toHaveClass('dark');
    });
  });

  it('ADR-013: segue o sistema claro sem a classe dark', async () => {
    simularSistema(false);
    render(<ProvedorTema>conteúdo</ProvedorTema>);
    await waitFor(() => {
      expect(html()).toHaveClass('light');
    });
    expect(html()).not.toHaveClass('dark');
  });

  it('ADR-013: respeita a escolha salva (localStorage.theme = light) mesmo com o sistema escuro', async () => {
    localStorage.setItem('theme', 'light');
    simularSistema(true);
    render(<ProvedorTema>conteúdo</ProvedorTema>);
    await waitFor(() => {
      expect(html()).toHaveClass('light');
    });
    expect(html()).not.toHaveClass('dark');
  });
});
