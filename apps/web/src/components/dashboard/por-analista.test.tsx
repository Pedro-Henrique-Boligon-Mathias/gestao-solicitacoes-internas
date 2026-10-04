import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { esperarHref, prepararDom } from '@/test/dom';
import {
  ANALISTAS_SEED,
  CARLA,
  RAFAEL_REF,
  analistaGestao,
  analistasExtras,
  type AnalistaGestao,
} from '@/test/fabricas';
import { PorAnalista } from './por-analista';

/*
 * "Por analista" do painel de gestão (Fase 3.5, PR 4C): com ele agora, decididas no período e
 * taxa de aprovação. No máximo 5 linhas, na ordem da API (mais carregados primeiro); acima de 5,
 * "Ver todos os N analistas" abre um modal com a tabela completa. Cada linha leva à lista
 * filtrada: ?analista=<id>&status=EM_ANALISE. Sem decisões, a taxa é "—", nunca 0%.
 */

beforeAll(() => {
  prepararDom();
});

function renderizar(analistas: AnalistaGestao[] = ANALISTAS_SEED) {
  render(<PorAnalista analistas={analistas} />);
  const titulo = screen.getByRole('heading', { name: /^Por analista/ });
  return (titulo.closest('section') ?? titulo.parentElement)!;
}

const linhaDe = (raiz: HTMLElement, nome: string) => {
  const link = within(raiz).getByRole('link', { name: new RegExp(`^${nome}`) });
  return { link, linha: (link.closest('tr, li, [role="row"]') ?? link) as HTMLElement };
};

describe('RF-04: Por analista', () => {
  it('RF-04: cada analista com o número em análise agora, as decididas e a taxa (seed)', () => {
    const secao = renderizar();

    const carla = linhaDe(secao, 'Carla Mendes').linha;
    expect(carla).toHaveTextContent('4');
    expect(carla).toHaveTextContent('11');
    expect(carla).toHaveTextContent('73%');
    expect(linhaDe(secao, 'Rafael Costa').linha).toHaveTextContent('56%');
    expect(linhaDe(secao, 'Diego Alves').linha).toHaveTextContent('50%');
  });

  it('RF-04: cada linha leva à lista filtrada pelo analista em análise, sem o período', () => {
    const secao = renderizar();

    esperarHref(linhaDe(secao, 'Carla Mendes').link, '/solicitacoes', {
      analista: CARLA.id,
      status: 'EM_ANALISE',
    });
    esperarHref(linhaDe(secao, 'Rafael Costa').link, '/solicitacoes', {
      analista: RAFAEL_REF.id,
      status: 'EM_ANALISE',
    });
  });

  it('RF-04: analista sem decisões no período → taxa "—", nunca 0%', () => {
    const secao = renderizar([analistaGestao({ decididas: 0, aprovadas: 0, taxaAprovacao: null })]);

    const carla = linhaDe(secao, 'Carla Mendes').linha;
    expect(carla).toHaveTextContent('—');
    expect(carla).not.toHaveTextContent('0%');
  });

  it('RF-04: com até 5 analistas, todos aparecem e não há "Ver todos"', () => {
    const secao = renderizar([...ANALISTAS_SEED, ...analistasExtras(2)]);

    expect(within(secao).getAllByRole('link')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /^Ver todos/ })).toBeNull();
  });

  it('RF-04: com 8 analistas, mostra os 5 primeiros (ordem da API) e "Ver todos os 8 analistas"', () => {
    const todos = [...ANALISTAS_SEED, ...analistasExtras(5)];
    const secao = renderizar(todos);

    const links = within(secao).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links.map((l) => l.textContent)).toEqual(
      todos.slice(0, 5).map((a) => expect.stringContaining(a.analista.nome)),
    );
    expect(within(secao).queryByText('Analista Extra 05')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver todos os 8 analistas' })).toBeInTheDocument();
  });

  it('RF-04: "Ver todos" abre um modal com a tabela completa, cada linha com o link filtrado', async () => {
    const todos = [...ANALISTAS_SEED, ...analistasExtras(5)];
    renderizar(todos);
    const pessoa = userEvent.setup();

    await pessoa.click(screen.getByRole('button', { name: 'Ver todos os 8 analistas' }));

    const modal = await screen.findByRole('dialog', { name: /analistas/i });
    expect(within(modal).getByRole('table')).toBeInTheDocument();
    expect(within(modal).getAllByRole('link')).toHaveLength(8);
    const ultimo = todos.at(-1)!;
    esperarHref(linhaDe(modal, ultimo.analista.nome).link, '/solicitacoes', {
      analista: ultimo.analista.id,
      status: 'EM_ANALISE',
    });
  });
});
