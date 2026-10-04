import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CabecalhoAreaLogada } from './cabecalho-area-logada';

/*
 * No celular, a saudação só aparece no dashboard; na lista e no detalhe o topo fica com o título da
 * página ou o "Voltar" (redesenho da Fase 3.5). Sem media query no jsdom, o teste confere a classe
 * que esconde o cabeçalho abaixo de 760px.
 */

const rota = vi.hoisted(() => ({ atual: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => rota.atual }));

const ESCONDE_NO_CELULAR = 'max-[760px]:hidden';

describe('ADR-013: cabeçalho da área logada', () => {
  it('ADR-013: no dashboard, o cabeçalho do layout não aparece (o dashboard mostra a saudação com a data)', () => {
    rota.atual = '/dashboard';
    render(<CabecalhoAreaLogada>Bom dia, Carla</CabecalhoAreaLogada>);

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByText('Bom dia, Carla')).not.toBeInTheDocument();
  });

  it.each(['/solicitacoes', '/solicitacoes/c0000000-0000-4000-8000-000000000042'])(
    'ADR-013: em %s, o cabeçalho some no celular (fica no desktop)',
    (caminho) => {
      rota.atual = caminho;
      render(<CabecalhoAreaLogada>Bom dia, Carla</CabecalhoAreaLogada>);

      expect(screen.getByRole('banner')).toHaveClass(ESCONDE_NO_CELULAR);
    },
  );
});
