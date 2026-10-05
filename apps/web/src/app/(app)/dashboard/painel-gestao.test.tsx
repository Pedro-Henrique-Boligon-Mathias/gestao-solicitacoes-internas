import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { esperarHref, linkPara, prepararDom } from '@/test/dom';
import {
  DIEGO,
  gestao,
  integracaoComFalha,
  pagina,
  resumo,
  type Gestao,
  type Resumo,
} from '@/test/fabricas';
import { renderizarServidor } from '@/test/servidor';
import PaginaDashboard from './page';

/*
 * Dashboard do admin = painel de gestão (Fase 3.5, PR 4C), renderizado pela página com as
 * consultas simuladas. Ordem do mock: Visão geral e os 4 status · Entrada e saída · Por área e
 * Por analista · Integrações com falha. O resumo (Visão geral e status) e o painel de gestão
 * (GET /dashboard/gestao) chegam cada um no seu <Suspense>, com esqueleto e erro próprios.
 */

vi.mock('server-only', () => ({}));

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
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(() => {
    throw new Error('redirect inesperado no teste');
  }),
}));

const consultas = vi.hoisted(() => ({
  obterResumo: vi.fn(),
  obterPainelGestao: vi.fn(),
  listarSolicitacoes: vi.fn(),
  listarAreas: vi.fn(),
  detalharSolicitacao: vi.fn(),
  historicoSolicitacao: vi.fn(),
}));
vi.mock('@/features/solicitacoes/consultas', () => consultas);

const autenticado = vi.hoisted(() => ({
  obterUsuarioAtual: vi.fn(),
  criarClienteApiAutenticado: vi.fn(),
}));
vi.mock('@/lib/api/autenticado', () => autenticado);

const acoes = vi.hoisted(() => ({ iniciarAnalise: vi.fn(), reprocessarIntegracao: vi.fn() }));
vi.mock('@/features/solicitacoes/actions', () => acoes);

/** Card "Integridade do histórico" (RN-10): a action da auditoria, simulada. */
const auditoria = vi.hoisted(() => ({ verificarIntegridade: vi.fn() }));
vi.mock('@/features/auditoria/actions', () => auditoria);
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
  Toaster: () => null,
}));

/** 04/10/2026 09:42 em São Paulo; o geradoEm do painel é 12 s antes. */
const AGORA = new Date('2026-10-04T12:42:00.000Z');

type Resultado<T> = { ok: true; dados: T } | { ok: false; status: number; requestId?: string };
type Retorno<T> = Resultado<T> | 'pendente';
const ok = <T,>(dados: T): Resultado<T> => ({ ok: true, dados });
const falha = (requestId: string): Resultado<never> => ({ ok: false, status: 500, requestId });
const promessa = <T,>(retorno: Retorno<T>): Promise<Resultado<T>> =>
  retorno === 'pendente' ? new Promise(() => undefined) : Promise.resolve(retorno);

interface Cenario {
  resumo?: Retorno<Resumo>;
  gestao?: Retorno<Gestao>;
}

async function renderizar(cenario: Cenario = {}) {
  autenticado.obterUsuarioAtual.mockResolvedValue({ autenticado: true, usuario: DIEGO });
  const geradoEm = '2026-10-04T12:41:48.000Z';
  const retornos = { resumo: ok(resumo({ geradoEm })), gestao: ok(gestao()), ...cenario };
  consultas.obterResumo.mockImplementation(() => promessa(retornos.resumo));
  consultas.obterPainelGestao.mockImplementation(() => promessa(retornos.gestao));
  consultas.listarSolicitacoes.mockImplementation(() => promessa(ok(pagina([]))));
  return renderizarServidor(<PaginaDashboard searchParams={Promise.resolve({})} />);
}

const titulo = (nome: RegExp) => screen.getByRole('heading', { name: nome });
const secaoDo = (nome: RegExp) => {
  const t = titulo(nome);
  return (t.closest('section') ?? t.parentElement)!;
};
const esqueletoDoPainel = () =>
  screen.queryAllByRole('status', { name: 'Carregando o painel de gestão' });

/** O controle (link ou botão) com esse nome. */
const controle = (nome: string) =>
  screen.queryByRole('link', { name: nome }) ?? screen.queryByRole('button', { name: nome });

