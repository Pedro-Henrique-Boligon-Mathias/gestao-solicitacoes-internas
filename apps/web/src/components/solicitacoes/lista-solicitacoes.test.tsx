import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { lerFiltros } from '@/features/solicitacoes/filtros';
import { esperarHref, prepararDom } from '@/test/dom';
import { ANA, CARLA, item, pagina, pessoa, type Usuario } from '@/test/fabricas';
import { EstadoErro } from '@/components/estado-erro';
import { ListaSolicitacoes } from './lista-solicitacoes';

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

const ITENS = [
  item({
    id: 'c0000000-0000-4000-8000-000000000042',
    codigo: 'SOL-000042',
    titulo: 'Acesso ao sistema de folha',
    prioridade: 'ALTA',
    status: 'EM_ANALISE',
    solicitante: pessoa(ANA),
  }),
  item({
    id: 'c0000000-0000-4000-8000-000000000041',
    codigo: 'SOL-000041',
    titulo: 'Troca de monitor',
    prioridade: 'BAIXA',
    status: 'ABERTA',
    solicitante: { id: 'outro', nome: 'Bruno Alves' },
  }),
];

function renderizar(usuario: Usuario, itens = ITENS, query = '', meta = {}) {
  return render(
    <ListaSolicitacoes
      pagina={pagina(itens, meta)}
      filtros={lerFiltros(new URLSearchParams(query))}
      usuario={usuario}
    />,
  );
}

describe('RF-02: lista de solicitações', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('RF-02: a tabela mostra Código, Título, Área, Solicitante, Prioridade, Status e Data para o analista', () => {
    renderizar(CARLA);

    const tabela = screen.getByRole('table');
    const cabecalhos = within(tabela)
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim());
    expect(cabecalhos).toEqual(
      expect.arrayContaining([
        'Código',
        'Título',
        'Área',
        'Solicitante',
        'Prioridade',
        'Status',
        'Data',
      ]),
    );
    expect(within(tabela).getByText('Bruno Alves')).toBeInTheDocument();
  });

  it('RN-13: a coluna Solicitante fica escondida para o solicitante', () => {
    renderizar(ANA, [ITENS[0]!]);

    const tabela = screen.getByRole('table');
    expect(within(tabela).queryByRole('columnheader', { name: 'Solicitante' })).toBeNull();
    expect(within(tabela).queryByText('Ana Souza')).toBeNull();
  });

  it('RF-02: cada linha mostra código, selos com texto e leva ao detalhe pelo título', () => {
    renderizar(CARLA);

    const tabela = screen.getByRole('table');
    const linha = within(tabela).getByText('SOL-000042').closest('tr')!;
    expect(linha).toHaveTextContent('Em análise');
    expect(linha).toHaveTextContent('Alta');
    expect(linha).toHaveTextContent('Financeiro');
    esperarHref(
      within(tabela).getByRole('link', { name: 'Acesso ao sistema de folha' }),
      '/solicitacoes/c0000000-0000-4000-8000-000000000042',
    );
    esperarHref(
      within(tabela).getByRole('link', { name: 'Troca de monitor' }),
      '/solicitacoes/c0000000-0000-4000-8000-000000000041',
    );
  });

  it('RF-02: paginação mostra o total e leva para a página anterior e a próxima mantendo os filtros', () => {
    renderizar(CARLA, ITENS, 'status=ABERTA&page=2', {
      page: 2,
      total: 42,
      totalPages: 3,
    });

    expect(screen.getByText(/42 solicitações/)).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 3/)).toBeInTheDocument();
    esperarHref(screen.getByRole('link', { name: /próxima/i }), '/solicitacoes', {
      status: 'ABERTA',
      page: '3',
    });
    esperarHref(screen.getByRole('link', { name: /anterior/i }), '/solicitacoes', {
      status: 'ABERTA',
    });
  });

  it('RF-02: vazio sem filtro → "Nenhuma solicitação ainda" com "Nova solicitação"', () => {
    renderizar(ANA, []);

    expect(screen.getByText('Nenhuma solicitação ainda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma solicitação encontrada')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('RF-02: vazio com filtro → "Nenhuma solicitação encontrada" com "Limpar filtros"', () => {
    renderizar(ANA, [], 'q=impressora&status=APROVADA');

    expect(screen.getByText('Nenhuma solicitação encontrada')).toBeInTheDocument();
    const limpar =
      screen.queryByRole('link', { name: 'Limpar filtros' }) ??
      screen.getByRole('button', { name: 'Limpar filtros' });
    if (limpar.tagName === 'A') esperarHref(limpar, '/solicitacoes');
    expect(screen.queryByText('Nenhuma solicitação ainda')).toBeNull();
  });
});

describe('Estado de erro (API falhou)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('RF-02: mostra mensagem amigável e o requestId como código para o suporte', () => {
    render(<EstadoErro requestId="req-7f3a" />);

    expect(screen.getByText(/código para o suporte/i)).toBeInTheDocument();
    expect(screen.getByText(/req-7f3a/)).toBeInTheDocument();
  });

  it('RF-02: "Tentar novamente" recarrega os dados da página', async () => {
    const pessoaUsuaria = userEvent.setup();
    render(<EstadoErro requestId="req-7f3a" />);

    await pessoaUsuaria.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(roteador.refresh).toHaveBeenCalledTimes(1);
  });

  it('RF-02: com aoTentarNovamente (error boundary), chama a função recebida', async () => {
    const pessoaUsuaria = userEvent.setup();
    const aoTentarNovamente = vi.fn();
    render(<EstadoErro requestId="abc123" aoTentarNovamente={aoTentarNovamente} />);

    await pessoaUsuaria.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(aoTentarNovamente).toHaveBeenCalledTimes(1);
  });
});
