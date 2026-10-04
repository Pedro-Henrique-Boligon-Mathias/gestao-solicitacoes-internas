import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { esperarHref } from '@/test/dom';
import { ANA, CARLA, DIEGO, item, type Usuario } from '@/test/fabricas';
import { CardSolicitacao } from './card-solicitacao';

/*
 * Card da lista no celular (Fase 3.5, PR 4A): código e data relativa → título → área · solicitante
 * → selos de status e prioridade. O card inteiro é um link para o detalhe. O solicitante só vê as
 * próprias (RN-13), então o nome dele não aparece no card.
 */

const BRUNO = { id: '6a1f0c2e-0000-4000-8000-000000000004', nome: 'Bruno Lima' };

const ITEM = item({
  id: 'c0000000-0000-4000-8000-000000000040',
  codigo: 'SOL-000040',
  titulo: 'Folha de pagamento não calcula horas extras',
  prioridade: 'ALTA',
  status: 'ABERTA',
  solicitante: BRUNO,
  area: { id: 'a0000000-0000-4000-8000-000000000004', nome: 'Recursos Humanos' },
  dataSolicitacao: '2026-10-01T13:00:00.000Z',
});

function renderizar(usuario: Usuario, dados = ITEM) {
  return render(<CardSolicitacao item={dados} usuario={usuario} />);
}

/** Posição do primeiro trecho que casa com o padrão no texto do card (-1 se não houver). */
function posicao(texto: string, padrao: RegExp): number {
  return texto.search(padrao);
}

describe('RF-02: card da lista no celular', () => {
  beforeEach(() => {
    // "Agora" fixo para a data relativa: dois dias depois da abertura
    vi.useFakeTimers({ now: new Date('2026-10-03T13:00:00.000Z'), toFake: ['Date'] });
  });

  afterEach(() => vi.useRealTimers());

  it('RF-02: o card inteiro é um único link para o detalhe, com todos os dados dentro', () => {
    renderizar(CARLA);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    const card = links[0]!;
    esperarHref(card, '/solicitacoes/c0000000-0000-4000-8000-000000000040');
    expect(card).toHaveTextContent('SOL-000040');
    expect(card).toHaveTextContent('Folha de pagamento não calcula horas extras');
    expect(card).toHaveTextContent('Recursos Humanos');
    expect(card).toHaveTextContent('Aberta');
    expect(card).toHaveTextContent('Alta');
  });

  it('RF-02: ordem dos campos: código e data relativa → título → área · solicitante → selos', () => {
    renderizar(CARLA);

    const texto = screen.getByRole('link').textContent ?? '';
    const ordem = [
      posicao(texto, /SOL-000040/),
      posicao(texto, /há 2 dias/),
      posicao(texto, /Folha de pagamento não calcula horas extras/),
      posicao(texto, /Recursos Humanos\s*·\s*Bruno Lima/),
      posicao(texto, /Aberta/),
      posicao(texto, /Alta/),
    ];
    expect(ordem, `texto do card: "${texto}"`).not.toContain(-1);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });

  it('RF-02: a data relativa traz a data completa no title', () => {
    renderizar(CARLA);

    const data = within(screen.getByRole('link')).getByText('há 2 dias');
    expect(data).toHaveAttribute('dateTime', '2026-10-01T13:00:00.000Z');
    expect(data).toHaveAttribute('title', '01/10/2026 10:00');
  });

  it.each([
    ['ANALISTA', CARLA],
    ['ADMIN', DIEGO],
  ] as const)('RN-13: para %s, o card mostra quem abriu a solicitação', (_cargo, usuario) => {
    renderizar(usuario);

    expect(screen.getByRole('link')).toHaveTextContent(/Recursos Humanos\s*·\s*Bruno Lima/);
  });

  it('RN-13: para o próprio solicitante, o card mostra só a área, sem o nome dele', () => {
    renderizar(
      ANA,
      item({
        ...ITEM,
        solicitante: { id: ANA.id, nome: ANA.nome },
        area: ANA.area,
      }),
    );

    const card = screen.getByRole('link');
    expect(card).toHaveTextContent('Financeiro');
    expect(card).not.toHaveTextContent('Ana Souza');
    expect(card).not.toHaveTextContent(/Financeiro\s*·/);
  });
});