beforeAll(() => {
  prepararDom();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: AGORA });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('RF-04: painel de gestão do admin', () => {
  it('RF-04: blocos na ordem do mock: Visão geral, Entrada e saída, Por área, Por analista, Integrações', async () => {
    await renderizar();

    const ordem = [
      /^Visão geral/,
      /^Entrada e saída/,
      /^Por área/,
      /^Por analista/,
      /^Integrações com falha/,
    ].map(titulo);
    for (let i = 1; i < ordem.length; i++) {
      const posicao = ordem[i - 1]!.compareDocumentPosition(ordem[i]!);
      expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING, `bloco ${i}`).toBeTruthy();
    }
  });

  it('RF-04: os 4 blocos de status levam à lista por status, logo depois da Visão geral', async () => {
    const { container } = await renderizar();

    for (const status of ['ABERTA', 'EM_ANALISE', 'APROVADA', 'REJEITADA']) {
      const bloco = linkPara(container, '/solicitacoes', { status });
      expect(bloco, `bloco ${status}`).toBeTruthy();
      const posicao = titulo(/^Entrada e saída/).compareDocumentPosition(bloco!);
      expect(posicao & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    }
  });

  it('RF-04: o painel e o resumo são consultados; o painel com o período (tudo por padrão)', async () => {
    await renderizar();

    expect(consultas.obterPainelGestao).toHaveBeenCalledWith('tudo');
    expect(consultas.obterResumo).toHaveBeenCalled();
  });

  it('RF-04: "Nova solicitação" continua no cabeçalho', async () => {
    await renderizar();

    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
  });

  it('RF-04: atualização automática presente ("atualizado há 12 s" a partir do geradoEm)', async () => {
    await renderizar();

    expect(screen.getAllByText(/atualizado há 12 s/).length).toBeGreaterThan(0);
  });
});

describe('RF-04/ADR-010: Visão geral do admin', () => {
  it('RF-04: com falhas, o fato "2 integrações com falha" vem de integracoesComFalha.length', async () => {
    await renderizar();

    expect(secaoDo(/^Visão geral/)).toHaveTextContent(/2 integrações com falha/);
  });

  it('RF-04: com uma falha, o fato fica no singular', async () => {
    await renderizar({ gestao: ok(gestao({ integracoesComFalha: [integracaoComFalha()] })) });

    expect(secaoDo(/^Visão geral/)).toHaveTextContent(/1 integração com falha/);
  });

  it('RF-04: com falhas, o botão é "Ver integrações com falha" e leva ao bloco das falhas', async () => {
    const { container } = await renderizar();

    const botao = controle('Ver integrações com falha');
    expect(botao).toBeTruthy();
    expect(controle('Ver a fila')).toBeNull();
    const destino = container.querySelector('#integracoes-com-falha');
    expect(destino).not.toBeNull();
    expect(destino).toHaveTextContent('SOL-000024');
    if (botao!.tagName === 'A') {
      expect(botao).toHaveAttribute('href', '#integracoes-com-falha');
    } else {
      const rolar = vi.spyOn(destino!, 'scrollIntoView');
      await userEvent.setup().click(botao!);
      expect(rolar).toHaveBeenCalled();
    }
  });

  it('RF-04: sem falhas, o botão vira "Ver a fila" (fila por prioridade) e o fato some', async () => {
    await renderizar({ gestao: ok(gestao({ integracoesComFalha: [] })) });

    expect(controle('Ver integrações com falha')).toBeNull();
    esperarHref(screen.getByRole('link', { name: 'Ver a fila' }), '/solicitacoes', {
      status: 'ABERTA',
      ordenarPor: 'prioridade',
    });
    expect(secaoDo(/^Visão geral/)).not.toHaveTextContent(/integra(ção|ções) com falha/);
  });

  it('ADR-010: sem falhas, o bloco mostra "Nenhuma integração com falha"', async () => {
    await renderizar({ gestao: ok(gestao({ integracoesComFalha: [] })) });

    expect(secaoDo(/^Integrações com falha/)).toHaveTextContent('Nenhuma integração com falha');
  });
});

