import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { esperarHref, mensagens, prepararDom } from '@/test/dom';
import {
  FALHA_CRM,
  integracaoComFalha,
  solicitacao,
  type IntegracaoComFalha,
} from '@/test/fabricas';
import { IntegracoesComFalha } from './integracoes-com-falha';

/*
 * "Integrações com falha" do painel de gestão (Fase 3.5, PR 4C; ADR-010, RN-14/RN-17): eventos
 * que esgotaram as tentativas automáticas. Cada linha tem código, título, solicitante · área, o
 * evento com a tentativa, o último erro como chegou do sistema externo (em mono), quando foi a
 * última tentativa e "Reprocessar", que usa a action que já existe e, no sucesso, recarrega a
 * página (router.refresh). O bloco tem id="integracoes-com-falha" (destino do botão da Visão geral).
 */

const roteador = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => roteador,
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

const acoes = vi.hoisted(() => ({ reprocessarIntegracao: vi.fn() }));
vi.mock('@/features/solicitacoes/actions', () => acoes);

const avisos = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: avisos.toast, Toaster: () => null }));

/** 04/10/2026 09:42 em São Paulo. */
const AGORA = new Date('2026-10-04T12:42:00.000Z');
const SOL_24 = integracaoComFalha();

function renderizar(integracoes: IntegracaoComFalha[] = [SOL_24, FALHA_CRM]) {
  const { container } = render(<IntegracoesComFalha integracoes={integracoes} />);
  const titulo = screen.getByRole('heading', { name: /^Integrações com falha/ });
  const secao = (titulo.closest('section') ?? titulo.parentElement)!;
  return { container, secao };
}

/** Linha da integração: o menor elemento que tem o código e um botão "Reprocessar". */
function linhaDe(secao: HTMLElement, codigo: string): HTMLElement {
  const botoes = within(secao).getAllByRole('button', { name: /^Reprocessar/ });
  const botao = botoes.find((b) => b.closest('li, tr, article')?.textContent?.includes(codigo));
  expect(botao, `linha da ${codigo}`).toBeTruthy();
  return botao!.closest('li, tr, article') as HTMLElement;
}

beforeAll(() => {
  prepararDom();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ADR-010/RN-14: Integrações com falha', () => {
  it('ADR-010: o título traz a quantidade e o bloco é o destino #integracoes-com-falha', () => {
    const { container } = renderizar();

    expect(screen.getByRole('heading', { name: /^Integrações com falha\s*2/ })).toBeTruthy();
    expect(container.querySelector('#integracoes-com-falha')).not.toBeNull();
  });

  it('ADR-010: cada linha tem código, título, solicitante · área, evento e tentativa', () => {
    const { secao } = renderizar();

    const linha = linhaDe(secao, 'SOL-000024');
    expect(linha).toHaveTextContent('Liberação de acesso ao internet banking da empresa');
    expect(linha).toHaveTextContent('Ana Souza · Financeiro');
    expect(linha).toHaveTextContent('Aprovação');
    expect(linha).toHaveTextContent(/tentativa 5 de 5|5 de 5/);
    expect(linha).toHaveTextContent('04/10 08:15');
    expect(linhaDe(secao, 'SOL-000020')).toHaveTextContent('Camila Rocha · Comercial');
  });

  it('ADR-010: o código leva ao detalhe da solicitação', () => {
    const { secao } = renderizar();

    esperarHref(
      within(secao).getByRole('link', { name: /SOL-000024/ }),
      `/solicitacoes/${SOL_24.solicitacao.id}`,
    );
  });

  it('ADR-010: evento de reabertura aparece como "Reabertura"', () => {
    const { secao } = renderizar([integracaoComFalha({ tipo: 'SolicitacaoReaberta' })]);

    expect(linhaDe(secao, 'SOL-000024')).toHaveTextContent('Reabertura');
  });

  it('ADR-010: o último erro aparece como chegou, em fonte mono', () => {
    const { secao } = renderizar();

    const erro = within(secao).getByText('Sistema externo respondeu 503');
    expect(erro.closest('code, samp, .font-mono')).not.toBeNull();
    expect(within(secao).getByText('Tempo de resposta esgotado (10s)')).toBeInTheDocument();
  });

  it('ADR-010: "Reprocessar" chama a action com o id da solicitação e, no sucesso, faz refresh', async () => {
    acoes.reprocessarIntegracao.mockResolvedValue({
      ok: true,
      solicitacao: solicitacao({ id: SOL_24.solicitacao.id }),
    });
    const { secao } = renderizar();
    const pessoa = userEvent.setup();

    await pessoa.click(
      within(linhaDe(secao, 'SOL-000024')).getByRole('button', { name: /^Reprocessar/ }),
    );

    await waitFor(() =>
      expect(acoes.reprocessarIntegracao).toHaveBeenCalledWith(SOL_24.solicitacao.id),
    );
    await waitFor(() => expect(roteador.refresh).toHaveBeenCalled());
    expect(avisos.toast.error).not.toHaveBeenCalled();
  });

  it('ADR-010: erro ao reprocessar → toast de erro com a mensagem da API', async () => {
    acoes.reprocessarIntegracao.mockResolvedValue({
      ok: false,
      erro: 'Não há integração com falha para reprocessar.',
      code: 'TRANSICAO_INVALIDA',
    });
    const { secao } = renderizar();
    const pessoa = userEvent.setup();

    await pessoa.click(
      within(linhaDe(secao, 'SOL-000020')).getByRole('button', { name: /^Reprocessar/ }),
    );

    await waitFor(() =>
      expect(mensagens(avisos.toast.error)).toContain(
        'Não há integração com falha para reprocessar.',
      ),
    );
    expect(acoes.reprocessarIntegracao).toHaveBeenCalledWith(FALHA_CRM.solicitacao.id);
  });

  it('ADR-010: sem falhas → "Nenhuma integração com falha", sem botões', () => {
    const { secao } = renderizar([]);

    expect(secao).toHaveTextContent('Nenhuma integração com falha');
    expect(secao).toHaveTextContent(
      'Todos os eventos foram entregues ao sistema externo ou ainda estão nas tentativas automáticas.',
    );
    expect(within(secao).queryAllByRole('button', { name: /^Reprocessar/ })).toHaveLength(0);
  });
});
