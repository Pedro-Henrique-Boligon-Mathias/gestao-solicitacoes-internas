import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { esperarHref, prepararDom } from '@/test/dom';
import { ANA, CARLA, DIEGO, type Usuario } from '@/test/fabricas';
import { BarraNavegacao } from './barra-navegacao';

/*
 * Barra de navegação do celular (Fase 3.5, PR 4A): pílula fixa no rodapé com
 * Dashboard · + (Nova solicitação) · Solicitações (contador só para quem analisa) · avatar "Você".
 * No detalhe (/solicitacoes/[id]) ela não aparece: a barra de ações ocupa o lugar dela.
 * No jsdom não há media query: a barra é testada pelo que renderiza, não por estar visível.
 */

const rota = vi.hoisted(() => ({ atual: '/dashboard' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => rota.atual,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/solicitacoes/actions', () => ({
  criarSolicitacao: vi.fn(),
  editarSolicitacao: vi.fn(),
  excluirSolicitacao: vi.fn(),
  iniciarAnalise: vi.fn(),
  decidirSolicitacao: vi.fn(),
  reabrirSolicitacao: vi.fn(),
  reprocessarIntegracao: vi.fn(),
}));

vi.mock('@/features/auth/actions', () => ({ entrar: vi.fn(), sair: vi.fn() }));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));

/** Contador como o layout monta: o número com o texto "na fila" para o leitor de tela. */
const CONTADOR = <span>7 na fila</span>;

function renderizar(usuario: Usuario = CARLA, caminho = '/dashboard') {
  rota.atual = caminho;
  return render(<BarraNavegacao usuario={usuario} contador={CONTADOR} />);
}

const barra = () => screen.getByRole('navigation', { name: 'Barra de navegação' });
const linkDashboard = () => within(barra()).getByRole('link', { name: 'Dashboard' });
const linkSolicitacoes = () => within(barra()).getByRole('link', { name: /^Solicitações/ });
const botaoMais = () => within(barra()).getByRole('button', { name: 'Nova solicitação' });
const botaoVoce = () => within(barra()).getByRole('button', { name: /Você/ });

const vemAntes = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('ADR-013: barra de navegação do celular', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
    rota.atual = '/dashboard';
  });

  it('ADR-013: itens na ordem Dashboard · Nova solicitação (+) · Solicitações · Você', () => {
    renderizar();

    const itens = [linkDashboard(), botaoMais(), linkSolicitacoes(), botaoVoce()];
    for (let i = 1; i < itens.length; i++) {
      expect(vemAntes(itens[i - 1]!, itens[i]!), `item ${i} depois do item ${i - 1}`).toBe(true);
    }
    esperarHref(linkDashboard(), '/dashboard');
    esperarHref(linkSolicitacoes(), '/solicitacoes');
  });

  it.each([
    ['/dashboard', 'Dashboard'],
    ['/solicitacoes', 'Solicitações'],
  ] as const)('ADR-013: em %s, só o item "%s" leva aria-current="page"', (caminho, ativo) => {
    renderizar(CARLA, caminho);

    const [esteItem, outro] =
      ativo === 'Dashboard'
        ? [linkDashboard(), linkSolicitacoes()]
        : [linkSolicitacoes(), linkDashboard()];
    expect(esteItem).toHaveAttribute('aria-current', 'page');
    expect(outro).not.toHaveAttribute('aria-current');
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

  it('RF-01: o "+" abre o modal de nova solicitação', async () => {
    renderizar(ANA);
    const pessoa = userEvent.setup();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await pessoa.click(botaoMais());

    const modal = await screen.findByRole('dialog', { name: 'Nova solicitação' });
    expect(within(modal).getByRole('button', { name: 'Criar solicitação' })).toBeInTheDocument();
  });

  it('ADR-013: o avatar "Você" abre a folha da conta', async () => {
    renderizar();
    const pessoa = userEvent.setup();

    await pessoa.click(botaoVoce());

    const folha = await screen.findByRole('dialog', { name: 'Carla Mendes' });
    expect(within(folha).getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it.each(['/solicitacoes/c0000000-0000-4000-8000-000000000042', '/solicitacoes/qualquer-id'])(
    'ADR-013: no detalhe (%s) a barra não renderiza',
    (caminho) => {
      renderizar(CARLA, caminho);

      expect(
        screen.queryByRole('navigation', { name: 'Barra de navegação' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Nova solicitação' })).not.toBeInTheDocument();
    },
  );
});
