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
  DIEGO,
  decisao,
  item,
  pagina,
  pessoa,
  resumo,
  solicitacao,
  type ItemComDashboard,
  type Resumo,
  type Usuario,
} from '@/test/fabricas';
import { renderizarServidor } from '@/test/servidor';
import PaginaDashboard from './page';

/*
 * Dashboard renderizado pela página (Server Component), com as consultas simuladas. Desde a
 * Fase 3.5 (PR 4B) há um dashboard por cargo: solicitante (Em andamento, Decididas recentemente,
 * Seus números), analista (Seu trabalho e Indicadores) e admin (a "Visão geral" de antes, que
 * vira painel de gestão no 4C). Cobre também a carga em blocos: cabeçalho na hora e cada bloco
 * no seu <Suspense>, com esqueleto e erro próprios (RF-04, ADR-012, RNF-05).
 *
 * As datas relativas ("há 2 dias", "atualizado há 12 s") usam um relógio fixo: só o Date é falso
 * (os timers continuam reais, para o renderizarServidor e o userEvent).
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

/** Relógio dos testes: 12 s depois do geradoEm padrão do resumo (2026-10-03T12:00:00Z). */
const AGORA = new Date('2026-10-03T12:00:12.000Z');
const RAFAEL = { id: '6a1f0c2e-0000-4000-8000-000000000004', nome: 'Rafael Costa' };
const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// ---- Solicitante (Ana) ----

/** Em andamento da Ana, como no seed: duas na fila e duas em análise. */
const EM_ANDAMENTO = [
  item({
    id: id(38),
    codigo: 'SOL-000038',
    titulo: 'Acesso ao sistema de cobrança para conciliação',
    prioridade: 'ALTA',
    dataSolicitacao: '2026-10-01T09:00:00.000Z', // há 2 dias
  }),
  item({
    id: id(33),
    codigo: 'SOL-000033',
    titulo: 'Erro ao gerar a remessa bancária',
    prioridade: 'ALTA',
    status: 'EM_ANALISE',
    analista: pessoa(CARLA),
    analiseIniciadaEm: '2026-10-02T14:00:00.000Z', // 02/10 em São Paulo
  }),
  item({
    id: id(26),
    codigo: 'SOL-000026',
    titulo: 'Permissão para lançar notas fiscais de serviço',
    status: 'EM_ANALISE',
    analista: RAFAEL,
    analiseIniciadaEm: '2026-09-29T13:00:00.000Z', // 29/09
  }),
  item({
    id: id(31),
    codigo: 'SOL-000031',
    titulo: 'Relatório de despesas com filtro por centro de custo',
    prioridade: 'BAIXA',
    dataSolicitacao: '2026-09-27T10:00:00.000Z', // há 6 dias
  }),
];

const DECIDIDAS = [
  item({
    id: id(24),
    codigo: 'SOL-000024',
    titulo: 'Liberação de acesso ao internet banking da empresa',
    status: 'APROVADA',
    analista: pessoa(CARLA),
    decisao: decisao({
      comentario: 'Aprovado. O time de suporte vai entrar em contato.',
      decididoEm: '2026-09-30T15:00:00.000Z',
    }),
  }),
  item({
    id: id(19),
    codigo: 'SOL-000019',
    titulo: 'Acesso de administrador no computador',
    status: 'REJEITADA',
    analista: pessoa(DIEGO),
    decisao: decisao({
      resultado: 'REJEITADA',
      comentario: 'Rejeitado. Não há orçamento previsto neste semestre.',
      decididoEm: '2026-09-28T15:00:00.000Z',
      decididoPor: pessoa(DIEGO),
    }),
  }),
];

// ---- Analista (Carla) ----

/** Minhas análises: a página pede 5, mas o total (meta.total) é 4. */
const MINHAS_ANALISES = [
  item({
    id: id(133),
    codigo: 'SOL-000133',
    titulo: 'Novo usuário no ERP',
    prioridade: 'ALTA',
    status: 'EM_ANALISE',
    analista: pessoa(CARLA),
    analiseIniciadaEm: '2026-10-01T10:00:00.000Z', // há 2 dias
  }),
];

