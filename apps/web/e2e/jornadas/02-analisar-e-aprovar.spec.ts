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

test('RN-06/RF-04: o analista inicia a análise e aprova com comentário; o dashboard muda', async ({
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

    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await iniciarAnalise(page);
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
