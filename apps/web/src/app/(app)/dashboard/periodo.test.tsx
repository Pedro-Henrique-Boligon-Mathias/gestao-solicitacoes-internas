import { screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Filtros } from '@/features/solicitacoes/filtros';
import { lerUrl, prepararDom } from '@/test/dom';
import {
  ANA,
  CARLA,
  DIEGO,
  gestao,
  item,
  pagina,
  pessoa,
  resumo,
  type Usuario,
} from '@/test/fabricas';
import { renderizarServidor } from '@/test/servidor';
import PaginaDashboard from './page';

/*
 * Seletor de período nos três dashboards (Fase 3.5, PR 4C): o período vem de ?periodo= (valor
 * inválido cai em tudo) e só os blocos de indicadores mudam. "Seu trabalho", "Em andamento",
 * "Decididas recentemente", a fila e as integrações mostram sempre o estado atual. O título
 * "Indicadores · <período>" fica só nos blocos filtrados, e os links para a lista não levam o
 * período (a lista não tem esse filtro).
 */

vi.mock('server-only', () => ({}));

const busca = vi.hoisted(() => ({ atual: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(busca.atual),
  redirect: vi.fn(() => {
    throw new Error('redirect inesperado no teste');
  }),
}));

const consultas = vi.hoisted(() => ({
  obterResumo: vi.fn(),
  obterPainelGestao: vi.fn(),
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
  iniciarAnalise: vi.fn(),
  reprocessarIntegracao: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));

/** 04/10/2026 09:42 em São Paulo. */
const AGORA = new Date('2026-10-04T12:42:00.000Z');
const ok = <T,>(dados: T) => ({ ok: true as const, dados });

const EM_ANALISE_CARLA = item({
  codigo: 'SOL-000133',
  titulo: 'Novo usuário no ERP',
  status: 'EM_ANALISE',
  analista: pessoa(CARLA),
});
const NA_FILA = item({ codigo: 'SOL-000035', titulo: 'Integração do site com o CRM parou' });

/** Listas do dashboard pelos filtros: as minhas análises, as decididas (vazias) ou a fila. */
function listaPara(filtros: Partial<Filtros>) {
  const status: string[] = filtros.status ?? [];
  if (filtros.analista === 'eu') return ok(pagina([EM_ANALISE_CARLA]));
  if (status.includes('APROVADA') || status.includes('REJEITADA')) return ok(pagina([]));
  return ok(pagina([NA_FILA]));
}

/** Renderiza o dashboard de quem está logado com ?periodo= (ou sem ele). */
async function renderizar(usuario: Usuario, periodo?: string) {
  busca.atual = periodo === undefined ? '' : `periodo=${periodo}`;
  autenticado.obterUsuarioAtual.mockResolvedValue({ autenticado: true, usuario });
  consultas.obterResumo.mockImplementation(async (valor?: string) =>
    ok(
      resumo({
        escopo: usuario.cargo === 'SOLICITANTE' ? 'PROPRIAS' : 'GERAL',
        periodo: { valor: (valor ?? 'tudo') as 'tudo', inicio: null, fim: AGORA.toISOString() },
      }),
    ),
  );
  consultas.obterPainelGestao.mockImplementation(async () => ok(gestao()));
  consultas.listarSolicitacoes.mockImplementation(async (filtros: Partial<Filtros>) =>
    listaPara(filtros ?? {}),
  );
  const searchParams = Promise.resolve(periodo === undefined ? {} : { periodo });
  return renderizarServidor(<PaginaDashboard searchParams={searchParams} />);
}

/** Todos os filtros passados a listarSolicitacoes, em ordem. */
const filtrosDasListas = () =>
  consultas.listarSolicitacoes.mock.calls.map(([filtros]) => filtros as Record<string, unknown>);

const CARGOS = [
  ['solicitante', ANA],
  ['analista', CARLA],
  ['admin', DIEGO],
] as const;

beforeAll(() => {
  prepararDom();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((consulta: string) => ({
      matches: false,
      media: consulta,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe.each(CARGOS)('RF-04: período no dashboard do %s', (_cargo, usuario) => {
  it('RF-04: o cabeçalho tem o seletor com o período da URL', async () => {
    await renderizar(usuario, '7d');

    expect(screen.getByRole('button', { name: /^Período:? Últimos 7 dias$/ })).toBeTruthy();
  });

  it('RF-04: sem ?periodo=, o seletor fica em Tudo', async () => {
    await renderizar(usuario);

    expect(screen.getByRole('button', { name: /^Período:? Tudo$/ })).toBeTruthy();
  });

  it('RF-04: ?periodo= inválido cai em Tudo', async () => {
    await renderizar(usuario, '90d');

    expect(screen.getByRole('button', { name: /^Período:? Tudo$/ })).toBeTruthy();
    for (const [valor] of consultas.obterResumo.mock.calls) {
      expect([undefined, 'tudo']).toContain(valor);
    }
  });

  it('RF-04: o resumo dos indicadores é consultado com o período', async () => {
    await renderizar(usuario, '7d');

    expect(consultas.obterResumo).toHaveBeenCalledWith('7d');
  });

  it('RF-04: as listas (fila, minhas análises, em andamento, decididas) não recebem o período', async () => {
    await renderizar(usuario, '30d');

    for (const filtros of filtrosDasListas()) {
      expect(filtros).not.toHaveProperty('periodo');
      expect(JSON.stringify(filtros)).not.toContain('30d');
    }
  });

  it('RF-04: as listas pedidas são as mesmas em Tudo e em Hoje (estado atual)', async () => {
    await renderizar(usuario);
    const emTudo = filtrosDasListas();
    vi.clearAllMocks();
    document.body.innerHTML = '';

    await renderizar(usuario, 'hoje');

    expect(filtrosDasListas()).toEqual(emTudo);
  });

  it('RF-04: nenhum link para a lista leva o período', async () => {
    const { container } = await renderizar(usuario, '7d');

    const links = [...container.querySelectorAll('a')].filter((a) =>
      lerUrl(a.getAttribute('href') ?? '').caminho.startsWith('/solicitacoes'),
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(lerUrl(link.getAttribute('href')!).params.has('periodo')).toBe(false);
    }
  });
});

/** Nomes acessíveis de todos os títulos da página. */
const titulos = () => screen.getAllByRole('heading').map((h) => h.textContent ?? '');
const secaoDo = (nome: RegExp) => {
  const titulo = screen.getByRole('heading', { name: nome });
  return (titulo.closest('section') ?? titulo.parentElement)!;
};

describe('RF-04: o título com o período fica só nos blocos filtrados', () => {
  it('RF-04: analista — "Indicadores · Últimos 7 dias"; Minhas análises e Fila sem o período', async () => {
    await renderizar(CARLA, '7d');

    expect(screen.getByRole('heading', { name: /^Indicadores · Últimos 7 dias/ })).toBeTruthy();
    const comPeriodo = titulos().filter((t) => t.includes('Últimos 7 dias'));
    expect(comPeriodo).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /^Minhas análises/ })).not.toHaveTextContent(
      /Indicadores|Últimos/,
    );
    expect(screen.getByRole('heading', { name: /^Fila de análise/ })).not.toHaveTextContent(
      /Indicadores|Últimos/,
    );
  });

  it('RF-04: analista em Tudo — "Indicadores · Tudo"', async () => {
    await renderizar(CARLA);

    expect(screen.getByRole('heading', { name: /^Indicadores · Tudo/ })).toBeTruthy();
  });

  it('RF-04: solicitante — só "Seus números" leva o período; Em andamento e Decididas não', async () => {
    await renderizar(ANA, 'hoje');

    expect(
      screen.getByRole('heading', { name: /^(Seus números|Indicadores) · Hoje/ }),
    ).toBeTruthy();
    expect(titulos().filter((t) => / · Hoje/.test(t))).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /^Em andamento/ })).not.toHaveTextContent('Hoje');
    expect(screen.getByRole('heading', { name: /^Decididas recentemente/ })).not.toHaveTextContent(
      'Hoje',
    );
  });

  it('RF-04: admin — o painel de gestão é consultado com o período; Integrações com falha sem ele', async () => {
    await renderizar(DIEGO, '7d');

    expect(consultas.obterPainelGestao).toHaveBeenCalledWith('7d');
    expect(secaoDo(/^Integrações com falha/)).not.toHaveTextContent('Últimos 7 dias');
  });

  it('RF-04: admin — ?periodo= inválido consulta o painel em tudo', async () => {
    await renderizar(DIEGO, 'semana');

    expect(consultas.obterPainelGestao).toHaveBeenCalledWith('tudo');
  });
});
