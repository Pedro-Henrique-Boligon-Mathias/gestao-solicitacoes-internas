import { expect, test } from '@playwright/test';
import {
  aprovar,
  criarSolicitacao,
  iniciarAnalise,
  esperarStatus,
  tituloUnico,
} from '../apoio/solicitacoes';
import { comoUsuario } from '../apoio/usuarios';

test('RN-16: o admin reabre uma solicitação aprovada com justificativa', async ({ browser }) => {
  const titulo = tituloUnico('Licença do software de BI');
  const justificativa = 'A licença aprovada era da edição errada; refazer a análise.';

  const { url } = await comoUsuario(browser, 'ana', (page) =>
    criarSolicitacao(page, {
      titulo,
      descricao: 'Licença anual do software de BI para os relatórios do Financeiro.',
      prioridade: 'Média',
    }),
  );

  await comoUsuario(browser, 'carla', async (page) => {
    await page.goto(url);
    await iniciarAnalise(page);
    await aprovar(page, {
      comentario: 'Aprovado conforme o orçamento de ferramentas.',
      decisor: 'Carla Mendes',
    });
  });

  await comoUsuario(browser, 'diego', async (page) => {
    await page.goto(url);
    await esperarStatus(page, 'Aprovada');

    await page.getByRole('button', { name: 'Reabrir' }).click();
    const modal = page.getByRole('dialog', { name: 'Reabrir a solicitação' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/A decisão atual será desfeita/)).toBeVisible();
    await modal.getByLabel('Justificativa').fill(justificativa);
    await modal.getByRole('button', { name: 'Reabrir solicitação' }).click();
    await expect(modal).toBeHidden();

    await esperarStatus(page, 'Aberta');
    const historico = page.getByRole('list', { name: 'Histórico' });
    await expect(historico.getByText('Reaberta por Diego Alves')).toBeVisible();
    await expect(historico.getByText('Decisão desfeita')).toBeVisible();
    await expect(historico.getByText(justificativa)).toBeVisible();
    // O ext-mock falha metade dos envios: o status da integração pode ser Pendente ou Enviada
    await expect(page.getByRole('region', { name: 'Integração' })).toBeVisible();
  });
});
