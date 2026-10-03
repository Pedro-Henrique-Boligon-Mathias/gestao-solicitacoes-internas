import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { esperarHref, prepararDom } from '@/test/dom';
import { ANA, CARLA, DIEGO, evento, pessoa, solicitacao, type Evento } from '@/test/fabricas';
import { DetalheSolicitacao } from './detalhe-solicitacao';
import { LinhaDoTempo } from './linha-do-tempo';

const roteador = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => roteador,
  usePathname: () => '/solicitacoes/c0000000-0000-4000-8000-000000000042',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/solicitacoes/actions', () => ({
  criarSolicitacao: vi.fn(),
  editarSolicitacao: vi.fn(),
  excluirSolicitacao: vi.fn(),
  iniciarAnalise: vi.fn(),
  decidirSolicitacao: vi.fn(),
  reabrirSolicitacao: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));

const DECISAO = {
  resultado: 'APROVADA' as const,
  comentario: 'Aprovado conforme política.',
  decididoEm: '2026-10-02T18:00:00.000Z',
  decididoPor: pessoa(CARLA),
};

const HISTORICO: Evento[] = [
  evento({ tipo: 'CRIADA', autor: pessoa(ANA), criadoEm: '2026-10-01T13:00:00.000Z' }),
  evento({
    tipo: 'EDITADA',
    statusAnterior: null,
    statusNovo: null,
    autor: pessoa(ANA),
    criadoEm: '2026-10-01T14:00:00.000Z',
    dados: {
      titulo: { antes: 'Acesso à folha', depois: 'Acesso ao sistema de folha' },
      prioridade: { antes: 'BAIXA', depois: 'ALTA' },
    },
  }),
  evento({
    tipo: 'ANALISE_INICIADA',
    statusAnterior: 'ABERTA',
    statusNovo: 'EM_ANALISE',
    autor: pessoa(CARLA),
    criadoEm: '2026-10-02T12:00:00.000Z',
  }),
  evento({
    tipo: 'APROVADA',
    statusAnterior: 'EM_ANALISE',
    statusNovo: 'APROVADA',
    autor: pessoa(CARLA),
    comentario: 'Aprovado conforme política.',
    criadoEm: '2026-10-02T18:00:00.000Z',
  }),
  evento({
    tipo: 'REABERTA',
    statusAnterior: 'APROVADA',
    statusNovo: 'ABERTA',
    autor: pessoa(DIEGO),
    comentario: 'Decisão tomada com dados errados.',
    criadoEm: '2026-10-03T12:00:00.000Z',
    dados: {
      decisaoAnterior: {
        resultado: 'APROVADA',
        comentario: 'Aprovado conforme política.',
        decididoEm: '2026-10-02T18:00:00.000Z',
        decididoPor: pessoa(CARLA),
        analista: pessoa(CARLA),
      },
    },
  }),
];

/** Itens de primeiro nível da linha do tempo (um por evento). */
function eventosNaTela(): HTMLElement[] {
  const lista = screen.getByRole('list', { name: 'Histórico' });
  return [...lista.children].filter((filho): filho is HTMLElement => filho.tagName === 'LI');
}

describe('RN-10: linha do tempo', () => {
  it('RN-10: um item por evento, cada um com rótulo, autor e data completa', () => {
    render(<LinhaDoTempo eventos={HISTORICO} />);

    const itens = eventosNaTela();
    expect(itens).toHaveLength(5);
    const esperados: [string, string, string][] = [
      ['Criada', 'Ana Souza', '01/10/2026 10:00'],
      ['Editada', 'Ana Souza', '01/10/2026 11:00'],
      ['Análise iniciada', 'Carla Mendes', '02/10/2026 09:00'],
      ['Aprovada', 'Carla Mendes', '02/10/2026 15:00'],
      ['Reaberta', 'Diego Lima', '03/10/2026 09:00'],
    ];
    esperados.forEach(([rotulo, autor, data], i) => {
      expect(itens[i]).toHaveTextContent(rotulo);
      expect(itens[i]).toHaveTextContent(autor);
      expect(itens[i]).toHaveTextContent(data);
    });
  });

  it('RN-10: EDITADA mostra cada campo alterado com rótulo, antes e depois', () => {
    render(<LinhaDoTempo eventos={HISTORICO} />);

    const editada = eventosNaTela()[1]!;
    expect(editada).toHaveTextContent('Título');
    expect(editada).toHaveTextContent('Acesso à folha');
    expect(editada).toHaveTextContent('Acesso ao sistema de folha');
    expect(editada).toHaveTextContent('Prioridade');
    // Valores de prioridade com rótulo, não com o código da API
    expect(editada).toHaveTextContent('Baixa');
    expect(editada).toHaveTextContent('Alta');
    expect(editada).not.toHaveTextContent('BAIXA');
    // "antes" vem antes de "depois"
    const texto = editada.textContent ?? '';
    expect(texto.indexOf('Acesso à folha')).toBeLessThan(
      texto.indexOf('Acesso ao sistema de folha'),
    );
  });

  it('RN-10: decisão mostra o comentário', () => {
    render(<LinhaDoTempo eventos={HISTORICO} />);
    expect(eventosNaTela()[3]).toHaveTextContent('Aprovado conforme política.');
  });

  it('RN-16: REABERTA mostra a justificativa e a decisão desfeita (resultado, comentário, quem e quando)', () => {
    render(<LinhaDoTempo eventos={HISTORICO} />);

    const reaberta = eventosNaTela()[4]!;
    expect(reaberta).toHaveTextContent('Decisão tomada com dados errados.');
    expect(reaberta).toHaveTextContent('Aprovada');
    expect(reaberta).toHaveTextContent('Aprovado conforme política.');
    expect(reaberta).toHaveTextContent('Carla Mendes');
    expect(reaberta).toHaveTextContent('02/10/2026 15:00');
  });
});

