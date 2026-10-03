import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodigoSolicitacao } from './codigo-solicitacao';
import { DataRelativa } from './data-relativa';
import { SeloPrioridade } from './selo-prioridade';
import { SeloStatus } from './selo-status';

describe('ADR-013: selos de status e prioridade (nunca só cor)', () => {
  it.each([
    ['ABERTA', 'Aberta'],
    ['EM_ANALISE', 'Em análise'],
    ['APROVADA', 'Aprovada'],
    ['REJEITADA', 'Rejeitada'],
  ] as const)('ADR-013: SeloStatus %s mostra o texto "%s"', (status, rotulo) => {
    const { container } = render(<SeloStatus status={status} />);

    expect(container).toHaveTextContent(rotulo);
    expect(container).not.toHaveTextContent(status);
  });

  it('ADR-013: o ponto colorido do SeloStatus é decorativo (aria-hidden)', () => {
    const { container } = render(<SeloStatus status="APROVADA" />);

    // Tudo que não é texto fica fora da árvore de acessibilidade
    const decorativos = container.querySelectorAll('[data-ponto]');
    expect(decorativos.length).toBeGreaterThan(0);
    for (const decorativo of decorativos) {
      expect(decorativo.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it.each([
    ['BAIXA', 'Baixa', 1],
    ['MEDIA', 'Média', 2],
    ['ALTA', 'Alta', 3],
  ] as const)(
    'ADR-013: SeloPrioridade %s mostra "%s" e o ícone com %i de 3 barras preenchidas',
    (prioridade, rotulo, preenchidas) => {
      const { container } = render(<SeloPrioridade prioridade={prioridade} />);

      expect(container).toHaveTextContent(rotulo);
      const icone = container.querySelector('svg');
      expect(icone).not.toBeNull();
      expect(icone).toHaveAttribute('aria-hidden', 'true');
      const barras = icone!.querySelectorAll('[data-preenchida]');
      expect(barras).toHaveLength(3);
      expect(icone!.querySelectorAll('[data-preenchida="true"]')).toHaveLength(preenchidas);
    },
  );
});

describe('CodigoSolicitacao e DataRelativa', () => {
  it('ADR-013: o código aparece como texto (fonte mono)', () => {
    render(<CodigoSolicitacao codigo="SOL-000042" />);
    expect(screen.getByText('SOL-000042')).toBeInTheDocument();
  });

  it('P-11: DataRelativa mostra o texto relativo, com a data completa no title e no <time dateTime>', () => {
    const iso = '2026-10-01T15:00:00.000Z';
    const { container } = render(
      <DataRelativa iso={iso} agora={new Date('2026-10-03T15:00:00.000Z')} />,
    );

    const tempo = container.querySelector('time');
    expect(tempo).not.toBeNull();
    expect(tempo).toHaveAttribute('dateTime', iso);
    expect(tempo).toHaveTextContent('há 2 dias');
    expect(container.querySelector('[title="01/10/2026 12:00"]')).not.toBeNull();
  });
});
