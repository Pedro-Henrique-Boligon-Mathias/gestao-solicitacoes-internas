import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { esperarHref, prepararDom } from '@/test/dom';
import { divergencia, integridade, type Integridade } from '@/test/fabricas';
import { IntegridadeHistorico } from './integridade-historico';

/*
 * Card "Integridade do histórico" do painel do Admin (RN-10, doc 16, seção "Web"). Componente
 * cliente, sem props: o botão "Verificar integridade" chama a Server Action
 * `verificarIntegridade()` (features/auditoria/actions) e mostra o resultado num anúncio
 * (role="status" ou aria-live="polite"). Estados: inicial (explica a verificação), verificando
 * (botão desabilitado), íntegro, adulteração detectada (lista com links) e erro com requestId.
 */

const acoes = vi.hoisted(() => ({ verificarIntegridade: vi.fn() }));
vi.mock('@/features/auditoria/actions', () => acoes);

type Retorno =
  | { ok: true; integridade: Integridade }
  | { ok: false; erro: string; code?: string; requestId?: string };

const SOL_12 = divergencia();
const SOL_7 = divergencia({
  solicitacao: { id: 'c0000000-0000-4000-8000-000000000007', codigo: 'SOL-000007' },
  eventoId: 'e0000000-0000-4000-8000-000000000102',
  tipo: 'REABERTA',
  criadoEm: '2026-10-03T11:05:00.000Z',
  motivo: 'CORRENTE_QUEBRADA',
});
const ADULTERADO = integridade({
  integro: false,
  totalDivergencias: 2,
  divergencias: [SOL_12, SOL_7],
});

function renderizar() {
  render(<IntegridadeHistorico />);
  const regiao = screen.getByRole('region', { name: 'Integridade do histórico' });
  return { regiao, botao: within(regiao).getByRole('button', { name: 'Verificar integridade' }) };
}

/** O anúncio do resultado: role="status" ou aria-live="polite" dentro do card. */
function anuncio(regiao: HTMLElement): HTMLElement {
  const elemento =
    within(regiao).queryByRole('status') ??
    regiao.querySelector<HTMLElement>('[aria-live="polite"]');
  expect(elemento, 'anúncio do resultado (role="status" ou aria-live="polite")').not.toBeNull();
  return elemento!;
}

/** Clica em "Verificar integridade" com a action respondendo `retorno`. */
async function verificar(retorno: Retorno) {
  acoes.verificarIntegridade.mockResolvedValue(retorno);
  const tela = renderizar();
  await userEvent.setup().click(tela.botao);
  await waitFor(() => expect(acoes.verificarIntegridade).toHaveBeenCalledTimes(1));
  return tela;
}

