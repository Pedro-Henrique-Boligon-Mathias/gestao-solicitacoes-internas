import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ignorarConsoleError, prepararDom } from '@/test/dom';
import { ANA, CARLA, DIEGO, type Usuario } from '@/test/fabricas';
import { FolhaConta } from './folha-conta';
import { ProvedorTema } from './provedor-tema';

/*
 * Folha da conta no celular (Fase 3.5, PR 4A): o avatar "Você" da barra de navegação abre uma
 * folha de baixo para cima (Radix Dialog) com nome, "cargo · área", e-mail, o tema em controle
 * segmentado (Sistema, Claro, Escuro) e Sair. Os casos de tema e Sair repetem os do menu do
 * usuário do desktop (menu-usuario.test.tsx): a folha faz o mesmo que ele.
 */

const acoes = vi.hoisted(() => ({ entrar: vi.fn(), sair: vi.fn() }));
vi.mock('@/features/auth/actions', () => acoes);

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

function renderizar(usuario: Usuario = CARLA) {
  return render(
    <ProvedorTema>
      <FolhaConta usuario={usuario} />
    </ProvedorTema>,
  );
}

const botaoVoce = () => screen.getByRole('button', { name: /Você/ });

/** Abre a folha pelo avatar "Você" e devolve a folha (dialog com o nome do usuário). */
async function abrirFolha(nome = CARLA.nome) {
  const pessoa = userEvent.setup();
  await pessoa.click(botaoVoce());
  const folha = await screen.findByRole('dialog', { name: nome });
  return { pessoa, folha };
}

const html = () => document.documentElement;

const AVISO_SCRIPT_NEXT_THEMES = 'Encountered a script tag while rendering React component';

describe('ADR-013: folha da conta (celular)', () => {
  let restaurarConsole: () => void;

  beforeAll(() => {
    prepararDom();
    restaurarConsole = ignorarConsoleError(AVISO_SCRIPT_NEXT_THEMES);
  });

  afterAll(() => restaurarConsole());

  beforeEach(() => simularSistemaClaro());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    localStorage.clear();
    html().className = '';
    html().removeAttribute('style');
  });

  it('ADR-013: fechada, só o avatar "Você" aparece', () => {
    renderizar();

    expect(botaoVoce()).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ADR-013: o avatar abre a folha com nome, "cargo · área" e e-mail', async () => {
    renderizar();

    const { folha } = await abrirFolha();

    expect(folha).toHaveTextContent('Carla Mendes');
    expect(folha).toHaveTextContent(/Analista\s*·\s*Tecnologia/);
    expect(folha).toHaveTextContent('carla.mendes@demo.test');
  });

  it.each([
    [ANA.nome, ANA, /Solicitante\s*·\s*Financeiro/],
    [DIEGO.nome, DIEGO, /Administrador\s*·\s*Tecnologia/],
  ] as const)(
    'ADR-013: o cargo de %s aparece pelo rótulo, não pelo código',
    async (_nome, usuario, rotulo) => {
      renderizar(usuario);

      const { folha } = await abrirFolha(usuario.nome);

      expect(folha).toHaveTextContent(rotulo);
      expect(folha).not.toHaveTextContent(usuario.cargo);
    },
  );

  it('ADR-013: o tema é um controle segmentado com Sistema, Claro e Escuro; Sistema vem marcado', async () => {
    renderizar();

    const { folha } = await abrirFolha();
    const tema = within(folha).getByRole('radiogroup', { name: 'Tema' });

    const opcoes = within(tema)
      .getAllByRole('radio')
      .map((radio) => radio.textContent?.trim());
    expect(opcoes).toEqual(['Sistema', 'Claro', 'Escuro']);
    await waitFor(() => expect(within(tema).getByRole('radio', { name: 'Sistema' })).toBeChecked());
  });

  it('ADR-013: escolher "Escuro" aplica o tema escuro e a folha continua aberta', async () => {
    renderizar();
    await waitFor(() => expect(html()).toHaveClass('light'));

    const { pessoa, folha } = await abrirFolha();
    await pessoa.click(within(folha).getByRole('radio', { name: 'Escuro' }));

    await waitFor(() => expect(html()).toHaveClass('dark'));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(within(folha).getByRole('radio', { name: 'Escuro' })).toBeChecked();
    expect(screen.getByRole('dialog', { name: 'Carla Mendes' })).toBeInTheDocument();
  });

  it('ADR-004: "Sair" chama a action sair', async () => {
    renderizar();

    const { pessoa, folha } = await abrirFolha();
    await pessoa.click(within(folha).getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(acoes.sair).toHaveBeenCalledTimes(1));
  });

  it('ADR-013: o foco fica preso na folha enquanto ela está aberta', async () => {
    renderizar();

    const { pessoa, folha } = await abrirFolha();

    expect(folha).toContainElement(document.activeElement as HTMLElement);
    for (let i = 0; i < 8; i++) {
      await pessoa.tab();
      expect(folha).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 3; i++) {
      await pessoa.tab({ shift: true });
      expect(folha).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('ADR-013: Esc fecha a folha e o foco volta para o avatar', async () => {
    renderizar();

    const { pessoa } = await abrirFolha();
    await pessoa.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botaoVoce()).toHaveFocus();
  });

  it('ADR-013: o botão "Fechar" fecha a folha', async () => {
    renderizar();

    const { pessoa, folha } = await abrirFolha();
    await pessoa.click(within(folha).getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
