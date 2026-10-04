import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { esperarHref } from '@/test/dom';
import { AREA_JURIDICO, AREAS, AREAS_SEED, areaGestao, type AreaGestao } from '@/test/fabricas';
import { PorArea } from './por-area';

/*
 * "Por área" do painel de gestão (Fase 3.5, PR 4C): total e os 4 status de cada área, e cada
 * linha leva à lista filtrada pela área (?area=<id>, sem o período: a lista não tem esse filtro).
 * As áreas zeradas no período ficam juntas numa linha de rodapé, em vez de linhas com zeros.
 */

function renderizar(areas: AreaGestao[] = AREAS_SEED) {
  render(<PorArea areas={areas} />);
  const titulo = screen.getByRole('heading', { name: /^Por área/ });
  return (titulo.closest('section') ?? titulo.parentElement)!;
}

const area = (nome: string) => AREAS.find((a) => a.nome === nome)!;
const linkDa = (secao: HTMLElement, nome: string) =>
  within(secao).queryByRole('link', { name: new RegExp(`^${nome}`) });

describe('RF-04/RN-13: Por área', () => {
  it('RF-04: uma linha por área com solicitação, na ordem da API, com total e os 4 status', () => {
    const secao = renderizar();

    const links = within(secao).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('Financeiro'),
      expect.stringContaining('Comercial'),
      expect.stringContaining('Recursos Humanos'),
      expect.stringContaining('Tecnologia'),
    ]);
    // Financeiro: 11 no total, 2 abertas, 2 em análise, 5 aprovadas, 2 rejeitadas
    const financeiro = links[0]!.closest('tr, li, [role="row"]') ?? links[0]!;
    expect(financeiro).toHaveTextContent('11');
    expect(financeiro).toHaveTextContent('5');
  });

  it('RF-04: cada linha leva à lista filtrada pela área, sem levar o período', () => {
    const secao = renderizar();

    for (const nome of ['Financeiro', 'Comercial', 'Recursos Humanos', 'Tecnologia']) {
      esperarHref(linkDa(secao, nome), '/solicitacoes', { area: area(nome).id });
    }
  });

  it('RF-04: áreas zeradas vão juntas para o rodapé, sem linha e sem link', () => {
    const secao = renderizar();

    expect(secao).toHaveTextContent('Sem solicitações no período: Jurídico e Operações.');
    expect(linkDa(secao, 'Jurídico')).toBeNull();
    expect(linkDa(secao, 'Operações')).toBeNull();
  });

  it('RF-04: com uma só área zerada, o rodapé cita só ela', () => {
    const secao = renderizar([...AREAS_SEED.slice(0, 4), areaGestao(AREA_JURIDICO)]);

    expect(secao).toHaveTextContent('Sem solicitações no período: Jurídico.');
  });

  it('RF-04: sem áreas zeradas, não há rodapé', () => {
    const secao = renderizar(AREAS_SEED.slice(0, 4));

    expect(secao).not.toHaveTextContent('Sem solicitações no período');
  });

  it('RF-04: todas as áreas zeradas → "Nenhuma solicitação no período", sem linhas', () => {
    const secao = renderizar(AREAS_SEED.map((a) => areaGestao(a.area)));

    expect(secao).toHaveTextContent('Nenhuma solicitação no período');
    expect(secao).toHaveTextContent('Escolha um período maior no seletor acima.');
    expect(within(secao).queryAllByRole('link')).toHaveLength(0);
  });
});
