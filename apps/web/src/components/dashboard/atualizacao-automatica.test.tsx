import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtualizacaoAutomatica } from './atualizacao-automatica';

/*
 * Atualização automática dos dashboards do analista e do admin (Fase 3.5, PR 4B): polling de
 * 30 s com router.refresh() só com a aba visível, refresh ao voltar para a aba e o rótulo
 * "atualizado há N s" contado a partir do geradoEm do resumo, sem anunciar a cada segundo.
 */

const roteador = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => roteador }));

const GERADO_EM = '2026-10-03T12:00:00.000Z';
let visibilidade: DocumentVisibilityState = 'visible';

function mudarVisibilidade(estado: DocumentVisibilityState) {
  visibilidade = estado;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const avancar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('RF-04: atualização automática do dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-03T12:00:12.000Z') });
    visibilidade = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilidade);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    roteador.refresh.mockClear();
  });

  it('RF-04: chama router.refresh() a cada 30 s com a aba visível', () => {
    render(<AtualizacaoAutomatica geradoEm={GERADO_EM} />);

    expect(roteador.refresh).not.toHaveBeenCalled();
    avancar(29_999);
    expect(roteador.refresh).not.toHaveBeenCalled();
    avancar(1);
    expect(roteador.refresh).toHaveBeenCalledTimes(1);
    avancar(30_000);
    expect(roteador.refresh).toHaveBeenCalledTimes(2);
  });

  it('RF-04: com atualizar={false}, só mostra o rótulo e não chama router.refresh()', () => {
    render(<AtualizacaoAutomatica geradoEm={GERADO_EM} atualizar={false} />);

    avancar(120_000);
    expect(roteador.refresh).not.toHaveBeenCalled();
    expect(screen.getByText(/atualizado há/)).toBeInTheDocument();
  });

  it('RF-04: sem geradoEm (resumo indisponível), continua atualizando e não mostra o rótulo', () => {
    render(<AtualizacaoAutomatica />);

    expect(screen.queryByText(/atualizado há/)).not.toBeInTheDocument();
    avancar(30_000);
    expect(roteador.refresh).toHaveBeenCalledTimes(1);
  });

  it('RF-04: com a aba oculta não chama router.refresh()', () => {
    render(<AtualizacaoAutomatica geradoEm={GERADO_EM} />);

    mudarVisibilidade('hidden');
    avancar(120_000);
    expect(roteador.refresh).not.toHaveBeenCalled();
  });

  it('RF-04: ao voltar para a aba, atualiza na hora e retoma os 30 s', () => {
    render(<AtualizacaoAutomatica geradoEm={GERADO_EM} />);
    mudarVisibilidade('hidden');
    avancar(90_000);

    mudarVisibilidade('visible');
    expect(roteador.refresh).toHaveBeenCalledTimes(1);
    avancar(30_000);
    expect(roteador.refresh).toHaveBeenCalledTimes(2);
  });

  it('RF-04: para de atualizar quando sai da tela (desmontado)', () => {
    const { unmount } = render(<AtualizacaoAutomatica geradoEm={GERADO_EM} />);
    unmount();
    avancar(60_000);
    mudarVisibilidade('visible');
    expect(roteador.refresh).not.toHaveBeenCalled();
  });
});

describe('RF-04: rótulo "atualizado há N s"', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-03T12:00:12.000Z') });
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => 'visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const rotulo = () => screen.getByText(/atualizado há \d+ s/);

  it('RF-04: conta a partir do geradoEm', () => {
    render(<AtualizacaoAutomatica geradoEm={GERADO_EM} />);
    expect(rotulo()).toHaveTextContent('atualizado há 12 s');
  });

  it('RF-04: o texto muda a cada segundo', () => {
    render(<AtualizacaoAutomatica geradoEm={GERADO_EM} />);
    avancar(1_000);
    expect(rotulo()).toHaveTextContent('atualizado há 13 s');
    avancar(5_000);
    expect(rotulo()).toHaveTextContent('atualizado há 18 s');
  });

  it('RF-04: com um geradoEm novo (depois do refresh), volta a contar do zero', () => {
    const { rerender } = render(<AtualizacaoAutomatica geradoEm={GERADO_EM} />);
    rerender(<AtualizacaoAutomatica geradoEm="2026-10-03T12:00:12.000Z" />);
    expect(rotulo()).toHaveTextContent('atualizado há 0 s');
  });

  it('RF-04/RNF: o rótulo não é anunciado a cada segundo (aria-live="off")', () => {
    render(<AtualizacaoAutomatica geradoEm={GERADO_EM} />);
    expect(rotulo().closest('[aria-live]')).toHaveAttribute('aria-live', 'off');
  });
});
