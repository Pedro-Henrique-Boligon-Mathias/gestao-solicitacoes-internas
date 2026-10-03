import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IndicadorStatus } from './indicador-status';

describe('IndicadorStatus', () => {
  it('mostra o estado em texto, não só pela cor', () => {
    render(
      <ul>
        <IndicadorStatus componente="API" estado="ok" />
      </ul>,
    );
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('Operando')).toBeInTheDocument();
  });

  it('exibe o detalhe quando há falha', () => {
    render(
      <ul>
        <IndicadorStatus
          componente="Banco de dados"
          estado="falha"
          detalhe="Não foi possível conectar."
        />
      </ul>,
    );
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível conectar.')).toBeInTheDocument();
  });
});
