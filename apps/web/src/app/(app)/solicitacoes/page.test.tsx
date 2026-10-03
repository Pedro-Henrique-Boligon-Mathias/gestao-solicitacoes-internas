import { screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepararDom } from '@/test/dom';
import { ANA, AREAS, CARLA, DIEGO, item, pagina, resumo, type Usuario } from '@/test/fabricas';
import { renderizarServidor } from '@/test/servidor';
import PaginaSolicitacoes from './page';

/*
 * Página da lista com as consultas simuladas: quem vê a linha "Área" na barra de filtros e o que
 * acontece quando a lista de áreas não carrega (RF-02, ADR-012).
 */

vi.mock('server-only', () => ({}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/solicitacoes',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(() => {
    throw new Error('redirect inesperado no teste');
  }),
}));

const consultas = vi.hoisted(() => ({
  obterResumo: vi.fn(),
  listarSolicitacoes: vi.fn(),
  listarAreas: vi.fn(),
  detalharSolicitacao: vi.fn(),
  historicoSolicitacao: vi.fn(),
}));
vi.mock('@/features/solicitacoes/consultas', () => consultas);

const autenticado = vi.hoisted(() => ({
  obterUsuarioAtual: vi.fn(),
  criarClienteApiAutenticado: vi.fn(),
}));
vi.mock('@/lib/api/autenticado', () => autenticado);

vi.mock('@/features/solicitacoes/actions', () => ({
  criarSolicitacao: vi.fn(),
  editarSolicitacao: vi.fn(),
  excluirSolicitacao: vi.fn(),
  iniciarAnalise: vi.fn(),
  decidirSolicitacao: vi.fn(),
  reabrirSolicitacao: vi.fn(),
  reprocessarIntegracao: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));

const ITEM = item({ titulo: 'Acesso ao sistema de folha' });

type Areas = { ok: true; dados: typeof AREAS } | { ok: false; status: number; requestId?: string };

async function renderizar(
  usuario: Usuario,
  areas: Areas = { ok: true, dados: AREAS },
  busca: Record<string, string | string[]> = {},
) {
  autenticado.obterUsuarioAtual.mockResolvedValue({ autenticado: true, usuario });
  consultas.listarSolicitacoes.mockResolvedValue({ ok: true, dados: pagina([ITEM]) });
  consultas.obterResumo.mockResolvedValue({ ok: true, dados: resumo() });
  consultas.listarAreas.mockResolvedValue(areas);

  return renderizarServidor(
    <PaginaSolicitacoes searchParams={Promise.resolve(busca)} params={Promise.resolve({})} />,
  );
}

const grupoArea = () => screen.queryByRole('group', { name: 'Área' });

describe('RF-02: filtro por área na página da lista', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['analista', CARLA],
    ['admin', DIEGO],
  ])('RF-02: %s vê a linha "Área" com as áreas de GET /areas', async (_cargo, usuario) => {
    await renderizar(usuario);

    const grupo = grupoArea();
    expect(grupo).toBeInTheDocument();
    for (const area of AREAS) {
      expect(within(grupo!).getByRole('button', { name: area.nome })).toBeInTheDocument();
    }
  });

  it.each([
    ['analista', CARLA],
    ['admin', DIEGO],
  ])('RF-02: %s com ?area= na URL consulta a lista filtrada pela área', async (_cargo, usuario) => {
    await renderizar(usuario, undefined, { area: AREAS[0]!.id });

    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ area: [AREAS[0]!.id] }),
    );
  });

  it('RF-02: para o solicitante, ?area= na URL é ignorado e as áreas nem são consultadas', async () => {
    await renderizar(ANA, undefined, { area: AREAS[0]!.id });

    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ area: [] }),
    );
    expect(consultas.listarAreas).not.toHaveBeenCalled();
  });

  it('RF-02: o solicitante não vê o filtro de área', async () => {
    await renderizar(ANA);

    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument();
    expect(grupoArea()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Financeiro' })).toBeNull();
  });

  it('RF-02: se a lista de áreas falhar, a barra aparece sem a linha de área e a lista funciona, sem erro na tela', async () => {
    await renderizar(CARLA, { ok: false, status: 500, requestId: 'req-areas' });

    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument();
    expect(grupoArea()).toBeNull();
    expect(screen.getAllByText('Acesso ao sistema de folha').length).toBeGreaterThan(0);
    expect(screen.queryByText('req-areas')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
  });
});