/** Fila da Carla: a primeira é dela (RN-07); a próxima para ela é a SOL-000035. */
const FILA_ANALISTA = [
  item({
    id: id(32),
    codigo: 'SOL-000032',
    titulo: 'Licença do editor de planilhas',
    prioridade: 'ALTA',
    solicitante: pessoa(CARLA),
  }),
  item({ id: id(35), codigo: 'SOL-000035', titulo: 'Integração do site com o CRM parou' }),
  item({ id: id(39), codigo: 'SOL-000039', titulo: 'Notebook com tela quebrada' }),
  item({ id: id(40), codigo: 'SOL-000040', titulo: 'Folha de pagamento não calcula horas extras' }),
  item({ id: id(41), codigo: 'SOL-000041', titulo: 'Troca do teclado da recepção' }),
];

// ---- Admin (Diego): a "Visão geral" de antes do 4B ----

const FILA_ADMIN = [
  item({
    id: id(10),
    codigo: 'SOL-000010',
    titulo: 'Servidor de arquivos fora do ar',
    prioridade: 'ALTA',
    solicitante: pessoa(ANA),
  }),
  item({
    id: id(11),
    codigo: 'SOL-000011',
    titulo: 'Licença do editor de planilhas',
    // O próprio Diego abriu esta: ele não pode analisá-la (RN-07)
    solicitante: pessoa(DIEGO),
  }),
];

