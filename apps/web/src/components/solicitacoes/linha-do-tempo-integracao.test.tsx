import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { prepararDom } from '@/test/dom';
import {
  ANA,
  CARLA,
  DIEGO,
  evento,
  eventoIntegracao,
  integracao,
  pessoa,
  solicitacao,
  type Evento,
} from '@/test/fabricas';
import { DetalheSolicitacao } from './detalhe-solicitacao';
import { LinhaDoTempo } from './linha-do-tempo';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
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
  reprocessarIntegracao: vi.fn(),
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
    dados: { decisaoAnterior: { ...DECISAO, analista: pessoa(CARLA) } },
  }),
];

/** Aprovação enviada um minuto depois; reabertura com falha (criada logo após a reabertura). */
const EVENTOS_INTEGRACAO = [
  eventoIntegracao({
    tipo: 'SolicitacaoAprovada',
    status: 'ENVIADO',
    tentativas: 1,
    criadoEm: '2026-10-02T18:00:00.100Z',
    enviadaEm: '2026-10-02T18:01:00.000Z',
  }),
  eventoIntegracao({
    tipo: 'SolicitacaoReaberta',
    status: 'FALHOU',
    tentativas: 8,
    criadoEm: '2026-10-03T12:00:00.100Z',
    enviadaEm: null,
  }),
];

function itensDaLinhaDoTempo(): HTMLElement[] {
  const lista = screen.getByRole('list', { name: 'Histórico' });
  return [...lista.children].filter((filho): filho is HTMLElement => filho.tagName === 'LI');
}

describe('ADR-010: itens de integração na linha do tempo', () => {
  beforeAll(prepararDom);

  it('ADR-010: sem eventos de integração, a linha do tempo continua só com o histórico', () => {
    render(<LinhaDoTempo eventos={HISTORICO} />);

    expect(itensDaLinhaDoTempo()).toHaveLength(4);
    expect(screen.queryByText(/Integração/)).toBeNull();
  });

  it('ADR-010: intercala os itens de integração por data (enviada pela data de envio, falha pela de criação)', () => {
    render(<LinhaDoTempo eventos={HISTORICO} eventosIntegracao={EVENTOS_INTEGRACAO} />);

    const itens = itensDaLinhaDoTempo();
    expect(itens).toHaveLength(6);
    const esperados: (string | RegExp)[] = [
      'Criada',
      'Análise iniciada',
      'Aprovada',
      /Integração enviada/,
      'Reaberta',
      /Integração falhou/,
    ];
    esperados.forEach((rotulo, i) => expect(itens[i]).toHaveTextContent(rotulo));
  });

  it('ADR-010: o item de integração mostra o tipo com rótulo e a data completa, sem autor', () => {
    render(<LinhaDoTempo eventos={HISTORICO} eventosIntegracao={EVENTOS_INTEGRACAO} />);

    const [, , , enviada, , falhou] = itensDaLinhaDoTempo();
    expect(enviada).toHaveTextContent('Aprovação');
    expect(enviada).toHaveTextContent('02/10/2026 15:01');
    expect(enviada).not.toHaveTextContent('SolicitacaoAprovada');
    expect(enviada).not.toHaveTextContent(/ por /);
    expect(falhou).toHaveTextContent('Reabertura');
    expect(falhou).toHaveTextContent('03/10/2026 09:00');
    expect(falhou).not.toHaveTextContent(/ por /);
  });

  it('ADR-010: os itens do histórico não mudam com a integração (mesmo texto, mesma ordem relativa)', () => {
    const { unmount } = render(<LinhaDoTempo eventos={HISTORICO} />);
    const antes = itensDaLinhaDoTempo().map((item) => item.textContent);
    unmount();

    render(<LinhaDoTempo eventos={HISTORICO} eventosIntegracao={EVENTOS_INTEGRACAO} />);
    const depois = itensDaLinhaDoTempo()
      .map((item) => item.textContent)
      .filter((texto) => !texto?.includes('Integração'));

    expect(depois).toEqual(antes);
  });
});

describe('ADR-010: integração no detalhe', () => {
  beforeAll(prepararDom);

  it('ADR-010: com integração, o detalhe mostra o bloco e os itens na linha do tempo', () => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({
          status: 'APROVADA',
          analista: pessoa(CARLA),
          decisao: DECISAO,
          integracao: integracao({
            status: 'ENVIADO',
            tentativas: 1,
            enviadaEm: '2026-10-02T18:01:00.000Z',
            eventos: [EVENTOS_INTEGRACAO[0]!],
          }),
        })}
        historico={HISTORICO.slice(0, 3)}
        usuario={DIEGO}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Integração' })).toBeInTheDocument();
    const itens = itensDaLinhaDoTempo();
    expect(itens).toHaveLength(4);
    expect(itens[3]).toHaveTextContent(/Integração enviada/);
  });

  it('ADR-010: sem integração (null), nem bloco nem itens de integração', () => {
    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({ status: 'ABERTA', integracao: null })}
        historico={HISTORICO.slice(0, 1)}
        usuario={ANA}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Integração' })).toBeNull();
    expect(itensDaLinhaDoTempo()).toHaveLength(1);
  });

  it('ADR-010: o botão "Reprocessar integração" aparece no detalhe só para quem tem a ação', () => {
    const falhou = integracao({ status: 'FALHOU', tentativas: 8 });
    const { unmount } = render(
      <DetalheSolicitacao
        solicitacao={solicitacao({
          status: 'APROVADA',
          decisao: DECISAO,
          integracao: falhou,
          acoesPermitidas: ['REABRIR', 'REPROCESSAR_INTEGRACAO'],
        })}
        historico={HISTORICO.slice(0, 3)}
        usuario={DIEGO}
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Reprocessar integração' })).toHaveLength(1);
    unmount();

    render(
      <DetalheSolicitacao
        solicitacao={solicitacao({ status: 'APROVADA', decisao: DECISAO, integracao: falhou })}
        historico={HISTORICO.slice(0, 3)}
        usuario={CARLA}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Reprocessar integração' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Integração' })).toBeInTheDocument();
  });
});
