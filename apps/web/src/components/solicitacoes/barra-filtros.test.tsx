import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { lerFiltros } from '@/features/solicitacoes/filtros';
import { lerUrl, paramsComoObjeto, prepararDom } from '@/test/dom';
import { AREAS, resumo, type Area } from '@/test/fabricas';
import { BarraFiltros } from './barra-filtros';

const roteador = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}));
const busca = vi.hoisted(() => ({ atual: '' }));

vi.mock('next/navigation', () => ({
  useRouter: () => roteador,
  usePathname: () => '/solicitacoes',
  useSearchParams: () => new URLSearchParams(busca.atual),
}));

/**
 * Renderiza a barra com os filtros lidos da query (a mesma que o useSearchParams devolve).
 * `areas` é a lista de GET /areas; a página só passa quando quem vê pode filtrar por área.
 */
function renderizar(query = '', areas?: Area[]) {
  busca.atual = query;
  const filtros = lerFiltros(new URLSearchParams(query));
  return render(<BarraFiltros filtros={filtros} resumo={resumo()} areas={areas} />);
}

const FINANCEIRO = AREAS.find((a) => a.nome === 'Financeiro')!;
const TECNOLOGIA = AREAS.find((a) => a.nome === 'Tecnologia')!;
const grupoArea = () => screen.queryByRole('group', { name: 'Área' });

/** Parâmetros da última navegação feita com router.replace. */
function ultimaUrl(): Record<string, string | string[]> {
  const chamadas = roteador.replace.mock.calls;
  expect(chamadas.length, 'router.replace foi chamado').toBeGreaterThan(0);
  const destino = String(chamadas.at(-1)![0]);
  return paramsComoObjeto(lerUrl(destino).params);
}

