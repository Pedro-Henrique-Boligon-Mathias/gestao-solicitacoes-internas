import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import NaoEncontradaLogada from '@/app/(app)/not-found';
import NaoEncontradaRaiz from '@/app/not-found';
import { esperarHref } from '@/test/dom';
import { PaginaNaoEncontrada } from './pagina-nao-encontrada';

/*
 * Páginas 404 (nota 07): o endereço inexistente tem texto genérico; o 404 da área logada, usado
 * pelo detalhe, fala da solicitação. As duas levam ao dashboard.
 */

const TEXTO_SOLICITACAO = 'Esta solicitação não existe ou você não tem acesso a ela.';

describe('RF-03: páginas não encontradas', () => {
  it('RF-03: o 404 raiz (endereço inexistente) mostra o texto genérico e "Voltar ao dashboard"', () => {
    render(<NaoEncontradaRaiz />);

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByText(/o endereço que você abriu não existe/i)).toBeInTheDocument();
    expect(screen.queryByText(/solicitação/i)).toBeNull();
    esperarHref(screen.getByRole('link', { name: 'Voltar ao dashboard' }), '/dashboard');
  });

  it('RF-03: o 404 da área logada (detalhe) mantém o texto da solicitação e "Voltar ao dashboard"', () => {
    render(<NaoEncontradaLogada />);

    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByText(TEXTO_SOLICITACAO)).toBeInTheDocument();
    esperarHref(screen.getByRole('link', { name: 'Voltar ao dashboard' }), '/dashboard');
  });

  it('RF-03: PaginaNaoEncontrada mostra a mensagem recebida em `mensagem`', () => {
    render(<PaginaNaoEncontrada mensagem="Mensagem de teste do 404." />);

    expect(screen.getByText('Mensagem de teste do 404.')).toBeInTheDocument();
    expect(screen.queryByText(TEXTO_SOLICITACAO)).toBeNull();
  });

  it('RF-03: sem `mensagem`, PaginaNaoEncontrada usa o texto da solicitação', () => {
    render(<PaginaNaoEncontrada />);

    expect(screen.getByText(TEXTO_SOLICITACAO)).toBeInTheDocument();
  });
});
