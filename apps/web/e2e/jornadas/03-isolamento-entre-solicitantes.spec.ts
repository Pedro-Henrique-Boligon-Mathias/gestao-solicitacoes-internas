import { expect, test } from '@playwright/test';
import { buscarNaLista, criarSolicitacao, tituloUnico } from '../apoio/solicitacoes';
import { comoUsuario } from '../apoio/usuarios';

test('RN-13: uma solicitante não vê a solicitação de outra; o link direto dá 404', async ({
  browser,
}) => {
  const titulo = tituloUnico('Reembolso de viagem');

  const { url, codigo } = await comoUsuario(browser, 'ana', (page) =>
    criarSolicitacao(page, {
      titulo,
      descricao: 'Reembolso das despesas da viagem a Porto Alegre em setembro.',
      prioridade: 'Baixa',
    }),
  );

  await comoUsuario(browser, 'bruno', async (page) => {
    await buscarNaLista(page, titulo);
    await expect(page.getByText('Nenhuma solicitação encontrada')).toBeVisible();
    await expect(page.getByRole('link', { name: titulo })).toHaveCount(0);

    // A página chega por streaming (loading.tsx), então o HTTP sai 200; o 404 é a tela abaixo
    await page.goto(url);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeVisible();
    await expect(
      page.getByText('Esta solicitação não existe ou você não tem acesso a ela.'),
    ).toBeVisible();
    await expect(page.getByText(titulo)).toHaveCount(0);
    await expect(page.getByText(codigo)).toHaveCount(0);
  });
});
