import { screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ignorarConsoleError, prepararDom } from '@/test/dom';
import { ANA, CARLA, resumo, type Usuario } from '@/test/fabricas';
import { renderizarServidor } from '@/test/servidor';
import LayoutAreaLogada from './layout';

/*
 * Layout da área logada: o contador da fila no menu não pode segurar a página. No carregamento
 * completo, o layout envolve o dashboard; se ele esperasse o resumo, o cabeçalho e os esqueletos
 * por bloco só sairiam junto com o resumo (RF-04, ADR-012).
 */

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(() => {
    throw new Error('redirect inesperado no teste');
  }),
}));

const consultas = vi.hoisted(() => ({ obterResumo: vi.fn() }));
vi.mock('@/features/solicitacoes/consultas', () => consultas);

const autenticado = vi.hoisted(() => ({ obterUsuarioAtual: vi.fn() }));
vi.mock('@/lib/api/autenticado', () => autenticado);

vi.mock('@/features/auth/actions', () => ({ sair: vi.fn() }));

const AVISO_SCRIPT_NEXT_THEMES = 'Encountered a script tag while rendering React component';

function logado(usuario: Usuario) {
  autenticado.obterUsuarioAtual.mockResolvedValue({ autenticado: true, usuario });
}

async function renderizarLayout() {
  return renderizarServidor(
    <LayoutAreaLogada>
      <p>conteúdo da página</p>
    </LayoutAreaLogada>,
  );
}

describe('RF-04: layout da área logada', () => {
  let restaurarConsole: () => void;

  beforeAll(() => {
    prepararDom();
    restaurarConsole = ignorarConsoleError(AVISO_SCRIPT_NEXT_THEMES);
  });

  afterAll(() => restaurarConsole());

  beforeEach(() => {
    consultas.obterResumo.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it('RF-04: com o resumo pendente, a página e o menu já aparecem (o contador não segura o layout)', async () => {
    logado(CARLA);
    consultas.obterResumo.mockReturnValue(new Promise(() => undefined));

    await renderizarLayout();

    expect(screen.getByText('conteúdo da página')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByText(/na fila/)).not.toBeInTheDocument();
  });

  it('RF-04: quando o resumo chega, o menu mostra o tamanho da fila', async () => {
    logado(CARLA);
    consultas.obterResumo.mockResolvedValue({
      ok: true,
      dados: resumo({ porStatus: { ABERTA: 7, EM_ANALISE: 1, APROVADA: 1, REJEITADA: 1 } }),
    });

    await renderizarLayout();

    const link = screen.getByText(/na fila/).closest('a');
    expect(link).toHaveAttribute('href', '/solicitacoes');
    expect(link).toHaveTextContent(/7\s*na fila/);
  });

  it('RF-04: resumo com falha → menu sem contador, página normal', async () => {
    logado(CARLA);
    consultas.obterResumo.mockResolvedValue({ ok: false, status: 500, requestId: 'req-1' });

    await renderizarLayout();

    expect(screen.getByText('conteúdo da página')).toBeInTheDocument();
    expect(screen.queryByText(/na fila/)).not.toBeInTheDocument();
  });

  it('RN-13: o solicitante não tem contador e o layout não consulta o resumo', async () => {
    logado(ANA);

    await renderizarLayout();

    expect(screen.getByText('conteúdo da página')).toBeInTheDocument();
    expect(consultas.obterResumo).not.toHaveBeenCalled();
  });
});