beforeAll(() => {
  prepararDom();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RN-10: card "Integridade do histórico"', () => {
  it('RN-10: antes de verificar, explica o que a verificação faz e não chama a action', () => {
    const { regiao, botao } = renderizar();

    expect(within(regiao).getByRole('heading', { name: 'Integridade do histórico' })).toBeTruthy();
    expect(regiao).toHaveTextContent(/hash encadeado/i);
    expect(regiao).toHaveTextContent(/direto no banco/i);
    expect(botao).toBeEnabled();
    expect(regiao).not.toHaveTextContent('Histórico íntegro');
    expect(regiao).not.toHaveTextContent('Adulteração detectada');
    expect(acoes.verificarIntegridade).not.toHaveBeenCalled();
  });

  it('RN-10: verificando → o botão fica desabilitado até a resposta', async () => {
    acoes.verificarIntegridade.mockReturnValue(new Promise(() => undefined));
    const { regiao, botao } = renderizar();

    await userEvent.setup().click(botao);

    await waitFor(() =>
      expect(within(regiao).getByRole('button', { name: /^Verifica/ })).toBeDisabled(),
    );
    expect(acoes.verificarIntegridade).toHaveBeenCalledTimes(1);
    expect(acoes.verificarIntegridade).toHaveBeenCalledWith();
  });

  it('RN-10: íntegro → "Histórico íntegro", "412 eventos verificados" e a hora, anunciados', async () => {
    const { regiao } = await verificar({ ok: true, integridade: integridade() });

    const resultado = anuncio(regiao);
    await waitFor(() => expect(resultado).toHaveTextContent('Histórico íntegro'));
    expect(resultado).toHaveTextContent('412 eventos verificados');
    expect(resultado).toHaveTextContent('09:42');
    expect(regiao).not.toHaveTextContent('Adulteração detectada');
    expect(within(regiao).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('RN-10: íntegro com um evento → singular; milhares no formato pt-BR', async () => {
    const um = await verificar({ ok: true, integridade: integridade({ eventosVerificados: 1 }) });
    await waitFor(() => expect(anuncio(um.regiao)).toHaveTextContent('1 evento verificado'));
    expect(anuncio(um.regiao)).not.toHaveTextContent('1 eventos');
  });

  it('RN-10: milhares de eventos aparecem com separador pt-BR ("1.234 eventos verificados")', async () => {
    const { regiao } = await verificar({
      ok: true,
      integridade: integridade({ eventosVerificados: 1234 }),
    });
    await waitFor(() => expect(anuncio(regiao)).toHaveTextContent('1.234 eventos verificados'));
  });

  it('RN-10: adulterado → "Adulteração detectada" em vermelho, anunciado', async () => {
    const { regiao } = await verificar({ ok: true, integridade: ADULTERADO });

    const resultado = anuncio(regiao);
    await waitFor(() => expect(resultado).toHaveTextContent('Adulteração detectada'));
    expect(regiao).not.toHaveTextContent('Histórico íntegro');
    const titulo = within(regiao).getByText('Adulteração detectada');
    expect(titulo.closest('[class*="destructive"], [class*="red-"]')).not.toBeNull();
  });

  it('RN-10: cada divergência traz o código com link, o tipo do evento, a data e o motivo', async () => {
    const { regiao } = await verificar({ ok: true, integridade: ADULTERADO });

    await waitFor(() => expect(within(regiao).getAllByRole('listitem')).toHaveLength(2));
    const [primeira, segunda] = within(regiao).getAllByRole('listitem') as [
      HTMLElement,
      HTMLElement,
    ];

    esperarHref(
      within(primeira).getByRole('link', { name: /SOL-000012/ }),
      `/solicitacoes/${SOL_12.solicitacao.id}`,
    );
    expect(primeira).toHaveTextContent('Aprovada');
    expect(primeira).toHaveTextContent('02/10/2026 14:30');
    expect(primeira).toHaveTextContent('conteúdo alterado');

    esperarHref(
      within(segunda).getByRole('link', { name: /SOL-000007/ }),
      `/solicitacoes/${SOL_7.solicitacao.id}`,
    );
    expect(segunda).toHaveTextContent('Reaberta');
    expect(segunda).toHaveTextContent('03/10/2026 08:05');
    expect(segunda).toHaveTextContent('evento apagado ou inserido');
  });

  it('RN-10: os motivos aparecem em português, nunca o código da API', async () => {
    const { regiao } = await verificar({ ok: true, integridade: ADULTERADO });

    await waitFor(() => expect(regiao).toHaveTextContent('Adulteração detectada'));
    expect(regiao).not.toHaveTextContent('CONTEUDO_ALTERADO');
    expect(regiao).not.toHaveTextContent('CORRENTE_QUEBRADA');
  });

  it('RN-10: mais de 20 divergências → mostra as 20 recebidas e "e mais N"', async () => {
    const vinte = Array.from({ length: 20 }, (_, i) =>
      divergencia({
        solicitacao: {
          id: `c0000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`,
          codigo: `SOL-0002${String(i).padStart(2, '0')}`,
        },
        eventoId: `e0000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`,
      }),
    );
    const { regiao } = await verificar({
      ok: true,
      integridade: integridade({ integro: false, totalDivergencias: 23, divergencias: vinte }),
    });

    await waitFor(() => expect(within(regiao).getAllByRole('listitem')).toHaveLength(20));
    expect(regiao).toHaveTextContent('e mais 3');
  });

  it('RN-10: com até 20 divergências, não aparece "e mais"', async () => {
    const { regiao } = await verificar({ ok: true, integridade: ADULTERADO });

    await waitFor(() => expect(within(regiao).getAllByRole('listitem')).toHaveLength(2));
    expect(regiao).not.toHaveTextContent(/e mais \d/);
  });

  it('ADR-008: erro → mensagem da action e o requestId para o suporte; o botão volta a funcionar', async () => {
    const { regiao } = await verificar({
      ok: false,
      erro: 'Não foi possível concluir agora. Tente de novo em instantes.',
      requestId: 'req-integridade',
    });

    await waitFor(() =>
      expect(regiao).toHaveTextContent(
        'Não foi possível concluir agora. Tente de novo em instantes.',
      ),
    );
    expect(within(regiao).getByText('req-integridade')).toBeInTheDocument();
    expect(regiao).not.toHaveTextContent('Histórico íntegro');
    expect(regiao).not.toHaveTextContent('Adulteração detectada');
    expect(within(regiao).getByRole('button', { name: /^Verificar/ })).toBeEnabled();
  });

  it('RN-10: verificar de novo chama a action outra vez e troca o resultado', async () => {
    const { regiao } = await verificar({ ok: true, integridade: ADULTERADO });
    await waitFor(() => expect(regiao).toHaveTextContent('Adulteração detectada'));

    acoes.verificarIntegridade.mockResolvedValue({ ok: true, integridade: integridade() });
    await userEvent.setup().click(within(regiao).getByRole('button', { name: /^Verificar/ }));

    await waitFor(() => expect(anuncio(regiao)).toHaveTextContent('Histórico íntegro'));
    expect(acoes.verificarIntegridade).toHaveBeenCalledTimes(2);
    expect(regiao).not.toHaveTextContent('Adulteração detectada');
  });
});
