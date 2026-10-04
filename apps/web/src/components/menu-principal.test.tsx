import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepararDom } from '@/test/dom';
import { ANA, CARLA, DIEGO, type Usuario } from '@/test/fabricas';
import { MenuPrincipal } from './menu-principal';

/*
 * Menu lateral do desktop (Fase 3.5, PR 4A): Dashboard e Solicitações em cima e o usuário no
 * rodapé do menu (o MenuUsuario sai do cabeçalho). O contador da fila só aparece para quem
 * analisa (RN-13: o solicitante só vê as próprias, então a fila não é dele).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/auth/actions', () => ({ entrar: vi.fn(), sair: vi.fn() }));

/** Contador como o layout monta: o número com o texto "na fila" para o leitor de tela. */
const CONTADOR = <span>7 na fila</span>;

function renderizar(usuario: Usuario) {
  return render(<MenuPrincipal usuario={usuario} contador={CONTADOR} />);
}

const menu = () => screen.getByRole('navigation', { name: 'Principal' });

/** Item "Solicitações" do menu (a marca no topo também se chama "Solicitações", mas leva ao dashboard). */
function linkSolicitacoes(): HTMLElement {
  const item = within(menu())
    .getAllByRole('link', { name: /^Solicitações/ })
    .find((link) => link.getAttribute('href') === '/solicitacoes');
  expect(item, 'item Solicitações do menu').toBeTruthy();
  return item!;
}

describe('ADR-013: menu lateral (desktop)', () => {
  beforeAll(prepararDom);

  afterEach(() => vi.clearAllMocks());

  it('ADR-013: o usuário fica no rodapé do menu, depois de Dashboard e Solicitações', () => {
    renderizar(CARLA);

    const botaoUsuario = within(menu()).getByRole('button', { name: /Carla Mendes/ });
    const solicitacoes = linkSolicitacoes();
    expect(botaoUsuario).toHaveTextContent('Carla Mendes');
    expect(botaoUsuario).toHaveTextContent(/Analista\s*·\s*Tecnologia/);
    // O botão do usuário vem depois do último item de navegação (rodapé do menu)
    expect(
      solicitacoes.compareDocumentPosition(botaoUsuario) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('ADR-013: o usuário do rodapé abre o e-mail, o tema (Sistema, Claro, Escuro) e Sair', async () => {
    renderizar(CARLA);
    const pessoa = userEvent.setup();

    await pessoa.click(within(menu()).getByRole('button', { name: /Carla Mendes/ }));

    expect(await screen.findByText('carla.mendes@demo.test')).toBeInTheDocument();
    for (const opcao of ['Sistema', 'Claro', 'Escuro', 'Sair']) {
      expect(screen.getByText(opcao)).toBeInTheDocument();
    }
  });

  it.each([
    ['ANALISTA', CARLA],
    ['ADMIN', DIEGO],
  ] as const)('RN-13: %s vê o contador da fila em Solicitações', (_cargo, usuario) => {
    renderizar(usuario);

    expect(linkSolicitacoes()).toHaveTextContent(/7\s*na fila/);
  });

  it('RN-13: o solicitante não vê o contador da fila, mesmo que o receba', () => {
    renderizar(ANA);

    expect(linkSolicitacoes()).not.toHaveTextContent(/na fila/);
    expect(screen.queryByText(/na fila/)).not.toBeInTheDocument();
  });
});
