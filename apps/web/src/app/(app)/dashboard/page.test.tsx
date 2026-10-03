import { existsSync } from 'node:fs';
import path from 'node:path';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Filtros } from '@/features/solicitacoes/filtros';
import { darTamanhoAosGraficos, esperarHref, linkPara, prepararDom } from '@/test/dom';
import {
  ANA,
  CARLA,
  item,
  pagina,
  pessoa,
  resumo,
  solicitacao,
  type ItemLista,
  type Resumo,
  type Usuario,
} from '@/test/fabricas';
import { renderizarServidor } from '@/test/servidor';
import PaginaDashboard from './page';

/*
 * Dashboard renderizado pela página (Server Component), com as consultas simuladas. Cobre o
 * conteúdo de cada cargo e a carga em blocos: cabeçalho na hora, resumo e listas cada um no seu
 * <Suspense>, com esqueleto e erro próprios (RF-04, ADR-012, RNF-05).
 */

vi.mock('server-only', () => ({}));

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

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));

const FILA = [
  item({
    id: 'c0000000-0000-4000-8000-000000000010',
    codigo: 'SOL-000010',
    titulo: 'Servidor de arquivos fora do ar',
    prioridade: 'ALTA',
    solicitante: pessoa(ANA),
  }),
  item({
    id: 'c0000000-0000-4000-8000-000000000011',
    codigo: 'SOL-000011',
    titulo: 'Licença do editor de planilhas',
    prioridade: 'MEDIA',
    // A própria Carla abriu esta: ela não pode analisá-la (RN-07)
    solicitante: pessoa(CARLA),
  }),
];

const MINHAS_ANALISES = [
  item({
    id: 'c0000000-0000-4000-8000-000000000020',
    codigo: 'SOL-000020',
    titulo: 'Novo usuário no ERP',
    status: 'EM_ANALISE',
    analista: pessoa(CARLA),
  }),
];

const ULTIMAS = [
  item({
    id: 'c0000000-0000-4000-8000-000000000030',
    codigo: 'SOL-000030',
    titulo: 'Cadeira ergonômica',
    status: 'APROVADA',
  }),
  item({
    id: 'c0000000-0000-4000-8000-000000000031',
    codigo: 'SOL-000031',
    titulo: 'Troca de monitor',
    status: 'REJEITADA',
  }),
];

const RESUMO_VAZIO: Partial<Resumo> = {
  total: 0,
  porStatus: { ABERTA: 0, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0 },
  porPrioridade: { BAIXA: 0, MEDIA: 0, ALTA: 0 },
  filaAlta: 0,
  aberturaMaisAntiga: null,
};

type Resultado<T> = { ok: true; dados: T } | { ok: false; status: number; requestId?: string };
/** O que cada consulta devolve: um resultado ou `'pendente'` (a promessa nunca resolve). */
type Retorno<T> = Resultado<T> | 'pendente';

const ok = <T,>(dados: T): Resultado<T> => ({ ok: true, dados });
const falha = (requestId: string): Resultado<never> => ({ ok: false, status: 500, requestId });
const promessa = <T,>(retorno: Retorno<T>): Promise<Resultado<T>> =>
  retorno === 'pendente' ? new Promise(() => undefined) : Promise.resolve(retorno);

type Lista = 'fila' | 'minhasAnalises' | 'ultimas';

/** Qual lista do dashboard a página pediu, pelos filtros passados a listarSolicitacoes. */
function qualLista(filtros: Partial<Filtros>): Lista {
  if (filtros.status?.includes('ABERTA')) return 'fila';
  if (filtros.status?.includes('EM_ANALISE') && filtros.analista === 'eu') return 'minhasAnalises';
  return 'ultimas';
}

interface Cenario {
  resumo?: Retorno<Resumo>;
  fila?: Retorno<ReturnType<typeof pagina>>;
  minhasAnalises?: Retorno<ReturnType<typeof pagina>>;
  ultimas?: Retorno<ReturnType<typeof pagina>>;
}