const MINHAS_ANALISES_ADMIN = [
  item({
    id: id(20),
    codigo: 'SOL-000020',
    titulo: 'Novo usuário no ERP',
    status: 'EM_ANALISE',
    analista: pessoa(DIEGO),
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
type PaginaTeste = ReturnType<typeof pagina>;

const ok = <T,>(dados: T): Resultado<T> => ({ ok: true, dados });
const falha = (requestId: string): Resultado<never> => ({ ok: false, status: 500, requestId });
const promessa = <T,>(retorno: Retorno<T>): Promise<Resultado<T>> =>
  retorno === 'pendente' ? new Promise(() => undefined) : Promise.resolve(retorno);

type Lista = 'emAndamento' | 'decididas' | 'fila' | 'minhasAnalises';

/** Qual lista do dashboard a página pediu, pelos filtros passados a listarSolicitacoes. */
function qualLista(filtros: Partial<Filtros>): Lista | undefined {
  const status: string[] = filtros.status ?? [];
  if (filtros.analista === 'eu') return 'minhasAnalises';
  if (status.includes('APROVADA') || status.includes('REJEITADA')) return 'decididas';
  if (status.includes('ABERTA') && status.includes('EM_ANALISE')) return 'emAndamento';
  if (status.length === 1 && status[0] === 'ABERTA') return 'fila';
  return undefined;
}

interface Cenario {
  resumo?: Retorno<Resumo>;
  emAndamento?: Retorno<PaginaTeste>;
  decididas?: Retorno<PaginaTeste>;
  fila?: Retorno<PaginaTeste>;
  minhasAnalises?: Retorno<PaginaTeste>;
}

/** Padrão de cada cargo: listas e resumo como no seed. */
function padrao(usuario: Usuario): Required<Cenario> {
  const vazia = ok(pagina([]));
  if (usuario.cargo === 'SOLICITANTE') {
    return {
      resumo: ok(resumo({ escopo: 'PROPRIAS' })),
      emAndamento: ok(pagina(EM_ANDAMENTO)),
      decididas: ok(pagina(DECIDIDAS)),
      fila: vazia,
      minhasAnalises: vazia,
    };
  }
  const analista = usuario.cargo === 'ANALISTA';
  return {
    resumo: ok(resumo()),
    emAndamento: vazia,
    decididas: vazia,
    fila: analista ? ok(pagina(FILA_ANALISTA, { total: 10 })) : ok(pagina(FILA_ADMIN)),
    minhasAnalises: analista
      ? ok(pagina(MINHAS_ANALISES, { total: 4 }))
      : ok(pagina(MINHAS_ANALISES_ADMIN)),
  };
}

/** Renderiza o dashboard de quem está logado, com as consultas no estado do cenário. */
async function renderizar(usuario: Usuario, cenario: Cenario = {}) {
  autenticado.obterUsuarioAtual.mockResolvedValue({ autenticado: true, usuario });

  const retornos: Required<Cenario> = { ...padrao(usuario), ...cenario };
  consultas.obterResumo.mockImplementation(() => promessa(retornos.resumo));
  consultas.listarSolicitacoes.mockImplementation((filtros: Partial<Filtros>) => {
    const lista = qualLista(filtros ?? {});
    return promessa(lista ? retornos[lista] : ok(pagina([])));
  });

  return renderizarServidor(<PaginaDashboard />);
}

/** Lista com os itens informados (atalho para o cenário). */
const comItens = (itens: ItemComDashboard[], total = itens.length) => ok(pagina(itens, { total }));

/** Seção (ou o pai) do título com esse nome. */
function secaoDo(nome: string | RegExp): HTMLElement {
  const titulo = screen.getByRole('heading', { name: nome });
  return (titulo.closest('section') ?? titulo.parentElement)!;
}

const esqueletoDoResumo = () => screen.queryByRole('status', { name: 'Carregando o resumo' });
const esqueletosDasListas = () => screen.queryAllByRole('status', { name: 'Carregando as listas' });

/** Liga o relógio fixo e o DOM dos gráficos em cada describe. */
function prepararAmbiente() {
  let desfazerTamanho: () => void;

  beforeAll(() => {
    prepararDom();
    desfazerTamanho = darTamanhoAosGraficos();
  });

  afterAll(() => {
    desfazerTamanho();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });
}

describe('RF-04/RN-13: dashboard do solicitante', () => {
  prepararAmbiente();

  it('RF-04/RN-13: vê "Em andamento", "Decididas recentemente" e "Seus números", sem fila nem atualização automática', async () => {
    await renderizar(ANA);

    expect(screen.getByRole('heading', { name: /^Em andamento/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Decididas recentemente' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Seus números/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Visão geral' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Fila de análise/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar a próxima' })).toBeNull();
    expect(screen.queryByText(/atualizado há/)).toBeNull();
  });

  it('RF-04: "Em andamento" pede as abertas e em análise, mais recentes primeiro, 5 itens', async () => {
    await renderizar(ANA);

    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ['ABERTA', 'EM_ANALISE'],
        ordenarPor: 'dataSolicitacao',
        direcao: 'desc',
      }),
      5,
    );
  });

  it('RF-04: cada item do "Em andamento" tem código, título e a régua com a etapa atual', async () => {
    await renderizar(ANA);

    const secao = secaoDo(/^Em andamento/);
    for (const andamento of EM_ANDAMENTO) {
      expect(secao).toHaveTextContent(andamento.codigo);
      expect(within(secao).getByText(andamento.titulo)).toBeInTheDocument();
    }
    expect(within(secao).getAllByRole('list', { name: 'Etapa atual: Aberta' })).toHaveLength(2);
    expect(within(secao).getAllByRole('list', { name: 'Etapa atual: Em análise' })).toHaveLength(2);
  });

  it('RF-04: aberta mostra "Na fila há N dias"', async () => {
    await renderizar(ANA);

    const secao = secaoDo(/^Em andamento/);
    expect(secao).toHaveTextContent('Na fila há 2 dias');
    expect(secao).toHaveTextContent('Na fila há 6 dias');
  });

  it('RF-02/RF-04: em análise mostra "Com <analista> desde dd/MM", pelo analiseIniciadaEm', async () => {
    await renderizar(ANA);

    const secao = secaoDo(/^Em andamento/);
    expect(secao).toHaveTextContent('Com Carla Mendes desde 02/10');
    expect(secao).toHaveTextContent('Com Rafael Costa desde 29/09');
  });

  it('RF-04: no celular mostra 3 e "Ver mais N em andamento" (N = total - 3), levando à lista', async () => {
    await renderizar(ANA, { emAndamento: comItens(EM_ANDAMENTO, 7) });

    esperarHref(screen.getByRole('link', { name: 'Ver mais 4 em andamento' }), '/solicitacoes', {
      status: ['ABERTA', 'EM_ANALISE'],
    });
  });

  it('RF-04: com até 3 em andamento não há "Ver mais"', async () => {
    await renderizar(ANA, { emAndamento: comItens(EM_ANDAMENTO.slice(0, 3)) });

    expect(screen.getByRole('heading', { name: /^Em andamento/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Ver mais/ })).toBeNull();
  });

  it('RF-04: sem nada em andamento → "Nada esperando decisão"', async () => {
    await renderizar(ANA, { emAndamento: comItens([]) });

    expect(secaoDo(/^Em andamento/)).toHaveTextContent('Nada esperando decisão');
  });

  it('RF-04: "Decididas recentemente" pede as 3 últimas decididas pela data da decisão', async () => {
    await renderizar(ANA);

    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['APROVADA', 'REJEITADA'], ordenarPor: 'decididoEm' }),
      3,
    );
  });

  it('RF-03/RF-04: decididas mostram o selo e a citação "<quem decidiu>: <comentário>"', async () => {
    await renderizar(ANA);

    const secao = secaoDo('Decididas recentemente');
    expect(within(secao).getByText(DECIDIDAS[0]!.titulo)).toBeInTheDocument();
    expect(secao).toHaveTextContent('Aprovada');
    expect(secao).toHaveTextContent('Rejeitada');
    expect(secao).toHaveTextContent(
      'Carla Mendes: Aprovado. O time de suporte vai entrar em contato.',
    );
    expect(secao).toHaveTextContent(
      'Diego Lima: Rejeitado. Não há orçamento previsto neste semestre.',
    );
  });

  it('RF-04: "Seus números" usa o resumo (escopo PROPRIAS): total, status e prioridade', async () => {
    const { container } = await renderizar(ANA);

    const secao = secaoDo(/^Seus números/);
    expect(secao).toHaveTextContent('40');
    expect(
      screen.getByRole('link', { name: 'Aprovadas: 14 solicitações, 35% do total' }),
    ).toBeInTheDocument();
    for (const [codigo, valor] of [
      ['BAIXA', '10'],
      ['MEDIA', '18'],
      ['ALTA', '12'],
    ] as const) {
      expect(linkPara(container, '/solicitacoes', { prioridade: codigo })).toHaveTextContent(valor);
    }
  });

  it('RF-04: sem solicitações → "Você ainda não tem solicitações", "Criar a primeira" e sem as listas', async () => {
    await renderizar(ANA, {
      resumo: ok(resumo({ escopo: 'PROPRIAS', ...RESUMO_VAZIO })),
      emAndamento: comItens([]),
      decididas: comItens([]),
    });

    expect(screen.getByText('Você ainda não tem solicitações')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar a primeira' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Decididas recentemente' })).toBeNull();
  });
});

