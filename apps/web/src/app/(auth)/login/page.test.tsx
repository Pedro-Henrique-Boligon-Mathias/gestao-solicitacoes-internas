import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ResultadoEntrar = { erro: string } | undefined;

const acoes = vi.hoisted(() => ({
  entrar: vi.fn<(estado: unknown, dados: FormData) => Promise<ResultadoEntrar>>(),
  sair: vi.fn(),
}));

vi.mock('@/features/auth/actions', () => acoes);

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  redirect: vi.fn(),
}));

/**
 * Renderiza a página de login. Se ela for um Server Component assíncrono (lê o searchParams),
 * resolve antes e renderiza o resultado; senão, renderiza como componente.
 */
async function renderizarLogin(): Promise<void> {
  const { default: Pagina } = (await import('./page')) as unknown as {
    default: ComponentType<{ searchParams: Promise<Record<string, string>> }> &
      ((props: {
        searchParams: Promise<Record<string, string>>;
      }) => ReactNode | Promise<ReactNode>);
  };
  const props = { searchParams: Promise.resolve({}) };
  if (Pagina.constructor.name === 'AsyncFunction') {
    render(<>{await Pagina(props)}</>);
  } else {
    render(<Pagina {...props} />);
  }
}

async function enviar(email = 'carla.mendes@demo.test', senha = 'senha-qualquer') {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('E-mail'), email);
  await usuario.type(screen.getByLabelText('Senha'), senha);
  await usuario.click(screen.getByRole('button', { name: /entrar/i }));
}

describe('Tela de login (/login)', () => {
  beforeEach(() => {
    acoes.entrar.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('ADR-004: campos E-mail e Senha com label e o botão Entrar', async () => {
    await renderizarLogin();

    const email = screen.getByLabelText('E-mail');
    const senha = screen.getByLabelText('Senha');
    expect(email).toHaveAttribute('name', 'email');
    expect(email).toHaveAttribute('type', 'email');
    expect(senha).toHaveAttribute('name', 'senha');
    expect(senha).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /entrar/i })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ADR-004: envia e-mail e senha para a action entrar', async () => {
    acoes.entrar.mockResolvedValue({ erro: 'E-mail ou senha inválidos.' });
    await renderizarLogin();

    await enviar('carla.mendes@demo.test', 'Demo@2026');

    await waitFor(() => expect(acoes.entrar).toHaveBeenCalledTimes(1));
    const dados = acoes.entrar.mock.calls[0]![1];
    expect(dados.get('email')).toBe('carla.mendes@demo.test');
    expect(dados.get('senha')).toBe('Demo@2026');
  });

  it('ADR-004: mostra "E-mail ou senha inválidos." quando a action devolve esse erro', async () => {
    acoes.entrar.mockResolvedValue({ erro: 'E-mail ou senha inválidos.' });
    await renderizarLogin();

    await enviar();

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
  });

  it('ADR-004: mostra a mensagem de muitas tentativas (429)', async () => {
    acoes.entrar.mockResolvedValue({ erro: 'Muitas tentativas. Aguarde 1 minuto.' });
    await renderizarLogin();

    await enviar();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Muitas tentativas. Aguarde 1 minuto.',
    );
  });

  it('ADR-004: o botão fica desabilitado enquanto envia', async () => {
    let concluir: (valor: ResultadoEntrar) => void = () => undefined;
    acoes.entrar.mockImplementation(
      () =>
        new Promise<ResultadoEntrar>((resolver) => {
          concluir = resolver;
        }),
    );
    await renderizarLogin();

    await enviar();

    await waitFor(() => expect(screen.getByRole('button', { name: /entra/i })).toBeDisabled());

    concluir({ erro: 'E-mail ou senha inválidos.' });
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /entrar/i })).toBeEnabled();
  });
});
