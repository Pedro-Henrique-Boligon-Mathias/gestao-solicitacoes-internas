import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { lerFiltros } from '@/features/solicitacoes/filtros';
import { lerUrl, paramsComoObjeto, prepararDom } from '@/test/dom';
import { resumo } from '@/test/fabricas';
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

/** Renderiza a barra com os filtros lidos da query (a mesma que o useSearchParams devolve). */
function renderizar(query = '') {
  busca.atual = query;
  const filtros = lerFiltros(new URLSearchParams(query));
  return render(<BarraFiltros filtros={filtros} resumo={resumo()} />);
}

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
});