describe('RF-04: blocos do painel com os dados da API', () => {
  it('RF-04: Por área e Por analista vêm do painel, com os links filtrados', async () => {
    await renderizar();

    const area = secaoDo(/^Por área/);
    expect(within(area).getByRole('link', { name: /^Financeiro/ })).toBeInTheDocument();
    expect(area).toHaveTextContent('Sem solicitações no período: Jurídico e Operações.');
    const analista = secaoDo(/^Por analista/);
    expect(within(analista).getByRole('link', { name: /^Carla Mendes/ })).toBeInTheDocument();
  });

  it('RF-04: Entrada e saída mostra os números do painel (12 · 10 · +2)', async () => {
    await renderizar();

    const secao = secaoDo(/^Entrada e saída/);
    expect(within(secao).getByRole('group', { name: /^Entraram/ })).toHaveTextContent('12');
    expect(within(secao).getByRole('group', { name: /^Saldo da fila/ })).toHaveTextContent('+2');
  });
});

describe('RF-04/ADR-012: painel do admin carregado em blocos', () => {
  const BLOCOS_DO_PAINEL = [
    /^Entrada e saída/,
    /^Por área/,
    /^Por analista/,
    /^Integrações com falha/,
  ];

  it('RF-04: painel pendente → esqueleto do painel; status e cabeçalho já aparecem', async () => {
    const { container } = await renderizar({ gestao: 'pendente' });

    expect(esqueletoDoPainel().length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Nova solicitação' })).toBeInTheDocument();
    expect(linkPara(container, '/solicitacoes', { status: 'ABERTA' })).toHaveTextContent('12');
    for (const nome of BLOCOS_DO_PAINEL) {
      expect(screen.queryByRole('heading', { name: nome })).toBeNull();
    }
  });

  it('RF-04: resumo pendente → esqueleto do resumo; os blocos do painel já aparecem', async () => {
    await renderizar({ resumo: 'pendente' });

    expect(screen.getByRole('status', { name: 'Carregando o resumo' })).toBeInTheDocument();
    expect(esqueletoDoPainel()).toHaveLength(0);
    for (const nome of BLOCOS_DO_PAINEL) {
      expect(screen.getByRole('heading', { name: nome })).toBeInTheDocument();
    }
  });

  it('RF-04: falha no painel → status visíveis e erro com o requestId só no lugar do painel', async () => {
    const { container } = await renderizar({ gestao: falha('req-gestao') });

    expect(linkPara(container, '/solicitacoes', { status: 'APROVADA' })).toHaveTextContent('14');
    expect(screen.getAllByText('req-gestao').length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: /^Entraram/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Reprocessar/ })).toBeNull();
  });

  it('RF-04: "Tentar novamente" no erro do painel recarrega a página', async () => {
    await renderizar({ gestao: falha('req-gestao') });

    const tentar = screen.getAllByRole('button', { name: 'Tentar novamente' });
    expect(tentar.length).toBeGreaterThan(0);
    await userEvent.setup().click(tentar[0]!);
    expect(roteador.refresh).toHaveBeenCalled();
  });

  it('RF-04: falha só no resumo → blocos do painel visíveis e erro com o requestId do resumo', async () => {
    await renderizar({ resumo: falha('req-resumo') });

    expect(screen.getByText('req-resumo')).toBeInTheDocument();
    expect(titulo(/^Entrada e saída/)).toBeInTheDocument();
    expect(titulo(/^Integrações com falha/)).toBeInTheDocument();
  });
});

describe('RN-10: card "Integridade do histórico" no painel do admin', () => {
  const cardIntegridade = () => screen.queryByRole('region', { name: 'Integridade do histórico' });

  it('RN-10: o card aparece no painel do admin, com o botão "Verificar integridade"', async () => {
    await renderizar();

    const card = cardIntegridade();
    expect(card, 'região "Integridade do histórico"').not.toBeNull();
    expect(within(card!).getByRole('button', { name: 'Verificar integridade' })).toBeEnabled();
  });

  it('RN-10: o card vem depois de "Integrações com falha" (ordem do DOM)', async () => {
    await renderizar();

    const card = cardIntegridade();
    expect(card).not.toBeNull();
    const posicao = titulo(/^Integrações com falha/).compareDocumentPosition(card!);
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('RN-10: o card não chama a API ao abrir o painel (só no clique)', async () => {
    await renderizar();

    expect(cardIntegridade()).not.toBeNull();
    expect(auditoria.verificarIntegridade).not.toHaveBeenCalled();
  });

  it('RN-10: o card não depende do painel de gestão: aparece mesmo com o painel com falha', async () => {
    await renderizar({ gestao: falha('req-painel') });

    expect(screen.getByText('req-painel')).toBeInTheDocument();
    expect(cardIntegridade()).not.toBeNull();
  });
});