/** Renderiza o dashboard de quem está logado, com as consultas no estado do cenário. */
async function renderizar(usuario: Usuario, cenario: Cenario = {}) {
  const analista = usuario.cargo !== 'SOLICITANTE';
  autenticado.obterUsuarioAtual.mockResolvedValue({ autenticado: true, usuario });

  const retornos: Required<Cenario> = {
    resumo: ok(resumo({ escopo: analista ? 'GERAL' : 'PROPRIAS' })),
    fila: ok(pagina(analista ? FILA : [])),
    minhasAnalises: ok(pagina(analista ? MINHAS_ANALISES : [])),
    ultimas: ok(pagina(analista ? [] : ULTIMAS)),
    ...cenario,
  };
  consultas.obterResumo.mockImplementation(() => promessa(retornos.resumo));
  consultas.listarSolicitacoes.mockImplementation((filtros: Partial<Filtros>) =>
    promessa(retornos[qualLista(filtros ?? {})]),
  );

  return renderizarServidor(<PaginaDashboard />);
}

/** Lista com os itens informados (atalho para o cenário). */
const comItens = (itens: ItemLista[]) => ok(pagina(itens));

const esqueletoDoResumo = () => screen.queryByRole('status', { name: 'Carregando o resumo' });
const esqueletosDasListas = () => screen.queryAllByRole('status', { name: 'Carregando as listas' });

