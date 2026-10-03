import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { esperarHref, linkPara, prepararDom } from '@/test/dom';
import { ANA, CARLA, item, pessoa, resumo, solicitacao, type Usuario } from '@/test/fabricas';
import { ConteudoDashboard } from './conteudo-dashboard';

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

function renderizar(
  usuario: Usuario,
  dados: Partial<Parameters<typeof ConteudoDashboard>[0]> = {},
) {
  const analista = usuario.cargo !== 'SOLICITANTE';
  return render(
    <ConteudoDashboard
      usuario={usuario}
      resumo={resumo({ escopo: analista ? 'GERAL' : 'PROPRIAS' })}
      fila={analista ? FILA : []}
      minhasAnalises={analista ? MINHAS_ANALISES : []}
      ultimas={analista ? [] : ULTIMAS}
      {...dados}
    />,
  );
}

describe('RF-04: dashboard', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('RF-04: analista vê "Visão geral" e o botão "Nova solicitação"', () => {
    renderizar(CARLA);

    expect(screen.getByRole('heading', { name: 'Visão geral' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
  });

  it('RF-04/RN-13: solicitante vê "Suas solicitações"', () => {
    renderizar(ANA);

    expect(screen.getByRole('heading', { name: 'Suas solicitações' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Visão geral' })).toBeNull();
  });

  it('RF-04: o total aparece no destaque', () => {
    renderizar(CARLA);
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
  });

  it.each([
    ['ABERTA', 'Abertas', '12', '30%'],
    ['EM_ANALISE', 'Em análise', '8', '20%'],
    ['APROVADA', 'Aprovadas', '14', '35%'],
    ['REJEITADA', 'Rejeitadas', '6', '15%'],
  ])(
    'RF-04: bloco %s é um link para a lista filtrada, com nome, número e percentual inteiro',
    (status, nome, numero, percentual) => {
      const { container } = renderizar(CARLA);

      const bloco = linkPara(container, '/solicitacoes', { status });
      expect(bloco, `bloco ${status}`).toBeTruthy();
      expect(bloco).toHaveTextContent(nome);
      expect(bloco).toHaveTextContent(numero);
      expect(bloco).toHaveTextContent(percentual);
    },
  );

  it('RF-04: percentuais sem casas decimais', () => {
    const { container } = renderizar(CARLA, {
      resumo: resumo({
        total: 3,
        porStatus: { ABERTA: 1, EM_ANALISE: 1, APROVADA: 1, REJEITADA: 0 },
        porPrioridade: { BAIXA: 1, MEDIA: 1, ALTA: 1 },
      }),
    });

    expect(linkPara(container, '/solicitacoes', { status: 'ABERTA' })).toHaveTextContent('33%');
    expect(linkPara(container, '/solicitacoes', { status: 'REJEITADA' })).toHaveTextContent('0%');
    expect(container).not.toHaveTextContent(/33[,.]3/);
  });

  it('RF-04: gráfico por prioridade com o valor escrito e um link por prioridade', () => {
    const { container } = renderizar(CARLA);

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

  it('RF-04: destaque do analista mostra a fila de alta e leva para "Ver a fila"', () => {
    renderizar(CARLA);

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
    renderizar(CARLA);

    await pessoaUsuaria.click(screen.getByRole('button', { name: 'Iniciar a próxima' }));

    await waitFor(() => expect(acoes.iniciarAnalise).toHaveBeenCalledWith(FILA[0]!.id));
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith(`/solicitacoes/${FILA[0]!.id}`));
  });

  it('RF-04: "Iniciar a próxima" some com a fila vazia', () => {
    renderizar(CARLA, {
      fila: [],
      resumo: resumo({
        porStatus: { ABERTA: 0, EM_ANALISE: 8, APROVADA: 14, REJEITADA: 6 },
        total: 28,
        filaAlta: 0,
        aberturaMaisAntiga: null,
      }),
    });

    expect(screen.queryByRole('button', { name: 'Iniciar a próxima' })).toBeNull();
  });

  it('RN-04/RN-07: "Fila de análise" tem "Iniciar análise" em cada item, menos nos do próprio usuário', () => {
    renderizar(CARLA);

    const titulo = screen.getByRole('heading', { name: 'Fila de análise' });
    const secao = titulo.closest('section') ?? titulo.parentElement!;
    expect(within(secao).getByText('Servidor de arquivos fora do ar')).toBeInTheDocument();
    expect(within(secao).getByText('Licença do editor de planilhas')).toBeInTheDocument();
    expect(within(secao).getAllByRole('button', { name: 'Iniciar análise' })).toHaveLength(1);
  });

  it('RF-04: analista vê "Minhas análises em andamento"', () => {
    renderizar(CARLA);

    const titulo = screen.getByRole('heading', { name: 'Minhas análises em andamento' });
    const secao = titulo.closest('section') ?? titulo.parentElement!;
    expect(within(secao).getByText('Novo usuário no ERP')).toBeInTheDocument();
  });

  it('RF-04: solicitante vê "Minhas últimas solicitações" com o status e não vê a fila', () => {
    renderizar(ANA);

    const titulo = screen.getByRole('heading', { name: 'Minhas últimas solicitações' });
    const secao = titulo.closest('section') ?? titulo.parentElement!;
    expect(within(secao).getByText('Cadeira ergonômica')).toBeInTheDocument();
    expect(secao).toHaveTextContent('Aprovada');
    expect(secao).toHaveTextContent('Rejeitada');
    expect(screen.queryByRole('heading', { name: 'Fila de análise' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Iniciar a próxima' })).toBeNull();
  });

  it('RF-04: solicitante tem "Ver a mais recente" levando ao detalhe da última', () => {
    renderizar(ANA);

    esperarHref(
      screen.getByRole('link', { name: 'Ver a mais recente' }),
      `/solicitacoes/${ULTIMAS[0]!.id}`,
    );
  });

  it('RF-04: sem solicitações → "Você ainda não tem solicitações" e "Criar a primeira"', () => {
    renderizar(ANA, {
      resumo: resumo({
        escopo: 'PROPRIAS',
        total: 0,
        porStatus: { ABERTA: 0, EM_ANALISE: 0, APROVADA: 0, REJEITADA: 0 },
        porPrioridade: { BAIXA: 0, MEDIA: 0, ALTA: 0 },
        filaAlta: 0,
        aberturaMaisAntiga: null,
      }),
      ultimas: [],
    });

    expect(screen.getByText('Você ainda não tem solicitações')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar a primeira' })).toBeInTheDocument();
  });
});
