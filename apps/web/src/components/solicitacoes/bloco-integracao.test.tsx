import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mensagens, prepararDom } from '@/test/dom';
import {
  eventoIntegracao,
  integracao,
  solicitacao,
  type Acao,
  type Integracao,
} from '@/test/fabricas';
import { BlocoIntegracao } from './bloco-integracao';

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
  usePathname: () => '/solicitacoes/c0000000-0000-4000-8000-000000000042',
  useSearchParams: () => new URLSearchParams(),
}));

const acoes = vi.hoisted(() => ({
  criarSolicitacao: vi.fn(),
  editarSolicitacao: vi.fn(),
  excluirSolicitacao: vi.fn(),
  iniciarAnalise: vi.fn(),
  decidirSolicitacao: vi.fn(),
  reabrirSolicitacao: vi.fn(),
  reprocessarIntegracao: vi.fn(),
}));
vi.mock('@/features/solicitacoes/actions', () => acoes);

const avisos = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: avisos.toast, Toaster: () => null }));

const ID = 'c0000000-0000-4000-8000-000000000042';

function renderizar(dados: Integracao | null, acoesPermitidas: Acao[] = []) {
  return render(
    <BlocoIntegracao
      solicitacao={solicitacao({ id: ID, status: 'APROVADA', integracao: dados, acoesPermitidas })}
    />,
  );
}

/** O card do bloco (a seção com o título "Integração"). */
function bloco(): HTMLElement {
  const titulo = screen.getByRole('heading', { name: 'Integração' });
  return titulo.closest('section') ?? titulo.parentElement!;
}