describe('RF-04/RN-07: dashboard do analista', () => {
  prepararAmbiente();

  const proxima = () => screen.queryByRole('group', { name: 'Próxima para você' });

  it('RF-04: abre com "Seu trabalho" e depois "Indicadores", sem a "Visão geral" do admin', async () => {
    await renderizar(CARLA);

    expect(screen.getByRole('heading', { name: 'Seu trabalho' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Indicadores/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Visão geral' })).toBeNull();
  });

  it('RF-04: "Minhas análises N" usa o meta.total (analista=eu, EM_ANALISE, por prioridade, 5)', async () => {
    await renderizar(CARLA);

    expect(screen.getByRole('heading', { name: /^Minhas análises\s+4$/ })).toBeInTheDocument();
    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['EM_ANALISE'], analista: 'eu', ordenarPor: 'prioridade' }),
      5,
    );
  });

  it('RF-04: "Fila de análise N" usa o meta.total da fila, e não porStatus.ABERTA do resumo', async () => {
    // Resumo diz 12 abertas; a consulta da fila, 10 (revisão de 04/10/2026)
    await renderizar(CARLA);

    expect(screen.getByRole('heading', { name: /^Fila de análise\s+10$/ })).toBeInTheDocument();
    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['ABERTA'], ordenarPor: 'prioridade' }),
      expect.any(Number),
    );
  });

  it('RF-04: cada item de "Minhas análises" diz há quanto tempo está com você (analiseIniciadaEm)', async () => {
    await renderizar(CARLA);

    const secao = secaoDo(/^Minhas análises\s+4$/);
    expect(within(secao).getByText('Novo usuário no ERP')).toBeInTheDocument();
    expect(secao).toHaveTextContent(/há 2 dias/);
  });

  it('RN-07: "Próxima para você" é a primeira da fila que não é da própria pessoa', async () => {
    await renderizar(CARLA);

    const grupo = proxima();
    expect(grupo).toBeInTheDocument();
    expect(grupo).toHaveTextContent('SOL-000035');
    expect(grupo).toHaveTextContent('Integração do site com o CRM parou');
    expect(grupo).not.toHaveTextContent('SOL-000032');
  });

  it('RN-07: a fila lista as três seguintes depois da próxima', async () => {
    await renderizar(CARLA);

    const secao = secaoDo(/^Fila de análise\s+10$/);
    for (const titulo of [
      'Notebook com tela quebrada',
      'Folha de pagamento não calcula horas extras',
      'Troca do teclado da recepção',
    ]) {
      expect(within(secao).getByText(titulo)).toBeInTheDocument();
      expect(proxima()).not.toHaveTextContent(titulo);
    }
  });

  it('RN-07: "Iniciar a próxima" inicia a SOL-000035 (pulando a própria) e vai para o detalhe', async () => {
    acoes.iniciarAnalise.mockResolvedValue({
      ok: true,
      solicitacao: solicitacao({ id: id(35), status: 'EM_ANALISE' }),
    });
    const pessoaUsuaria = userEvent.setup();
    await renderizar(CARLA);

    await pessoaUsuaria.click(screen.getByRole('button', { name: 'Iniciar a próxima' }));

    await waitFor(() => expect(acoes.iniciarAnalise).toHaveBeenCalledWith(id(35)));
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith(`/solicitacoes/${id(35)}`));
  });

  it('RN-07: fila só com as da própria pessoa → sem "Próxima para você" e sem "Iniciar a próxima"', async () => {
    await renderizar(CARLA, { fila: comItens(FILA_ANALISTA.slice(0, 1)) });

    expect(screen.getByRole('heading', { name: /^Fila de análise\s+1$/ })).toBeInTheDocument();
    expect(proxima()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar a próxima' })).toBeNull();
  });

  it('RF-04: a fila diz "N de prioridade alta · a mais antiga espera há N dias" e tem "Ver a fila"', async () => {
    await renderizar(CARLA);

    const secao = secaoDo(/^Fila de análise\s+10$/);
    // filaAlta 3; aberturaMaisAntiga 28/09 12:00, agora 03/10 12:00 → 5 dias
    expect(secao).toHaveTextContent('3 de prioridade alta · a mais antiga espera há 5 dias');
    esperarHref(within(secao).getByRole('link', { name: 'Ver a fila' }), '/solicitacoes', {
      status: 'ABERTA',
      ordenarPor: 'prioridade',
    });
  });

  it('RF-04: Fila e Minhas análises mostram "atualizado há N s" a partir do geradoEm', async () => {
    await renderizar(CARLA);

    expect(within(secaoDo(/^Fila de análise\s+10$/)).getByText(/atualizado há 12 s/)).toBeTruthy();
    expect(within(secaoDo(/^Minhas análises\s+4$/)).getByText(/atualizado há 12 s/)).toBeTruthy();
  });

  it('RF-04: o bloco "Em análise" dos indicadores não diz "com você" (fica só no título)', async () => {
    const { container } = await renderizar(CARLA);

    expect(screen.getByRole('heading', { name: /^Indicadores/ })).toBeInTheDocument();
    const bloco = linkPara(container, '/solicitacoes', { status: 'EM_ANALISE' });
    expect(bloco).toHaveTextContent('8');
    expect(bloco).not.toHaveTextContent(/com você/);
    expect(
      screen.getByRole('link', { name: 'Em análise: 8 solicitações, 20% do total' }),
    ).toBeInTheDocument();
  });

  it('RF-04: indicadores com o total e o gráfico por prioridade', async () => {
    const { container } = await renderizar(CARLA);

    expect(secaoDo(/^Indicadores/)).toHaveTextContent('40');
    for (const [codigo, valor] of [
      ['BAIXA', '10'],
      ['MEDIA', '18'],
      ['ALTA', '12'],
    ] as const) {
      expect(linkPara(container, '/solicitacoes', { prioridade: codigo })).toHaveTextContent(valor);
    }
  });

  it('RF-04: no celular, abas "Minhas análises N | Fila N"; com análises, começa em Minhas análises', async () => {
    await renderizar(CARLA);

    const minhas = screen.getByRole('tab', { name: /^Minhas análises\s+4$/ });
    expect(minhas).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /^Fila\s+10$/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('RF-04: sem análises com a pessoa, a aba inicial é Fila e aparece "Nada em análise com você"', async () => {
    await renderizar(CARLA, { minhasAnalises: comItens([]) });

    expect(screen.getByRole('tab', { name: /^Fila\s+10$/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Nada em análise com você')).toBeInTheDocument();
  });

  it('RF-04: fila vazia → "Fila vazia", sem "Próxima para você" e sem "Iniciar a próxima"', async () => {
    await renderizar(CARLA, {
      fila: comItens([]),
      resumo: ok(resumo({ filaAlta: 0, aberturaMaisAntiga: null })),
    });

    expect(screen.getByText('Fila vazia')).toBeInTheDocument();
    expect(proxima()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar a próxima' })).toBeNull();
  });
});

describe('RF-04: dashboard do admin (a "Visão geral" continua no 4B)', () => {
  prepararAmbiente();

  it('RF-04: admin vê "Visão geral", o total e o botão "Nova solicitação"', async () => {
    await renderizar(DIEGO);

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
  });

  it('RF-04: a "Visão geral" mostra "atualizado há N s" a partir do geradoEm', async () => {
    await renderizar(DIEGO);

    expect(screen.getAllByText(/atualizado há 12 s/).length).toBeGreaterThan(0);
  });

  it('RF-04: destaque do admin mostra a fila de alta e leva para "Ver a fila"', async () => {
    await renderizar(DIEGO);

    expect(screen.getByText(/3 de alta prioridade/)).toBeInTheDocument();
    esperarHref(screen.getByRole('link', { name: 'Ver a fila' }), '/solicitacoes', {
      status: 'ABERTA',
      ordenarPor: 'prioridade',
    });
  });

  it('RF-04: "Iniciar a próxima" inicia a primeira da fila e vai para o detalhe', async () => {
    acoes.iniciarAnalise.mockResolvedValue({
      ok: true,
      solicitacao: solicitacao({ id: FILA_ADMIN[0]!.id, status: 'EM_ANALISE' }),
    });
    const pessoaUsuaria = userEvent.setup();
    await renderizar(DIEGO);

    await pessoaUsuaria.click(screen.getByRole('button', { name: 'Iniciar a próxima' }));

    await waitFor(() => expect(acoes.iniciarAnalise).toHaveBeenCalledWith(FILA_ADMIN[0]!.id));
    await waitFor(() =>
      expect(roteador.push).toHaveBeenCalledWith(`/solicitacoes/${FILA_ADMIN[0]!.id}`),
    );
  });

  it('RF-04: "Iniciar a próxima" some com a fila vazia', async () => {
    await renderizar(DIEGO, {
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
    await renderizar(DIEGO);

    const secao = secaoDo('Fila de análise');
    expect(within(secao).getByText('Servidor de arquivos fora do ar')).toBeInTheDocument();
    expect(within(secao).getByText('Licença do editor de planilhas')).toBeInTheDocument();
    expect(within(secao).getAllByRole('button', { name: 'Iniciar análise' })).toHaveLength(1);
  });

  it('RF-04: admin vê "Minhas análises em andamento"', async () => {
    await renderizar(DIEGO);

    expect(
      within(secaoDo('Minhas análises em andamento')).getByText('Novo usuário no ERP'),
    ).toBeTruthy();
  });
});

describe('RF-04: blocos de status (contrato dos três dashboards)', () => {
  prepararAmbiente();

  const CARGOS = [
    ['solicitante', ANA],
    ['analista', CARLA],
    ['admin', DIEGO],
  ] as const;

  describe.each(CARGOS)('%s', (_cargo, usuario) => {
    it.each([
      ['ABERTA', 'Abertas', '12', '30%'],
      ['EM_ANALISE', 'Em análise', '8', '20%'],
      ['APROVADA', 'Aprovadas', '14', '35%'],
      ['REJEITADA', 'Rejeitadas', '6', '15%'],
    ])(
      'RF-04: bloco %s é um link para a lista filtrada, com nome, número e percentual inteiro',
      async (status, nome, numero, percentual) => {
        const { container } = await renderizar(usuario);

        const bloco = linkPara(container, '/solicitacoes', { status });
        expect(bloco, `bloco ${status}`).toBeTruthy();
        expect(bloco).toHaveTextContent(nome);
        expect(bloco).toHaveTextContent(numero);
        expect(bloco).toHaveTextContent(percentual);
      },
    );

    it('RF-04: o nome acessível do bloco separa rótulo, número e percentual', async () => {
      await renderizar(usuario);

      // Contrato também do E2E: "Aprovadas: N solicitações, P% do total"
      expect(
        screen.getByRole('link', { name: /^Aprovadas\s*:\s*14 solicitações\s*,\s*35% do total$/ }),
      ).toBeInTheDocument();
    });
  });

  it('RF-04: com uma única solicitação no status, o nome acessível fica no singular', async () => {
    await renderizar(CARLA, {
      resumo: ok(
        resumo({ total: 4, porStatus: { ABERTA: 1, EM_ANALISE: 1, APROVADA: 1, REJEITADA: 1 } }),
      ),
    });

    expect(
      screen.getByRole('link', { name: 'Aprovadas: 1 solicitação, 25% do total' }),
    ).toBeInTheDocument();
  });

  it('RF-04: percentuais sem casas decimais', async () => {
    const { container } = await renderizar(DIEGO, {
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
});

describe('RF-04/ADR-012: dashboard carregado em blocos', () => {
  prepararAmbiente();

  /** Título do bloco do resumo de cada cargo. */
  const BLOCOS_DO_RESUMO = [
    ['solicitante', ANA, /^Seus números/],
    ['analista', CARLA, /^Indicadores/],
    ['admin', DIEGO, /^Visão geral$/],
  ] as const;

  it.each(BLOCOS_DO_RESUMO)(
    'RF-04: %s — enquanto o resumo não resolve, aparece o esqueleto do resumo e o cabeçalho já está visível',
    async (_cargo, usuario, tituloDoResumo) => {
      await renderizar(usuario, { resumo: 'pendente' });

      expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
      expect(esqueletoDoResumo()).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: tituloDoResumo })).toBeNull();
    },
  );

  it('RF-04: analista — enquanto as listas não resolvem, aparece o esqueleto das listas e os indicadores já aparecem', async () => {
    const { container } = await renderizar(CARLA, {
      fila: 'pendente',
      minhasAnalises: 'pendente',
    });

    expect(esqueletosDasListas().length).toBeGreaterThan(0);
    expect(esqueletoDoResumo()).toBeNull();
    expect(screen.getByRole('heading', { name: /^Indicadores/ })).toBeInTheDocument();
    expect(linkPara(container, '/solicitacoes', { status: 'ABERTA' })).toHaveTextContent('12');
    expect(linkPara(container, '/solicitacoes', { prioridade: 'ALTA' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^Fila de análise/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^Minhas análises/ })).toBeNull();
  });

  it('RF-04: admin — enquanto as listas não resolvem, aparece o esqueleto das listas e a visão geral já aparece', async () => {
    const { container } = await renderizar(DIEGO, {
      fila: 'pendente',
      minhasAnalises: 'pendente',
    });

    expect(esqueletosDasListas().length).toBeGreaterThan(0);
    expect(esqueletoDoResumo()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(linkPara(container, '/solicitacoes', { status: 'ABERTA' })).toHaveTextContent('12');
    expect(screen.queryByRole('heading', { name: 'Fila de análise' })).toBeNull();
  });

  it('RF-04: solicitante — esqueleto das listas enquanto o em andamento e as decididas não chegam', async () => {
    await renderizar(ANA, { emAndamento: 'pendente', decididas: 'pendente' });

    expect(esqueletosDasListas().length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /^Seus números/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Decididas recentemente' })).toBeNull();
  });

  it('RF-04: analista — as consultas saem em paralelo (com tudo pendente, todas já foram chamadas)', async () => {
    await renderizar(CARLA, { resumo: 'pendente', fila: 'pendente', minhasAnalises: 'pendente' });

    expect(consultas.obterResumo).toHaveBeenCalledTimes(1);
    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['ABERTA'], ordenarPor: 'prioridade' }),
      expect.any(Number),
    );
    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['EM_ANALISE'], analista: 'eu' }),
      5,
    );
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
    expect(esqueletoDoResumo()).toBeInTheDocument();
    expect(esqueletosDasListas().length).toBeGreaterThan(0);
  });

  it('RF-04: solicitante — as consultas saem em paralelo', async () => {
    await renderizar(ANA, { resumo: 'pendente', emAndamento: 'pendente', decididas: 'pendente' });

    expect(consultas.obterResumo).toHaveBeenCalledTimes(1);
    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['ABERTA', 'EM_ANALISE'] }),
      5,
    );
    expect(consultas.listarSolicitacoes).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['APROVADA', 'REJEITADA'] }),
      3,
    );
    expect(esqueletoDoResumo()).toBeInTheDocument();
    expect(esqueletosDasListas().length).toBeGreaterThan(0);
  });

  it('RF-04: analista — falha na fila → indicadores visíveis e erro com o requestId só no bloco das listas', async () => {
    const pessoaUsuaria = userEvent.setup();
    const { container } = await renderizar(CARLA, { fila: falha('req-fila') });

    expect(screen.getByRole('heading', { name: /^Indicadores/ })).toBeInTheDocument();
    expect(linkPara(container, '/solicitacoes', { status: 'APROVADA' })).toHaveTextContent('14');
    expect(linkPara(container, '/solicitacoes', { prioridade: 'MEDIA' })).toHaveTextContent('18');
    expect(screen.getByText('req-fila')).toBeInTheDocument();

    const tentar = screen.getAllByRole('button', { name: 'Tentar novamente' });
    expect(tentar).toHaveLength(1);
    await pessoaUsuaria.click(tentar[0]!);
    expect(roteador.refresh).toHaveBeenCalledTimes(1);
  });

  it('RF-04: admin — falha nas listas → resumo visível e erro com o requestId só no bloco das listas', async () => {
    const { container } = await renderizar(DIEGO, {
      fila: falha('req-listas'),
      minhasAnalises: falha('req-listas'),
    });

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(linkPara(container, '/solicitacoes', { status: 'APROVADA' })).toHaveTextContent('14');
    expect(screen.getByText('req-listas')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Tentar novamente' })).toHaveLength(1);
  });

  it('RF-04: solicitante — falha no em andamento → "Seus números" visível e erro só nesse bloco', async () => {
    await renderizar(ANA, { emAndamento: falha('req-andamento') });

    expect(screen.getByRole('heading', { name: /^Seus números/ })).toBeInTheDocument();
    expect(screen.getByText('req-andamento')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Tentar novamente' })).toHaveLength(1);
  });

  it('RF-04: analista — falha só no resumo → listas visíveis e erro com o requestId no bloco do resumo', async () => {
    const pessoaUsuaria = userEvent.setup();
    await renderizar(CARLA, { resumo: falha('req-resumo') });

    const fila = secaoDo(/^Fila de análise\s+10$/);
    expect(within(fila).getByText('Integração do site com o CRM parou')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Minhas análises\s+4$/ })).toBeInTheDocument();
    expect(screen.getByText('req-resumo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();

    const tentar = screen.getAllByRole('button', { name: 'Tentar novamente' });
    expect(tentar).toHaveLength(1);
    await pessoaUsuaria.click(tentar[0]!);
    expect(roteador.refresh).toHaveBeenCalledTimes(1);
  });

  it('RF-04: admin — falha só no resumo → listas visíveis e erro no bloco do resumo', async () => {
    await renderizar(DIEGO, { resumo: falha('req-resumo') });

    expect(
      within(secaoDo('Fila de análise')).getByText('Servidor de arquivos fora do ar'),
    ).toBeTruthy();
    expect(screen.getByText('req-resumo')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Tentar novamente' })).toHaveLength(1);
  });

  it('RF-04: a rota não tem loading.tsx próprio (ele seguraria o cabeçalho; os esqueletos são por bloco)', () => {
    expect(existsSync(path.join(import.meta.dirname, 'loading.tsx'))).toBe(false);
  });
});
