import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mensagens, prepararDom } from '@/test/dom';
import { ANA, solicitacao } from '@/test/fabricas';
import { FormularioSolicitacao } from './formulario-solicitacao';

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
  usePathname: () => '/solicitacoes',
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

const CRIADA = solicitacao({
  id: 'c0000000-0000-4000-8000-000000000099',
  codigo: 'SOL-000099',
});

async function preencher(titulo: string, descricao: string) {
  const pessoa = userEvent.setup();
  if (titulo) await pessoa.type(screen.getByLabelText(/^Título/), titulo);
  if (descricao) await pessoa.type(screen.getByLabelText(/^Descrição/), descricao);
  return pessoa;
}

const botaoCriar = () => screen.getByRole('button', { name: 'Criar solicitação' });

describe('RF-01: formulário de solicitação', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('RF-01: começa com a prioridade Média selecionada e mostra a explicação de cada uma', () => {
    render(<FormularioSolicitacao usuario={ANA} />);

    expect(screen.getByRole('radio', { name: /^Média/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Baixa/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /^Alta/ })).not.toBeChecked();
    expect(screen.getByText(/existe alternativa temporária/i)).toBeInTheDocument();
  });

  it('RF-01: mostra só leitura o solicitante e a área do usuário logado', () => {
    render(<FormularioSolicitacao usuario={ANA} />);

    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
  });

  it('RF-01: título curto e descrição só com espaços mostram os erros sem chamar a action', async () => {
    render(<FormularioSolicitacao usuario={ANA} />);
    const pessoa = await preencher('abc', '            ');

    await pessoa.click(botaoCriar());

    expect(await screen.findByText(/pelo menos 5 caracteres/i)).toBeInTheDocument();
    expect(screen.getByText('Escreva pelo menos 10 caracteres.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Título/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^Descrição/)).toHaveAttribute('aria-invalid', 'true');
    expect(acoes.criarSolicitacao).not.toHaveBeenCalled();
  });

  it('RF-01: envia título, descrição e a prioridade escolhida para criarSolicitacao', async () => {
    acoes.criarSolicitacao.mockResolvedValue({ ok: true, solicitacao: CRIADA });
    render(<FormularioSolicitacao usuario={ANA} />);
    const pessoa = await preencher('Novo notebook', 'O atual não liga mais desde ontem.');

    await pessoa.click(screen.getByRole('radio', { name: /^Alta/ }));
    await pessoa.click(botaoCriar());

    await waitFor(() => expect(acoes.criarSolicitacao).toHaveBeenCalledTimes(1));
    expect(acoes.criarSolicitacao).toHaveBeenCalledWith({
      titulo: 'Novo notebook',
      descricao: 'O atual não liga mais desde ontem.',
      prioridade: 'ALTA',
    });
  });

  it('RF-01: sucesso na criação → toast com o código e navegação para o detalhe', async () => {
    acoes.criarSolicitacao.mockResolvedValue({ ok: true, solicitacao: CRIADA });
    const aoConcluir = vi.fn();
    render(<FormularioSolicitacao usuario={ANA} aoConcluir={aoConcluir} />);
    const pessoa = await preencher('Novo notebook', 'O atual não liga mais desde ontem.');

    await pessoa.click(botaoCriar());

    await waitFor(() =>
      expect(mensagens(avisos.toast.success)).toContain('Solicitação SOL-000099 criada'),
    );
    expect(roteador.push).toHaveBeenCalledWith(
      '/solicitacoes/c0000000-0000-4000-8000-000000000099',
    );
    expect(aoConcluir).toHaveBeenCalled();
  });

  it('RF-01: erros de campo devolvidos pela action aparecem no campo; o erro geral, no aviso do topo', async () => {
    acoes.criarSolicitacao.mockResolvedValue({
      ok: false,
      erro: 'Os dados enviados são inválidos.',
      code: 'DADOS_INVALIDOS',
      errosDeCampo: { titulo: 'O título não pode ser só números.' },
    });
    render(<FormularioSolicitacao usuario={ANA} />);
    const pessoa = await preencher('12345', 'O atual não liga mais desde ontem.');

    await pessoa.click(botaoCriar());

    const mensagem = await screen.findByText('O título não pode ser só números.');
    const titulo = screen.getByLabelText(/^Título/);
    expect(titulo).toHaveAttribute('aria-invalid', 'true');
    expect(titulo).toHaveAccessibleDescription(expect.stringContaining(mensagem.textContent!));
    expect(screen.getByRole('alert')).toHaveTextContent('Os dados enviados são inválidos.');
    expect(roteador.push).not.toHaveBeenCalled();
  });

  it('RF-01: o botão fica desabilitado enquanto envia', async () => {
    acoes.criarSolicitacao.mockReturnValue(new Promise(() => {}));
    render(<FormularioSolicitacao usuario={ANA} />);
    const pessoa = await preencher('Novo notebook', 'O atual não liga mais desde ontem.');

    await pessoa.click(botaoCriar());

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Criar solicitação|Criando|Enviando/ }),
      ).toBeDisabled(),
    );
  });

  describe('edição', () => {
    const ATUAL = solicitacao({
      titulo: 'Acesso ao sistema de folha',
      descricao: 'Preciso de acesso para fechar o mês.',
      prioridade: 'BAIXA',
      versao: 3,
      dataSolicitacao: '2026-10-01T13:00:00.000Z',
    });

    it('RN-02: vem preenchido e envia a versão lida junto com os campos', async () => {
      acoes.editarSolicitacao.mockResolvedValue({ ok: true, solicitacao: ATUAL });
      render(<FormularioSolicitacao usuario={ANA} solicitacao={ATUAL} />);
      const pessoa = userEvent.setup();

      expect(screen.getByLabelText(/^Título/)).toHaveValue('Acesso ao sistema de folha');
      expect(screen.getByRole('radio', { name: /^Baixa/ })).toBeChecked();
      expect(screen.getByText('01/10/2026 10:00')).toBeInTheDocument();

      const titulo = screen.getByLabelText(/^Título/);
      await pessoa.clear(titulo);
      await pessoa.type(titulo, 'Acesso ao sistema de RH');
      await pessoa.click(screen.getByRole('button', { name: 'Salvar alterações' }));

      await waitFor(() =>
        expect(acoes.editarSolicitacao).toHaveBeenCalledWith(ATUAL.id, {
          titulo: 'Acesso ao sistema de RH',
          descricao: 'Preciso de acesso para fechar o mês.',
          prioridade: 'BAIXA',
          versao: 3,
        }),
      );
      await waitFor(() => expect(mensagens(avisos.toast.success)).toContain('Alterações salvas'));
      expect(roteador.refresh).toHaveBeenCalled();
    });

    it('RN-11: conflito de versão mostra a mensagem e o botão para recarregar', async () => {
      acoes.editarSolicitacao.mockResolvedValue({
        ok: false,
        erro: 'Outra pessoa alterou esta solicitação.',
        code: 'CONFLITO_DE_VERSAO',
      });
      render(<FormularioSolicitacao usuario={ANA} solicitacao={ATUAL} />);
      const pessoa = userEvent.setup();

      await pessoa.click(screen.getByRole('button', { name: 'Salvar alterações' }));

      expect(
        await screen.findByText(
          'Alguém alterou esta solicitação antes. Recarregue para ver a versão atual.',
        ),
      ).toBeInTheDocument();
      await pessoa.click(screen.getByRole('button', { name: /recarregar/i }));
      expect(roteador.refresh).toHaveBeenCalled();
    });
  });
});
