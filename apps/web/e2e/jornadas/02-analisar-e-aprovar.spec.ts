import { expect, test, type Page } from '@playwright/test';
import {
  aprovar,
  criarSolicitacao,
  iniciarAnalise,
  esperarStatus,
  tituloUnico,
} from '../apoio/solicitacoes';
import { comoUsuario } from '../apoio/usuarios';

/** Número do bloco "Aprovadas" do dashboard, lido do nome acessível ("Aprovadas: 14 solicitações, …"). */
async function lerAprovadas(page: Page): Promise<number> {
  await page.goto('/dashboard');
  const bloco = page.getByRole('link', { name: /^Aprovadas: \d+ solicitaç/ });
  await expect(bloco).toBeVisible();
  const nome = (await bloco.getAttribute('aria-label')) ?? '';
  return Number(/^Aprovadas: (\d+)/.exec(nome)?.[1]);
}

/**
 * Totais de "Seu trabalho" no topo do dashboard do analista: "Minhas análises N" e "Fila de
 * análise N" (Fase 3.5, PR 4B). Os dois títulos precisam estar na tela sem rolar.
 */
async function lerSeuTrabalho(page: Page): Promise<{ minhas: number; fila: number }> {
  await page.goto('/dashboard');
  const minhas = page.getByRole('heading', { name: /^Minhas análises \d+$/ });
  const fila = page.getByRole('heading', { name: /^Fila de análise \d+$/ });
  await expect(minhas).toBeInViewport();
  await expect(fila).toBeInViewport();
  const numero = async (titulo: typeof minhas) =>
    Number(/(\d+)$/.exec((await titulo.textContent())?.trim() ?? '')?.[1]);
  return { minhas: await numero(minhas), fila: await numero(fila) };
}

test('RN-06/RF-04: o analista inicia a análise e aprova com comentário; o dashboard muda (Minhas análises, fila e aprovadas)', async ({
  browser,
}) => {
  const titulo = tituloUnico('Notebook para nova colaboradora');
  const comentario = 'Aprovado: há orçamento previsto para o trimestre.';

  const { url } = await comoUsuario(browser, 'ana', (page) =>
    criarSolicitacao(page, {
      titulo,
      descricao: 'Notebook para a colaboradora que começa na próxima semana no Financeiro.',
      prioridade: 'Média',
    }),
  );

  await comoUsuario(browser, 'carla', async (page) => {
    const aprovadasAntes = await lerAprovadas(page);
    const trabalhoAntes = await lerSeuTrabalho(page);

    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await iniciarAnalise(page);

    // RF-04: a que ela iniciou sai da fila e entra em "Minhas análises"
    await expect
      .poll(() => lerSeuTrabalho(page))
      .toEqual({ minhas: trabalhoAntes.minhas + 1, fila: trabalhoAntes.fila - 1 });

    await page.goto(url);
    await aprovar(page, { comentario, decisor: 'Carla Mendes' });

    await expect.poll(() => lerAprovadas(page)).toBe(aprovadasAntes + 1);
  });

  await comoUsuario(browser, 'ana', async (page) => {
    await page.goto(url);
    await esperarStatus(page, 'Aprovada');
    const decisao = page.getByRole('region', { name: 'Decisão' });
    await expect(decisao).toContainText('Aprovada por Carla Mendes');
    await expect(decisao).toContainText(comentario);
  });
});
