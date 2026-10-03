import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mensagens, prepararDom } from '@/test/dom';
import { CARLA, pessoa, solicitacao } from '@/test/fabricas';
import { ModalDecisao } from './modal-decisao';
import { ModalReabertura } from './modal-reabertura';

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
const EM_ANALISE = solicitacao({
  id: ID,
  status: 'EM_ANALISE',
  analista: pessoa(CARLA),
  acoesPermitidas: ['DECIDIR'],
});
const APROVADA = solicitacao({
  id: ID,
  status: 'APROVADA',
  analista: pessoa(CARLA),
  decisao: {
    resultado: 'APROVADA',
    comentario: 'Aprovado conforme política.',
    decididoEm: '2026-10-02T18:00:00.000Z',
    decididoPor: pessoa(CARLA),
  },
  acoesPermitidas: ['REABRIR'],
});

const COMENTARIO_VALIDO = 'Fora da política de compras.';

describe('RN-06: modal de decisão', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderizar() {
    const aoMudarAberto = vi.fn();
    render(<ModalDecisao solicitacao={EM_ANALISE} aberto aoMudarAberto={aoMudarAberto} />);
    return { aoMudarAberto, pessoa: userEvent.setup() };
  }

  const confirmar = () => screen.getByRole('button', { name: /^Confirmar/ });

  it('RN-06: sem escolher Aprovar ou Rejeitar, não envia (mesmo com comentário válido)', async () => {
    const { pessoa: usuario } = renderizar();

    await usuario.type(screen.getByLabelText(/^Comentário/), COMENTARIO_VALIDO);
    await usuario.click(confirmar());

    expect(acoes.decidirSolicitacao).not.toHaveBeenCalled();
  });

  it('RN-06: o botão de confirmação muda de texto conforme a escolha', async () => {
    const { pessoa: usuario } = renderizar();

    await usuario.click(screen.getByRole('radio', { name: /^Aprovar/ }));
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('radio', { name: /^Rejeitar/ }));
    expect(screen.getByRole('button', { name: 'Confirmar rejeição' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar aprovação' })).toBeNull();
  });

  it('RN-06: comentário com menos de 10 caracteres (sem contar espaços nas pontas) não envia', async () => {
    const { pessoa: usuario } = renderizar();

    await usuario.click(screen.getByRole('radio', { name: /^Aprovar/ }));
    await usuario.type(screen.getByLabelText(/^Comentário/), '   curto      ');
    await usuario.click(confirmar());

    expect(acoes.decidirSolicitacao).not.toHaveBeenCalled();
  });

  it('RN-06: envia resultado e comentário, avisa e fecha o modal', async () => {
    acoes.decidirSolicitacao.mockResolvedValue({ ok: true, solicitacao: EM_ANALISE });
    const { pessoa: usuario, aoMudarAberto } = renderizar();

    await usuario.click(screen.getByRole('radio', { name: /^Rejeitar/ }));
    await usuario.type(screen.getByLabelText(/^Comentário/), COMENTARIO_VALIDO);
    await usuario.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));

    await waitFor(() =>
      expect(acoes.decidirSolicitacao).toHaveBeenCalledWith(ID, {
        resultado: 'REJEITADA',
        comentario: COMENTARIO_VALIDO,
      }),
    );
    await waitFor(() => expect(avisos.toast.success).toHaveBeenCalled());
    expect(aoMudarAberto).toHaveBeenCalledWith(false);
    expect(roteador.refresh).toHaveBeenCalled();
  });

  it('RN-07: erro 403 da action → toast com o detail e o detalhe recarregado', async () => {
    acoes.decidirSolicitacao.mockResolvedValue({
      ok: false,
      erro: 'Você não pode decidir a própria solicitação.',
      code: 'SEGREGACAO_DE_FUNCOES',
    });
    const { pessoa: usuario } = renderizar();

    await usuario.click(screen.getByRole('radio', { name: /^Aprovar/ }));
    await usuario.type(screen.getByLabelText(/^Comentário/), COMENTARIO_VALIDO);
    await usuario.click(screen.getByRole('button', { name: 'Confirmar aprovação' }));

    await waitFor(() =>
      expect(mensagens(avisos.toast.error)).toContain(
        'Você não pode decidir a própria solicitação.',
      ),
    );
    expect(roteador.refresh).toHaveBeenCalled();
  });

  it('RN-05: resultadoInicial já deixa a escolha marcada', () => {
    render(
      <ModalDecisao
        solicitacao={EM_ANALISE}
        aberto
        aoMudarAberto={vi.fn()}
        resultadoInicial="APROVADA"
      />,
    );

    expect(screen.getByRole('radio', { name: /^Aprovar/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Confirmar aprovação' })).toBeInTheDocument();
  });
});

describe('RN-16: modal de reabertura', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderizar() {
    const aoMudarAberto = vi.fn();
    render(<ModalReabertura solicitacao={APROVADA} aberto aoMudarAberto={aoMudarAberto} />);
    return { aoMudarAberto, pessoa: userEvent.setup() };
  }

  it('RN-16: mostra o aviso de que a decisão será desfeita e continua no histórico', () => {
    renderizar();

    expect(
      screen.getByText(
        'A decisão atual será desfeita e a solicitação volta para a fila. A decisão continua registrada no histórico.',
      ),
    ).toBeInTheDocument();
  });

  it('RN-16: justificativa com menos de 10 caracteres não envia', async () => {
    const { pessoa: usuario } = renderizar();

    await usuario.type(screen.getByLabelText(/^Justificativa/), 'errado');
    await usuario.click(screen.getByRole('button', { name: 'Reabrir solicitação' }));

    expect(acoes.reabrirSolicitacao).not.toHaveBeenCalled();
  });

  it('RN-16: com justificativa válida, envia, avisa e fecha', async () => {
    acoes.reabrirSolicitacao.mockResolvedValue({ ok: true, solicitacao: APROVADA });
    const { pessoa: usuario, aoMudarAberto } = renderizar();

    await usuario.type(
      screen.getByLabelText(/^Justificativa/),
      'Decisão tomada com dados errados.',
    );
    await usuario.click(screen.getByRole('button', { name: 'Reabrir solicitação' }));

    await waitFor(() =>
      expect(acoes.reabrirSolicitacao).toHaveBeenCalledWith(ID, {
        justificativa: 'Decisão tomada com dados errados.',
      }),
    );
    await waitFor(() => expect(avisos.toast.success).toHaveBeenCalled());
    expect(aoMudarAberto).toHaveBeenCalledWith(false);
  });
});