describe('RF-03: detalhe da solicitação', () => {
  beforeAll(prepararDom);

  afterEach(() => {
    vi.clearAllMocks();
  });

  const historicoAteAnalise = HISTORICO.slice(0, 3);

  it('RF-03: mostra código, título, selos com texto, descrição e dados', () => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({ status: 'ABERTA', prioridade: 'ALTA' })}
        historico={HISTORICO.slice(0, 1)}
        usuario={ANA}
      />,
    );

    expect(screen.getByText('SOL-000042')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Acesso ao sistema de folha' })).toBeInTheDocument();
    expect(screen.getAllByText('Aberta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alta').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Preciso de acesso ao sistema de folha para fechar o mês.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Financeiro').length).toBeGreaterThan(0);
    esperarHref(screen.getByRole('link', { name: /Voltar para solicitações/ }), '/solicitacoes');
  });

  it('RF-03: faixa "Com você desde" para o analista responsável em EM_ANALISE, com a data do início da análise', () => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({
          status: 'EM_ANALISE',
          analista: pessoa(CARLA),
          acoesPermitidas: ['DECIDIR'],
        })}
        historico={historicoAteAnalise}
        usuario={CARLA}
      />,
    );

    expect(screen.getByText(/Com você desde/)).toHaveTextContent(
      /Com você desde\s*02\/10\/2026 09:00/,
    );
  });

  it('RF-03: sem faixa para quem não é o responsável', () => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({ status: 'EM_ANALISE', analista: pessoa(CARLA) })}
        historico={historicoAteAnalise}
        usuario={DIEGO}
      />,
    );

    expect(screen.queryByText(/Com você desde/)).toBeNull();
  });

  it('RF-03: sem faixa fora de EM_ANALISE, mesmo para quem foi o analista', () => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({ status: 'APROVADA', analista: pessoa(CARLA), decisao: DECISAO })}
        historico={HISTORICO.slice(0, 4)}
        usuario={CARLA}
      />,
    );

    expect(screen.queryByText(/Com você desde/)).toBeNull();
  });

  it('RF-03: bloco da decisão em decididas, com resultado, comentário, quem decidiu e quando', () => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({ status: 'APROVADA', analista: pessoa(CARLA), decisao: DECISAO })}
        historico={HISTORICO.slice(0, 4)}
        usuario={DIEGO}
      />,
    );

    const titulo = screen.getByRole('heading', { name: 'Decisão' });
    const bloco = titulo.closest('section') ?? titulo.parentElement!;
    expect(bloco).toHaveTextContent('Aprovada');
    expect(within(bloco).getByText(/Aprovado conforme política\./)).toBeInTheDocument();
    expect(bloco).toHaveTextContent('Carla Mendes');
    expect(bloco).toHaveTextContent('02/10/2026 15:00');
  });

  it.each(['ABERTA', 'EM_ANALISE'] as const)('RF-03: sem bloco da decisão em %s', (status) => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({ status })}
        historico={HISTORICO.slice(0, 1)}
        usuario={CARLA}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Decisão' })).toBeNull();
  });

  it('RF-03: as ações vêm de acoesPermitidas', () => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({ acoesPermitidas: ['INICIAR_ANALISE'] })}
        historico={HISTORICO.slice(0, 1)}
        usuario={CARLA}
      />,
    );

    expect(screen.getAllByRole('button', { name: 'Iniciar análise' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });
});
