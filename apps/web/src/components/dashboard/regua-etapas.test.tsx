import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Status } from '@/test/fabricas';
import { ReguaEtapas } from './regua-etapas';

/*
 * Régua de etapas do "Em andamento" do solicitante (Fase 3.5, PR 4B): Aberta → Em análise →
 * Decisão em pontos ligados por uma linha. Para o leitor de tela, a lista diz a etapa atual no
 * nome acessível e marca o item atual com aria-current="step" (o ponto e o halo são visuais).
 */

describe('RF-04: régua de etapas', () => {
  it('RF-04: mostra as três etapas na ordem', () => {
    render(<ReguaEtapas status="ABERTA" />);

    const regua = screen.getByRole('list', { name: /^Etapa atual: / });
    const etapas = within(regua).getAllByRole('listitem');
    expect(etapas.map((etapa) => etapa.textContent?.trim())).toEqual([
      'Aberta',
      'Em análise',
      'Decisão',
    ]);
  });

  it.each<[Status, string]>([
    ['ABERTA', 'Aberta'],
    ['EM_ANALISE', 'Em análise'],
    ['APROVADA', 'Decisão'],
    ['REJEITADA', 'Decisão'],
  ])(
    'RF-04: status %s → aria-label "Etapa atual: %s" e só ela com aria-current',
    (status, etapa) => {
      render(<ReguaEtapas status={status} />);

      const regua = screen.getByRole('list', { name: `Etapa atual: ${etapa}` });
      const atuais = within(regua)
        .getAllByRole('listitem')
        .filter((item) => item.getAttribute('aria-current') === 'step');
      expect(atuais).toHaveLength(1);
      expect(atuais[0]).toHaveTextContent(etapa);
    },
  );
});