describe('ADR-010: bloco Integração no detalhe', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('ADR-010: sem integração (null) o bloco não aparece', () => {
    const { container } = renderizar(null);

    expect(screen.queryByRole('heading', { name: 'Integração' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('ADR-010: PENDENTE sem tentativa ainda → "Pendente", sem "próxima tentativa"', () => {
    renderizar(integracao({ status: 'PENDENTE', tentativas: 0 }));

    expect(bloco()).toHaveTextContent('Pendente');
    expect(bloco()).not.toHaveTextContent(/próxima tentativa/i);
  });

  it('ADR-010: PENDENTE depois de falhar → "Pendente" com a próxima tentativa (data no dateTime)', () => {
    renderizar(
      integracao({
        status: 'PENDENTE',
        tentativas: 2,
        proximaTentativaEm: '2026-10-02T18:05:00.000Z',
      }),
    );

    expect(bloco()).toHaveTextContent('Pendente');
    expect(bloco()).toHaveTextContent(/próxima tentativa/i);
    expect(bloco().querySelector('time[datetime="2026-10-02T18:05:00.000Z"]')).not.toBeNull();
  });

  it('ADR-010: ENVIADO → "Enviada em" com a data completa', () => {
    renderizar(integracao({ status: 'ENVIADO', enviadaEm: '2026-10-02T18:01:00.000Z' }));

    expect(bloco()).toHaveTextContent(/Enviada em\s*02\/10\/2026 15:01/);
    expect(bloco()).not.toHaveTextContent(/próxima tentativa/i);
  });

  it('ADR-010: FALHOU → "Falhou: tentativa N de M"', () => {
    renderizar(integracao({ status: 'FALHOU', tentativas: 8, maxTentativas: 8 }));

    expect(bloco()).toHaveTextContent(/Falhou:\s*tentativa 8 de 8/);
  });

  it('ADR-010: com eventos aguardando atrás do evento em foco → "e mais N aguardando"', () => {
    renderizar(
      integracao({
        status: 'FALHOU',
        tipo: 'SolicitacaoAprovada',
        tentativas: 8,
        maxTentativas: 8,
        aguardando: 1,
        eventos: [
          eventoIntegracao({ tipo: 'SolicitacaoAprovada', status: 'FALHOU', tentativas: 8 }),
          eventoIntegracao({
            tipo: 'SolicitacaoReaberta',
            status: 'PENDENTE',
            criadoEm: '2026-10-03T12:00:00.100Z',
          }),
        ],
      }),
    );

    // O status mostrado é o do evento em foco, não o do mais recente
    expect(bloco()).toHaveTextContent(/Falhou:\s*tentativa 8 de 8/);
    expect(bloco()).toHaveTextContent('Aprovação');
    expect(bloco()).toHaveTextContent(/e mais 1 aguardando/);
  });

  it('ADR-010: o número de aguardando vem da API', () => {
    renderizar(integracao({ status: 'PENDENTE', tentativas: 1, aguardando: 3 }));

    expect(bloco()).toHaveTextContent(/e mais 3 aguardando/);
  });

  it('ADR-010: sem eventos aguardando, não mostra "aguardando"', () => {
    renderizar(integracao({ status: 'FALHOU', tentativas: 8, aguardando: 0 }));

    expect(bloco()).not.toHaveTextContent(/aguardando/);
  });

  it('ADR-010: usa o máximo de tentativas que vem da API', () => {
    renderizar(integracao({ status: 'FALHOU', tentativas: 3, maxTentativas: 3 }));

    expect(bloco()).toHaveTextContent(/tentativa 3 de 3/);
  });

  it.each([
    ['SolicitacaoAprovada', 'Aprovação'],
    ['SolicitacaoReaberta', 'Reabertura'],
  ] as const)('ADR-010: o tipo %s aparece com o rótulo "%s"', (tipo, rotulo) => {
    renderizar(integracao({ tipo }));

    expect(bloco()).toHaveTextContent(rotulo);
    expect(bloco()).not.toHaveTextContent(tipo);
  });

  describe('botão "Reprocessar integração"', () => {
    it('ADR-010: aparece só com REPROCESSAR_INTEGRACAO em acoesPermitidas', () => {
      renderizar(integracao({ status: 'FALHOU', tentativas: 8 }), ['REABRIR']);
      expect(screen.queryByRole('button', { name: 'Reprocessar integração' })).toBeNull();
    });

    it('ADR-010: com a ação permitida, aparece dentro do bloco', () => {
      renderizar(integracao({ status: 'FALHOU', tentativas: 8 }), [
        'REABRIR',
        'REPROCESSAR_INTEGRACAO',
      ]);

      expect(
        within(bloco()).getByRole('button', { name: 'Reprocessar integração' }),
      ).toBeInTheDocument();
    });

    it('ADR-010: chama a action com o id, avisa o sucesso e recarrega o detalhe', async () => {
      acoes.reprocessarIntegracao.mockResolvedValue({
        ok: true,
        solicitacao: solicitacao({ id: ID, integracao: integracao({ status: 'PENDENTE' }) }),
      });
      const pessoa = userEvent.setup();
      renderizar(integracao({ status: 'FALHOU', tentativas: 8 }), ['REPROCESSAR_INTEGRACAO']);

      await pessoa.click(screen.getByRole('button', { name: 'Reprocessar integração' }));

      await waitFor(() => expect(acoes.reprocessarIntegracao).toHaveBeenCalledWith(ID));
      await waitFor(() => expect(avisos.toast.success).toHaveBeenCalledTimes(1));
      expect(mensagens(avisos.toast.success)[0]).toEqual(expect.stringMatching(/\S/));
      expect(roteador.refresh).toHaveBeenCalled();
      expect(avisos.toast.error).not.toHaveBeenCalled();
    });

    it('ADR-010: erro da action → toast de erro com o detail da API e o detalhe recarregado', async () => {
      acoes.reprocessarIntegracao.mockResolvedValue({
        ok: false,
        erro: 'Não há integração com falha para reprocessar.',
        code: 'TRANSICAO_INVALIDA',
      });
      const pessoa = userEvent.setup();
      renderizar(integracao({ status: 'FALHOU', tentativas: 8 }), ['REPROCESSAR_INTEGRACAO']);

      await pessoa.click(screen.getByRole('button', { name: 'Reprocessar integração' }));

      await waitFor(() =>
        expect(mensagens(avisos.toast.error)).toContain(
          'Não há integração com falha para reprocessar.',
        ),
      );
      expect(roteador.refresh).toHaveBeenCalled();
      expect(avisos.toast.success).not.toHaveBeenCalled();
    });
  });
});
