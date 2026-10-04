import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepararDom } from '@/test/dom';
import { AbasSeuTrabalho } from './abas-seu-trabalho';

/*
 * "Seu trabalho" no celular (Fase 3.5, PR 4B): as duas listas do analista viram abas Radix
 * "Minhas análises N | Fila N". A aba inicial é Minhas análises quando ela tem itens; senão, Fila.
 * Os totais são os meta.total das duas consultas (revisão de 04/10/2026).
 */

function renderizar(totalMinhasAnalises: number, totalFila: number) {
  return render(
    <AbasSeuTrabalho
      totalMinhasAnalises={totalMinhasAnalises}
      totalFila={totalFila}
      minhasAnalises={<p>Conteúdo de minhas análises</p>}
      fila={<p>Conteúdo da fila</p>}
    />,
  );
}

const abaMinhas = (n: number) =>
  screen.getByRole('tab', { name: new RegExp(`^Minhas análises\\s+${n}$`) });
const abaFila = (n: number) => screen.getByRole('tab', { name: new RegExp(`^Fila\\s+${n}$`) });

/**
 * Painel da aba selecionada (pelo aria-controls). Não usa getByRole('tabpanel') porque, no
 * desktop, os dois painéis podem ficar no DOM (forceMount) e aparecer lado a lado pelo CSS.
 */
function painelAtivo(): HTMLElement {
  const selecionada = screen
    .getAllByRole('tab')
    .find((aba) => aba.getAttribute('aria-selected') === 'true');
  const painel = document.getElementById(selecionada?.getAttribute('aria-controls') ?? '');
  expect(painel, 'painel da aba selecionada').toBeTruthy();
  return painel!;
}

describe('RF-04: abas de "Seu trabalho" no celular', () => {
  beforeAll(() => {
    prepararDom();
  });

  it('RF-04: as abas mostram os totais "Minhas análises N" e "Fila N"', () => {
    renderizar(4, 10);

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(abaMinhas(4)).toBeInTheDocument();
    expect(abaFila(10)).toBeInTheDocument();
  });

  it('RF-04: com análises em andamento, a aba inicial é Minhas análises', () => {
    renderizar(4, 10);

    expect(abaMinhas(4)).toHaveAttribute('aria-selected', 'true');
    expect(abaFila(10)).toHaveAttribute('aria-selected', 'false');
    expect(painelAtivo()).toHaveTextContent('Conteúdo de minhas análises');
  });

  it('RF-04: sem análises em andamento, a aba inicial é Fila', () => {
    renderizar(0, 10);

    expect(abaFila(10)).toHaveAttribute('aria-selected', 'true');
    expect(abaMinhas(0)).toHaveAttribute('aria-selected', 'false');
    expect(painelAtivo()).toHaveTextContent('Conteúdo da fila');
  });

  it('RF-04: trocar de aba troca o conteúdo', async () => {
    const pessoaUsuaria = userEvent.setup();
    renderizar(4, 10);

    await pessoaUsuaria.click(abaFila(10));
    expect(abaFila(10)).toHaveAttribute('aria-selected', 'true');
    expect(painelAtivo()).toHaveTextContent('Conteúdo da fila');

    await pessoaUsuaria.click(abaMinhas(4));
    expect(painelAtivo()).toHaveTextContent('Conteúdo de minhas análises');
  });
});
