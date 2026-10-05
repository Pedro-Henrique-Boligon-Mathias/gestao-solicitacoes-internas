import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { lerUrl, prepararDom } from '@/test/dom';
import { SeletorPeriodo } from './seletor-periodo';

/*
 * Seletor de período (Fase 3.5, PR 4C), no cabeçalho dos três dashboards: botão em pílula com
 * "Período" e o valor; as opções Hoje, Últimos 7 dias, Últimos 30 dias e Tudo, cada uma com o
 * intervalo de datas. A escolha vai para ?periodo= na URL. No desktop abre um popover; no
 * celular (até 760px, pelo matchMedia) abre uma folha com "Fechar".
 */

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
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(busca.atual),
}));

/** 04/10/2026 09:42 em São Paulo. */
const AGORA = new Date('2026-10-04T12:42:00.000Z');

/** Simula a largura da tela: o celular é o que casa com (max-width: 760px). */
function simularTela(celular: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((consulta: string) => ({
      matches: celular && consulta.includes('max-width'),
      media: consulta,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/** Destino da última navegação (push ou replace). */
function ultimoDestino(): string {
  const chamadas = [...roteador.push.mock.calls, ...roteador.replace.mock.calls];
  expect(chamadas.length, 'navegou para o novo período').toBeGreaterThan(0);
  return String(chamadas.at(-1)![0]);
}

const gatilho = (rotulo: string) =>
  screen.getByRole('button', { name: new RegExp(`^Período:? ${rotulo}$`) });

async function abrir(rotulo = 'Tudo') {
  const pessoa = userEvent.setup();
  await pessoa.click(gatilho(rotulo));
  const painel = await screen.findByRole('dialog', { name: /Período/ });
  return { pessoa, painel };
}

beforeAll(() => {
  prepararDom();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
  busca.atual = '';
  simularTela(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('RF-04: seletor de período', () => {
  it.each([
    ['tudo', 'Tudo'],
    ['hoje', 'Hoje'],
    ['7d', 'Últimos 7 dias'],
    ['30d', 'Últimos 30 dias'],
  ] as const)('RF-04: com %s, o botão diz "Período %s"', (periodo, rotulo) => {
    render(<SeletorPeriodo periodo={periodo} />);

    expect(gatilho(rotulo)).toBeInTheDocument();
  });

  it('RF-04: abre as quatro opções, em ordem, cada uma com o intervalo de datas', async () => {
    render(<SeletorPeriodo periodo="tudo" />);
    const { painel } = await abrir();

    const opcoes = within(painel).getAllByRole('radio');
    expect(opcoes).toHaveLength(4);
    expect(opcoes[0]).toHaveAccessibleName(/^Hoje/);
    expect(opcoes[0]).toHaveTextContent('04/10');
    expect(opcoes[1]).toHaveAccessibleName(/^Últimos 7 dias/);
    expect(opcoes[1]).toHaveTextContent('27/09 a 04/10');
    expect(opcoes[2]).toHaveAccessibleName(/^Últimos 30 dias/);
    expect(opcoes[2]).toHaveTextContent('04/09 a 04/10');
    expect(opcoes[3]).toHaveAccessibleName(/^Tudo/);
  });

  it('RF-04: a opção atual vem marcada', async () => {
    render(<SeletorPeriodo periodo="30d" />);
    const { painel } = await abrir('Últimos 30 dias');

    expect(within(painel).getByRole('radio', { name: /^Últimos 30 dias/ })).toBeChecked();
    expect(within(painel).getByRole('radio', { name: /^Tudo/ })).not.toBeChecked();
  });

  it('RF-04: escolher "Últimos 7 dias" grava ?periodo=7d na URL do dashboard e fecha', async () => {
    render(<SeletorPeriodo periodo="tudo" />);
    const { pessoa, painel } = await abrir();

    await pessoa.click(within(painel).getByRole('radio', { name: /^Últimos 7 dias/ }));

    const { caminho, params } = lerUrl(ultimoDestino());
    expect(caminho).toBe('/dashboard');
    expect(params.get('periodo')).toBe('7d');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('RF-04: escolher "Hoje" grava ?periodo=hoje', async () => {
    render(<SeletorPeriodo periodo="tudo" />);
    const { pessoa, painel } = await abrir();

    await pessoa.click(within(painel).getByRole('radio', { name: /^Hoje/ }));

    expect(lerUrl(ultimoDestino()).params.get('periodo')).toBe('hoje');
  });

  it('RF-04: voltar para "Tudo" tira o filtro da URL (sem ?periodo= ou com periodo=tudo)', async () => {
    busca.atual = 'periodo=7d';
    render(<SeletorPeriodo periodo="7d" />);
    const { pessoa, painel } = await abrir('Últimos 7 dias');

    await pessoa.click(within(painel).getByRole('radio', { name: /^Tudo/ }));

    expect([null, 'tudo']).toContain(lerUrl(ultimoDestino()).params.get('periodo'));
  });

  it('RF-04: no desktop as opções abrem num popover, sem o "Fechar" da folha', async () => {
    simularTela(false);
    render(<SeletorPeriodo periodo="tudo" />);
    const { painel } = await abrir();

    expect(within(painel).getAllByRole('radio')).toHaveLength(4);
    expect(within(painel).queryByRole('button', { name: 'Fechar' })).toBeNull();
  });

  it('RF-04: no celular as opções abrem numa folha com "Fechar", que fecha sem mudar o período', async () => {
    simularTela(true);
    render(<SeletorPeriodo periodo="tudo" />);
    const { pessoa, painel } = await abrir();

    expect(within(painel).getAllByRole('radio')).toHaveLength(4);
    await pessoa.click(within(painel).getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(roteador.push).not.toHaveBeenCalled();
    expect(roteador.replace).not.toHaveBeenCalled();
  });

  it('RF-04: no celular, escolher uma opção na folha também grava ?periodo=', async () => {
    simularTela(true);
    render(<SeletorPeriodo periodo="tudo" />);
    const { pessoa, painel } = await abrir();

    await pessoa.click(within(painel).getByRole('radio', { name: /^Últimos 30 dias/ }));

    expect(lerUrl(ultimoDestino()).params.get('periodo')).toBe('30d');
  });
});

describe('RF-04: teclado no seletor de período', () => {
  const opcao = (painel: HTMLElement, nome: RegExp) =>
    within(painel).getByRole('radio', { name: nome });

  it('RF-04: ao abrir, o foco vai para a opção marcada, a única que entra no Tab', async () => {
    render(<SeletorPeriodo periodo="7d" />);
    const { painel } = await abrir('Últimos 7 dias');

    const marcada = opcao(painel, /^Últimos 7 dias/);
    await waitFor(() => expect(marcada).toHaveFocus());
    for (const radio of within(painel).getAllByRole('radio')) {
      expect(radio).toHaveAttribute('tabindex', radio === marcada ? '0' : '-1');
    }
  });

  it('RF-04: ↓ e ↑ movem o foco em círculo, sem escolher', async () => {
    render(<SeletorPeriodo periodo="tudo" />);
    const { pessoa, painel } = await abrir();
    await waitFor(() => expect(opcao(painel, /^Tudo/)).toHaveFocus());

    await pessoa.keyboard('{ArrowDown}');
    expect(opcao(painel, /^Hoje/)).toHaveFocus();
    await pessoa.keyboard('{ArrowDown}');
    expect(opcao(painel, /^Últimos 7 dias/)).toHaveFocus();
    await pessoa.keyboard('{ArrowUp}{ArrowUp}');
    expect(opcao(painel, /^Tudo/)).toHaveFocus();
    await pessoa.keyboard('{ArrowRight}');
    expect(opcao(painel, /^Hoje/)).toHaveFocus();
    await pessoa.keyboard('{ArrowLeft}');
    expect(opcao(painel, /^Tudo/)).toHaveFocus();

    expect(roteador.push).not.toHaveBeenCalled();
    expect(roteador.replace).not.toHaveBeenCalled();
    expect(opcao(painel, /^Tudo/)).toBeChecked();
  });

  it('RF-04: Home e End vão à primeira e à última opção', async () => {
    render(<SeletorPeriodo periodo="7d" />);
    const { pessoa, painel } = await abrir('Últimos 7 dias');
    await waitFor(() => expect(opcao(painel, /^Últimos 7 dias/)).toHaveFocus());

    await pessoa.keyboard('{End}');
    expect(opcao(painel, /^Tudo/)).toHaveFocus();
    await pessoa.keyboard('{Home}');
    expect(opcao(painel, /^Hoje/)).toHaveFocus();
  });

  it.each([
    ['Enter', '{Enter}'],
    ['Espaço', ' '],
  ])('RF-04: %s escolhe a opção em foco', async (_nome, tecla) => {
    render(<SeletorPeriodo periodo="tudo" />);
    const { pessoa, painel } = await abrir();
    await waitFor(() => expect(opcao(painel, /^Tudo/)).toHaveFocus());

    await pessoa.keyboard('{ArrowDown}{ArrowDown}');
    await pessoa.keyboard(tecla);

    expect(lerUrl(ultimoDestino()).params.get('periodo')).toBe('7d');
  });

  it('RF-04: no celular, as setas também movem o foco na folha', async () => {
    simularTela(true);
    render(<SeletorPeriodo periodo="tudo" />);
    const { pessoa, painel } = await abrir();
    await waitFor(() => expect(opcao(painel, /^Tudo/)).toHaveFocus());

    await pessoa.keyboard('{ArrowDown}');
    expect(opcao(painel, /^Hoje/)).toHaveFocus();
  });
});