describe('RF-04: dashboard', () => {
  let desfazerTamanho: () => void;

  beforeAll(() => {
    prepararDom();
    desfazerTamanho = darTamanhoAosGraficos();
  });

  afterAll(() => {
    desfazerTamanho();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('RF-04: analista vê "Visão geral" e o botão "Nova solicitação"', async () => {
    await renderizar(CARLA);

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
  });

  it('RF-04/RN-13: solicitante vê "Suas solicitações"', async () => {
    await renderizar(ANA);

    expect(screen.getByRole('heading', { name: 'Suas solicitações' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Visão geral' })).toBeNull();
  });

  it('RF-04: o total aparece no destaque', async () => {
    await renderizar(CARLA);
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
  });

  it.each([
    ['ABERTA', 'Abertas', '12', '30%'],
    ['EM_ANALISE', 'Em análise', '8', '20%'],
    ['APROVADA', 'Aprovadas', '14', '35%'],
    ['REJEITADA', 'Rejeitadas', '6', '15%'],
  ])(
    'RF-04: bloco %s é um link para a lista filtrada, com nome, número e percentual inteiro',
    async (status, nome, numero, percentual) => {
      const { container } = await renderizar(CARLA);

      const bloco = linkPara(container, '/solicitacoes', { status });
      expect(bloco, `bloco ${status}`).toBeTruthy();
      expect(bloco).toHaveTextContent(nome);
      expect(bloco).toHaveTextContent(numero);
      expect(bloco).toHaveTextContent(percentual);
    },
  );

  it('RF-04: percentuais sem casas decimais', async () => {
    const { container } = await renderizar(CARLA, {
      resumo: ok(
        resumo({
          total: 3,
          porStatus: { ABERTA: 1, EM_ANALISE: 1, APROVADA: 1, REJEITADA: 0 },
          porPrioridade: { BAIXA: 1, MEDIA: 1, ALTA: 1 },
        }),
      ),
    });

    expect(linkPara(container, '/solicitacoes', { status: 'ABERTA' })).toHaveTextContent('33%');
    expect(linkPara(container, '/solicitacoes', { status: 'REJEITADA' })).toHaveTextContent('0%');
    expect(container).not.toHaveTextContent(/33[,.]3/);
  });

  it('RF-04: gráfico por prioridade com o valor escrito e um link por prioridade', async () => {
    const { container } = await renderizar(CARLA);

    for (const [codigo, rotulo, valor] of [
      ['BAIXA', 'Baixa', '10'],
      ['MEDIA', 'Média', '18'],
      ['ALTA', 'Alta', '12'],
    ] as const) {
      const link = linkPara(container, '/solicitacoes', { prioridade: codigo });
      expect(link, `link da prioridade ${codigo}`).toBeTruthy();
      expect(link).toHaveTextContent(rotulo);
      expect(link).toHaveTextContent(valor);
    }
  });

  it('RF-04: destaque do analista mostra a fila de alta e leva para "Ver a fila"', async () => {
    await renderizar(CARLA);

    expect(screen.getByText(/3 de alta prioridade/)).toBeInTheDocument();
    esperarHref(screen.getByRole('link', { name: 'Ver a fila' }), '/solicitacoes', {
      status: 'ABERTA',
      ordenarPor: 'prioridade',
    });
  });

  it('RF-04: "Iniciar a próxima" inicia a primeira da fila e vai para o detalhe', async () => {
    acoes.iniciarAnalise.mockResolvedValue({
      ok: true,
      solicitacao: solicitacao({ id: FILA[0]!.id, status: 'EM_ANALISE' }),
    });
    const pessoaUsuaria = userEvent.setup();
    await renderizar(CARLA);

    await pessoaUsuaria.click(screen.getByRole('button', { name: 'Iniciar a próxima' }));

    await waitFor(() => expect(acoes.iniciarAnalise).toHaveBeenCalledWith(FILA[0]!.id));
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith(`/solicitacoes/${FILA[0]!.id}`));
  });

  it('RF-04: "Iniciar a próxima" some com a fila vazia', async () => {
    await renderizar(CARLA, {
      fila: comItens([]),
      resumo: ok(
        resumo({
          porStatus: { ABERTA: 0, EM_ANALISE: 8, APROVADA: 14, REJEITADA: 6 },
          total: 28,
          filaAlta: 0,
          aberturaMaisAntiga: null,
        }),
      ),
    });

    expect(screen.queryByRole('button', { name: 'Iniciar a próxima' })).toBeNull();
  });

  it('RN-04/RN-07: "Fila de análise" tem "Iniciar análise" em cada item, menos nos do próprio usuário', async () => {
    await renderizar(CARLA);

    const titulo = screen.getByRole('heading', { name: 'Fila de análise' });
    const secao = titulo.closest('section') ?? titulo.parentElement!;
    expect(within(secao).getByText('Servidor de arquivos fora do ar')).toBeInTheDocument();
    expect(within(secao).getByText('Licença do editor de planilhas')).toBeInTheDocument();
    expect(within(secao).getAllByRole('button', { name: 'Iniciar análise' })).toHaveLength(1);
  });

  it('RF-04: analista vê "Minhas análises em andamento"', async () => {
    await renderizar(CARLA);

    const titulo = screen.getByRole('heading', { name: 'Minhas análises em andamento' });
    const secao = titulo.closest('section') ?? titulo.parentElement!;
    expect(within(secao).getByText('Novo usuário no ERP')).toBeInTheDocument();
  });

  it('RF-04: solicitante vê "Minhas últimas solicitações" com o status e não vê a fila', async () => {
    await renderizar(ANA);

    const titulo = screen.getByRole('heading', { name: 'Minhas últimas solicitações' });
    const secao = titulo.closest('section') ?? titulo.parentElement!;
    expect(within(secao).getByText('Cadeira ergonômica')).toBeInTheDocument();
    expect(secao).toHaveTextContent('Aprovada');
    expect(secao).toHaveTextContent('Rejeitada');
    expect(screen.queryByRole('heading', { name: 'Fila de análise' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar a próxima' })).toBeNull();
  });

  it('RF-04: solicitante tem "Ver a mais recente" levando ao detalhe da última', async () => {
    await renderizar(ANA);

    esperarHref(
      screen.getByRole('link', { name: 'Ver a mais recente' }),
      `/solicitacoes/${ULTIMAS[0]!.id}`,
    );
  });

  it('RF-04: sem solicitações → "Você ainda não tem solicitações", "Criar a primeira" e sem as listas', async () => {
    await renderizar(ANA, {
      resumo: ok(resumo({ escopo: 'PROPRIAS', ...RESUMO_VAZIO })),
      ultimas: comItens([]),
    });

    expect(screen.getByText('Você ainda não tem solicitações')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar a primeira' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Minhas últimas solicitações' })).toBeNull();
  });
});

describe('RF-04/ADR-012: dashboard carregado em blocos', () => {
  let desfazerTamanho: () => void;

  beforeAll(() => {
    prepararDom();
    desfazerTamanho = darTamanhoAosGraficos();
  });

  afterAll(() => {
    desfazerTamanho();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('RF-04: enquanto o resumo não resolve, aparece o esqueleto do resumo e o cabeçalho já está visível', async () => {
    await renderizar(CARLA, { resumo: 'pendente' });

    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
    expect(esqueletoDoResumo()).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Visão geral' })).toBeNull();
  });

  it('RF-04: enquanto as listas não resolvem, aparece o esqueleto das listas e o resumo já aparece', async () => {
    const { container } = await renderizar(CARLA, {
      fila: 'pendente',
      minhasAnalises: 'pendente',
    });

    expect(esqueletosDasListas().length).toBeGreaterThan(0);
    expect(esqueletoDoResumo()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(linkPara(container, '/solicitacoes', { status: 'ABERTA' })).toHaveTextContent('12');
    expect(linkPara(container, '/solicitacoes', { prioridade: 'ALTA' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Fila de análise' })).toBeNull();
  });

  it('RF-04: solicitante também vê o esqueleto das listas enquanto as últimas não chegam', async () => {
    await renderizar(ANA, { ultimas: 'pendente' });

    expect(esqueletosDasListas().length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Suas solicitações' })).toBeInTheDocument();
  });

  it('RF-04: as consultas são disparadas em paralelo (com tudo pendente, todas já foram chamadas e cada bloco mostra o seu esqueleto)', async () => {
    await renderizar(CARLA, { resumo: 'pendente', fila: 'pendente', minhasAnalises: 'pendente' });

    expect(consultas.obterResumo).toHaveBeenCalledTimes(1);
    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['ABERTA'], ordenarPor: 'prioridade' }),
      5,
    );
    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['EM_ANALISE'], analista: 'eu' }),
      5,
    );
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
    expect(esqueletoDoResumo()).toBeInTheDocument();
    expect(esqueletosDasListas().length).toBeGreaterThan(0);
  });

  it('RF-04: falha só nas listas → resumo visível e erro com o requestId só no bloco das listas', async () => {
    const pessoaUsuaria = userEvent.setup();
    const { container } = await renderizar(CARLA, {
      fila: falha('req-listas'),
      minhasAnalises: falha('req-listas'),
    });

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(linkPara(container, '/solicitacoes', { status: 'APROVADA' })).toHaveTextContent('14');
    expect(linkPara(container, '/solicitacoes', { prioridade: 'MEDIA' })).toHaveTextContent('18');
    expect(screen.getByText('req-listas')).toBeInTheDocument();

    const tentar = screen.getAllByRole('button', { name: 'Tentar novamente' });
    expect(tentar).toHaveLength(1);
    await pessoaUsuaria.click(tentar[0]!);
    expect(roteador.refresh).toHaveBeenCalledTimes(1);
  });

  it('RF-04: falha só nas últimas do solicitante → resumo visível e erro no bloco das listas', async () => {
    await renderizar(ANA, { ultimas: falha('req-ultimas') });

    expect(screen.getByRole('heading', { name: 'Suas solicitações' })).toBeInTheDocument();
    expect(screen.getByText('req-ultimas')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Tentar novamente' })).toHaveLength(1);
  });

  it('RF-04: falha só no resumo → listas visíveis e erro com o requestId no bloco do resumo', async () => {
    const pessoaUsuaria = userEvent.setup();
    await renderizar(CARLA, { resumo: falha('req-resumo') });

    const fila = screen.getByRole('heading', { name: 'Fila de análise' });
    const secao = fila.closest('section') ?? fila.parentElement!;
    expect(within(secao).getByText('Servidor de arquivos fora do ar')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Minhas análises em andamento' }),
    ).toBeInTheDocument();
    expect(screen.getByText('req-resumo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();

    const tentar = screen.getAllByRole('button', { name: 'Tentar novamente' });
    expect(tentar).toHaveLength(1);
    await pessoaUsuaria.click(tentar[0]!);
    expect(roteador.refresh).toHaveBeenCalledTimes(1);
  });

  it('RF-04: a rota não tem loading.tsx próprio (ele seguraria o cabeçalho; os esqueletos são por bloco)', () => {
    expect(existsSync(path.join(import.meta.dirname, 'loading.tsx'))).toBe(false);
  });
});