describe('RF-02: barra de filtros da lista', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('RF-02: a busca só atualiza ?q= depois de 300 ms sem digitar e volta para a página 1', async () => {
    vi.useFakeTimers();
    const pessoa = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderizar('status=ABERTA&page=3');

    await pessoa.type(screen.getByLabelText(/buscar/i), 'acesso');
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(roteador.replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(roteador.replace).toHaveBeenCalledTimes(1);
    expect(ultimaUrl()).toEqual({ q: 'acesso', status: 'ABERTA' });
  });

  it('RF-02: o total do resumo aparece ao lado do nome de cada chip', () => {
    renderizar();

    expect(screen.getByRole('button', { name: /^Aberta/ })).toHaveTextContent('12');
    expect(screen.getByRole('button', { name: /^Em análise/ })).toHaveTextContent('8');
    expect(screen.getByRole('button', { name: /^Alta/ })).toHaveTextContent('12');
    expect(screen.getByRole('button', { name: /^Média/ })).toHaveTextContent('18');
  });

  it('RF-02: clicar num chip de status inativo acrescenta o status na URL', async () => {
    const pessoa = userEvent.setup();
    renderizar('status=ABERTA');

    const chip = screen.getByRole('button', { name: /^Em análise/ });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await pessoa.click(chip);

    expect(ultimaUrl()).toEqual({ status: ['ABERTA', 'EM_ANALISE'] });
  });

  it('RF-02: clicar num chip ativo remove o status da URL', async () => {
    const pessoa = userEvent.setup();
    renderizar('status=ABERTA&status=EM_ANALISE');

    const chip = screen.getByRole('button', { name: /^Aberta/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await pessoa.click(chip);

    expect(ultimaUrl()).toEqual({ status: 'EM_ANALISE' });
  });

  it('RF-02: chip de prioridade alterna a prioridade na URL', async () => {
    const pessoa = userEvent.setup();
    renderizar();

    await pessoa.click(screen.getByRole('button', { name: /^Alta/ }));

    expect(ultimaUrl()).toEqual({ prioridade: 'ALTA' });
  });

  it('RF-02: "Limpar filtros" não aparece sem filtro ativo', () => {
    renderizar();
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Limpar filtros' })).not.toBeInTheDocument();
  });

  it('RF-02: "Limpar filtros" remove busca, status e prioridade da URL', async () => {
    const pessoa = userEvent.setup();
    renderizar('q=folha&status=ABERTA&prioridade=ALTA&page=2');

    const limpar =
      screen.queryByRole('button', { name: 'Limpar filtros' }) ??
      screen.getByRole('link', { name: 'Limpar filtros' });
    if (limpar.tagName === 'A') {
      expect(paramsComoObjeto(lerUrl(limpar.getAttribute('href') ?? '').params)).toEqual({});
    } else {
      await pessoa.click(limpar);
      expect(ultimaUrl()).toEqual({});
    }
  });

  it.each([
    ['Mais antigas', '', { direcao: 'asc' }],
    ['Prioridade', '', { ordenarPor: 'prioridade' }],
    ['Mais recentes', 'direcao=asc', {}],
  ])('RF-02: ordenação "%s" grava ordenarPor/direcao na URL', async (opcao, inicial, esperado) => {
    const pessoa = userEvent.setup();
    renderizar(inicial);

    await pessoa.selectOptions(screen.getByLabelText(/ordenar/i), opcao);

    expect(ultimaUrl()).toEqual(esperado);
  });

  describe('RF-02: filtro por área', () => {
    it('RF-02: mostra a linha "Área" com um chip por área, sem total', () => {
      renderizar('', AREAS);

      const grupo = grupoArea();
      expect(grupo).toBeInTheDocument();
      for (const area of AREAS) {
        const chip = within(grupo!).getByRole('button', { name: area.nome });
        expect(chip).toHaveAttribute('aria-pressed', 'false');
        expect(chip).toHaveTextContent(new RegExp(`^${area.nome}$`));
      }
      expect(within(grupo!).getAllByRole('button')).toHaveLength(AREAS.length);
    });

    it('RF-02: chip de área marca a área em ?area= e volta para a página 1', async () => {
      const pessoa = userEvent.setup();
      renderizar('status=ABERTA&page=3', AREAS);

      await pessoa.click(within(grupoArea()!).getByRole('button', { name: 'Financeiro' }));

      expect(ultimaUrl()).toEqual({ status: 'ABERTA', area: FINANCEIRO.id });
    });

    it('RF-02: marcar uma segunda área repete ?area= na URL', async () => {
      const pessoa = userEvent.setup();
      renderizar(`area=${FINANCEIRO.id}&page=2`, AREAS);

      const chipFinanceiro = within(grupoArea()!).getByRole('button', { name: 'Financeiro' });
      expect(chipFinanceiro).toHaveAttribute('aria-pressed', 'true');
      await pessoa.click(within(grupoArea()!).getByRole('button', { name: 'Tecnologia' }));

      expect(ultimaUrl()).toEqual({ area: [FINANCEIRO.id, TECNOLOGIA.id] });
    });

    it('RF-02: desmarcar uma área ativa tira só ela da URL', async () => {
      const pessoa = userEvent.setup();
      renderizar(`area=${FINANCEIRO.id}&area=${TECNOLOGIA.id}&page=2`, AREAS);

      await pessoa.click(within(grupoArea()!).getByRole('button', { name: 'Financeiro' }));

      expect(ultimaUrl()).toEqual({ area: TECNOLOGIA.id });
    });

    it('RF-02: "Limpar filtros" aparece só com a área e remove ?area=', async () => {
      const pessoa = userEvent.setup();
      renderizar(`area=${FINANCEIRO.id}`, AREAS);

      await pessoa.click(screen.getByRole('button', { name: 'Limpar filtros' }));

      expect(ultimaUrl()).toEqual({});
    });

    it('RF-02: "Limpar filtros" remove a área junto com os outros filtros', async () => {
      const pessoa = userEvent.setup();
      renderizar(`q=folha&status=ABERTA&area=${FINANCEIRO.id}&area=${TECNOLOGIA.id}&page=2`, AREAS);

      await pessoa.click(screen.getByRole('button', { name: 'Limpar filtros' }));

      expect(ultimaUrl()).toEqual({});
    });

    it.each([
      ['sem a lista de áreas', undefined],
      ['com a lista vazia', []],
    ])('RF-02: %s, a barra renderiza sem a linha de área', (_nome, areas) => {
      renderizar('', areas);

      expect(grupoArea()).toBeNull();
      expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Prioridade' })).toBeInTheDocument();
    });
  });

  /*
   * Celular (Fase 3.5, PR 4A): prioridade, área e ordenação vão para uma folha aberta pelo botão
   * "Filtros", que mostra quantos filtros da folha estão ativos. Busca e chips de status ficam
   * fora da folha, sempre à vista. No jsdom não há media query: o botão existe também no desktop
   * (escondido por CSS) e a folha só entra no DOM quando aberta.
   */
  describe('RF-02: filtros do celular numa folha', () => {
    const botaoFiltros = () => screen.getByRole('button', { name: /^Filtros/ });

    // `null` = sem lista de áreas (um parâmetro padrão trocaria `undefined` pela lista)
    async function abrirFolha(query = '', areas: Area[] | null = AREAS) {
      const pessoa = userEvent.setup();
      renderizar(query, areas ?? undefined);
      await pessoa.click(botaoFiltros());
      const folha = await screen.findByRole('dialog', { name: 'Filtros' });
      return { pessoa, folha };
    }

    it('RF-02: sem filtro da folha ativo, o botão "Filtros" não mostra número', () => {
      renderizar('', AREAS);

      expect(botaoFiltros()).not.toHaveAccessibleName(/\d/);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it.each([
      ['uma prioridade', 'prioridade=ALTA', 1],
      ['prioridade e área', `prioridade=ALTA&area=${AREAS[1]!.id}`, 2],
      [
        'duas prioridades e duas áreas',
        `prioridade=ALTA&prioridade=MEDIA&area=${AREAS[1]!.id}&area=${AREAS[3]!.id}`,
        4,
      ],
      ['ordenação diferente do padrão', 'ordenarPor=prioridade', 1],
    ])('RF-02: com %s (%s), o botão "Filtros" mostra %i', (_caso, query, total) => {
      renderizar(query, AREAS);

      expect(botaoFiltros()).toHaveAccessibleName(new RegExp(`\\b${total}\\b`));
      expect(botaoFiltros()).toHaveTextContent(String(total));
    });

    it('RF-02: busca e status não contam no botão "Filtros" (ficam fora da folha)', () => {
      renderizar('q=folha&status=ABERTA', AREAS);

      expect(botaoFiltros()).not.toHaveAccessibleName(/\d/);
    });

    it('RF-02: a folha traz prioridade, área e ordenação; busca e status ficam fora dela', async () => {
      const { folha } = await abrirFolha();

      expect(within(folha).getByRole('group', { name: 'Prioridade' })).toBeInTheDocument();
      expect(within(folha).getByRole('group', { name: 'Área' })).toBeInTheDocument();
      expect(within(folha).getByLabelText(/ordenar/i)).toBeInTheDocument();
      expect(within(folha).queryByRole('searchbox')).not.toBeInTheDocument();
      expect(within(folha).queryByRole('group', { name: 'Status' })).not.toBeInTheDocument();
      // A busca e os chips de status continuam na barra, fora da folha. Com a folha aberta, o
      // modal esconde o fundo do leitor de tela (aria-hidden), por isso a busca usa hidden: true
      expect(screen.getByRole('searchbox', { name: /buscar/i, hidden: true })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Status', hidden: true })).toBeInTheDocument();
    });

    it('RF-02: sem a lista de áreas, a folha não mostra o grupo "Área"', async () => {
      const { folha } = await abrirFolha('', null);

      expect(within(folha).getByRole('group', { name: 'Prioridade' })).toBeInTheDocument();
      expect(within(folha).queryByRole('group', { name: 'Área' })).not.toBeInTheDocument();
    });

    it('RF-02: a folha mostra os filtros já ativos marcados', async () => {
      const { folha } = await abrirFolha(`prioridade=ALTA&area=${FINANCEIRO.id}`);

      const prioridade = within(folha).getByRole('group', { name: 'Prioridade' });
      expect(within(prioridade).getByRole('button', { name: /^Alta/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const area = within(folha).getByRole('group', { name: 'Área' });
      expect(within(area).getByRole('button', { name: 'Financeiro' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('RF-02: chip de prioridade na folha grava ?prioridade= mantendo busca e status, e volta para a página 1', async () => {
      const { pessoa, folha } = await abrirFolha('q=folha&status=ABERTA&page=2');

      const prioridade = within(folha).getByRole('group', { name: 'Prioridade' });
      await pessoa.click(within(prioridade).getByRole('button', { name: /^Alta/ }));

      expect(ultimaUrl()).toEqual({ q: 'folha', status: 'ABERTA', prioridade: 'ALTA' });
    });

    it('RF-02: chip de área na folha grava ?area=', async () => {
      const { pessoa, folha } = await abrirFolha();

      const area = within(folha).getByRole('group', { name: 'Área' });
      await pessoa.click(within(area).getByRole('button', { name: 'Tecnologia' }));

      expect(ultimaUrl()).toEqual({ area: TECNOLOGIA.id });
    });

    it('RF-02: ordenação na folha grava ordenarPor na URL', async () => {
      const { pessoa, folha } = await abrirFolha();

      await pessoa.selectOptions(within(folha).getByLabelText(/ordenar/i), 'Prioridade');

      expect(ultimaUrl()).toEqual({ ordenarPor: 'prioridade' });
    });

    it('RF-02: Esc fecha a folha e o foco volta para o botão "Filtros"', async () => {
      const { pessoa } = await abrirFolha();

      await pessoa.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(botaoFiltros()).toHaveFocus();
    });
  });
});
