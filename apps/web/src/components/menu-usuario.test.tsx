import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuUsuario } from './menu-usuario';
import { ProvedorTema } from './provedor-tema';

const acoes = vi.hoisted(() => ({ entrar: vi.fn(), sair: vi.fn() }));

vi.mock('@/features/auth/actions', () => acoes);

type Cargo = 'SOLICITANTE' | 'ANALISTA' | 'ADMIN';

function usuario(cargo: Cargo = 'ANALISTA') {
  return {
    id: 'u1',
    nome: 'Carla Mendes',
    email: 'carla.mendes@demo.test',
    cargo,
    area: { id: 'a1', nome: 'Tecnologia' },
  };
}

/** O jsdom não tem matchMedia: simula o sistema operacional no tema claro. */
function simularSistemaClaro(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((consulta: string) => ({
      matches: false,
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

function renderizar(cargo: Cargo = 'ANALISTA') {
  return render(
    <ProvedorTema>
      <MenuUsuario usuario={usuario(cargo)} />
    </ProvedorTema>,
  );
}

/** Abre o menu pelo botão do usuário (o que tem o nome dele). */
async function abrirMenu() {
  const pessoa = userEvent.setup();
  await pessoa.click(screen.getByRole('button', { name: /Carla Mendes/ }));
  return pessoa;
}

const html = () => document.documentElement;

describe('Menu do usuário', () => {
  beforeAll(() => {
    // APIs de layout que o jsdom não implementa e menus acessíveis costumam usar
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  beforeEach(() => {
    simularSistemaClaro();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
    html().className = '';
    html().removeAttribute('style');
  });

  it('ADR-005: o botão do usuário mostra nome, "Analista" e a área', () => {
    renderizar('ANALISTA');

    const botao = screen.getByRole('button', { name: /Carla Mendes/ });
    expect(botao).toHaveTextContent('Carla Mendes');
    expect(botao).toHaveTextContent('Analista');
    expect(botao).toHaveTextContent('Tecnologia');
    expect(botao).not.toHaveTextContent('ANALISTA');
  });

  it.each([
    ['SOLICITANTE', 'Solicitante'],
    ['ADMIN', 'Administrador'],
  ] as const)('ADR-005: o cargo %s aparece como "%s"', (cargo, rotulo) => {
    renderizar(cargo);
    expect(screen.getByRole('button', { name: /Carla Mendes/ })).toHaveTextContent(rotulo);
  });

  it('ADR-013: o menu oferece Sistema, Claro e Escuro, além de Sair', async () => {
    renderizar();

    await abrirMenu();

    for (const opcao of ['Sistema', 'Claro', 'Escuro', 'Sair']) {
      expect(await screen.findByText(opcao)).toBeInTheDocument();
    }
  });

  it('ADR-013: escolher "Escuro" aplica o tema escuro', async () => {
    renderizar();
    await waitFor(() => expect(html()).toHaveClass('light'));

    const pessoa = await abrirMenu();
    await pessoa.click(await screen.findByText('Escuro'));

    await waitFor(() => expect(html()).toHaveClass('dark'));
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('ADR-004: "Sair" chama a action sair', async () => {
    renderizar();

    const pessoa = await abrirMenu();
    await pessoa.click(await screen.findByText('Sair'));

    await waitFor(() => expect(acoes.sair).toHaveBeenCalledTimes(1));
  });
});
