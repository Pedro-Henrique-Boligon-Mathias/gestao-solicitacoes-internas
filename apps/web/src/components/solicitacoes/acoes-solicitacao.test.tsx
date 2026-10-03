import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mensagens, prepararDom } from '@/test/dom';
import { CARLA, DIEGO, solicitacao, type Acao } from '@/test/fabricas';
import { AcoesSolicitacao } from './acoes-solicitacao';

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
}));
vi.mock('@/features/solicitacoes/actions', () => acoes);

const avisos = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: avisos.toast, Toaster: () => null }));

const ID = 'c0000000-0000-4000-8000-000000000042';

function renderizar(acoesPermitidas: Acao[], usuario = CARLA) {
  const detalhe = solicitacao({ id: ID, acoesPermitidas });
  return render(<AcoesSolicitacao solicitacao={detalhe} usuario={usuario} />);
}

/** Nomes dos botões visíveis, sem repetição (desktop e barra fixa do celular podem duplicar). */
const nomesDosBotoes = () =>
  [
    ...new Set(
      screen
        .queryAllByRole('button')
        .map((botao) => (botao.getAttribute('aria-label') ?? botao.textContent ?? '').trim()),
    ),
  ].sort();

describe('Ações do detalhe conforme acoesPermitidas', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<[string, Acao[], string[]]>([
    ['RN-08: nenhuma ação', [], []],
    ['RN-02/RN-09: dono com ABERTA', ['EDITAR', 'EXCLUIR'], ['Editar', 'Excluir']],
    ['RN-04: analista com ABERTA', ['INICIAR_ANALISE'], ['Iniciar análise']],
    ['RN-05: responsável com EM_ANALISE', ['DECIDIR'], ['Aprovar', 'Rejeitar']],
    ['RN-16: administrador com decidida', ['REABRIR'], ['Reabrir']],
  ])('%s → %j mostra exatamente %j', (_caso, permitidas, botoes) => {
    renderizar(permitidas);
    expect(nomesDosBotoes()).toEqual([...botoes].sort());
  });

  it('RN-04: "Iniciar análise" chama a action, avisa "Análise iniciada" e recarrega o detalhe', async () => {
    acoes.iniciarAnalise.mockResolvedValue({ ok: true, solicitacao: solicitacao({ id: ID }) });
    const pessoa = userEvent.setup();
    renderizar(['INICIAR_ANALISE']);

    await pessoa.click(screen.getAllByRole('button', { name: 'Iniciar análise' })[0]!);

    await waitFor(() => expect(acoes.iniciarAnalise).toHaveBeenCalledWith(ID));
    await waitFor(() => expect(mensagens(avisos.toast.success)).toContain('Análise iniciada'));
    expect(roteador.refresh).toHaveBeenCalled();
  });

  it('RN-11: erro 409/403 da action → toast de erro com o detail da API e o detalhe recarregado', async () => {
    acoes.iniciarAnalise.mockResolvedValue({
      ok: false,
      erro: 'Outra pessoa já iniciou a análise desta solicitação.',
      code: 'TRANSICAO_INVALIDA',
    });
    const pessoa = userEvent.setup();
    renderizar(['INICIAR_ANALISE']);

    await pessoa.click(screen.getAllByRole('button', { name: 'Iniciar análise' })[0]!);

    await waitFor(() =>
      expect(mensagens(avisos.toast.error)).toContain(
        'Outra pessoa já iniciou a análise desta solicitação.',
      ),
    );
    expect(roteador.refresh).toHaveBeenCalled();
    expect(avisos.toast.success).not.toHaveBeenCalled();
  });

  describe('RN-09: exclusão com confirmação', () => {
    it('RN-09: "Excluir" abre a confirmação com o aviso e ainda não exclui', async () => {
      const pessoa = userEvent.setup();
      renderizar(['EDITAR', 'EXCLUIR']);

      await pessoa.click(screen.getAllByRole('button', { name: 'Excluir' })[0]!);

      expect(
        await screen.findByText(/Esta solicitação deixará de aparecer nas listas e indicadores\./),
      ).toBeInTheDocument();
      expect(acoes.excluirSolicitacao).not.toHaveBeenCalled();
    });

    it('RN-09: cancelar a confirmação não exclui', async () => {
      const pessoa = userEvent.setup();
      renderizar(['EDITAR', 'EXCLUIR']);

      await pessoa.click(screen.getAllByRole('button', { name: 'Excluir' })[0]!);
      await pessoa.click(await screen.findByRole('button', { name: 'Cancelar' }));

      expect(acoes.excluirSolicitacao).not.toHaveBeenCalled();
    });

    it('RN-09: confirmar em "Excluir solicitação" exclui, avisa e volta para a lista', async () => {
      acoes.excluirSolicitacao.mockResolvedValue({ ok: true });
      const pessoa = userEvent.setup();
      renderizar(['EDITAR', 'EXCLUIR'], DIEGO);

      await pessoa.click(screen.getAllByRole('button', { name: 'Excluir' })[0]!);
      await pessoa.click(await screen.findByRole('button', { name: 'Excluir solicitação' }));

      await waitFor(() => expect(acoes.excluirSolicitacao).toHaveBeenCalledWith(ID));
      await waitFor(() => expect(avisos.toast.success).toHaveBeenCalled());
      expect(roteador.push).toHaveBeenCalledWith('/solicitacoes');
    });
  });

  it('RN-05: "Rejeitar" abre o modal de decisão já com Rejeitar escolhido', async () => {
    const pessoa = userEvent.setup();
    renderizar(['DECIDIR']);

    await pessoa.click(screen.getAllByRole('button', { name: 'Rejeitar' })[0]!);

    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar rejeição' })).toBeInTheDocument();
  });

  it('RN-16: "Reabrir" abre o modal de reabertura', async () => {
    const pessoa = userEvent.setup();
    renderizar(['REABRIR'], DIEGO);

    await pessoa.click(screen.getAllByRole('button', { name: 'Reabrir' })[0]!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reabrir solicitação' })).toBeInTheDocument();
  });

  it('RN-02: "Editar" abre o modal com o formulário preenchido', async () => {
    const pessoa = userEvent.setup();
    renderizar(['EDITAR', 'EXCLUIR']);

    await pessoa.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toHaveValue('Acesso ao sistema de folha');
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
  });
});
