import { expect, test } from '@playwright/test';
import { barraNavegacao } from '../apoio/solicitacoes';
import { estadoDoUsuario } from '../apoio/usuarios';

/*
 * Shell do celular (Fase 3.5, PR 4A): a barra de navegação no rodapé, a folha da conta aberta
 * pelo avatar e o detalhe, onde a barra de ações ocupa o lugar da barra de navegação.
 * Só no projeto `celular`: no desktop a barra não existe na tela.
 */

test.use({ storageState: estadoDoUsuario('carla') });

test(
  'ADR-013: no celular, a folha da conta troca o tema para Escuro e o detalhe troca a navegação pela barra de ações',
  { tag: '@celular' },
  async ({ page, isMobile }) => {
    test.skip(!isMobile, 'A barra de navegação e a folha da conta só existem no celular');

    await page.goto('/dashboard');
    const barra = barraNavegacao(page);
    await expect(barra).toBeVisible();
    await expect(barra.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Analista vê o contador da fila em Solicitações (RN-13: o solicitante não vê)
    await expect(barra.getByRole('link', { name: /^Solicitações/ })).toContainText(/\d/);

    // Folha da conta: abre pelo avatar, troca para Escuro e fecha com Esc
    await barra.getByRole('button', { name: /Você/ }).click();
    const folha = page.getByRole('dialog', { name: 'Carla Mendes' });
    await expect(folha).toBeVisible();
    await expect(folha).toContainText('carla.mendes@demo.test');
    await folha
      .getByRole('radiogroup', { name: 'Tema' })
      .getByRole('radio', { name: 'Escuro' })
      .click();
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.keyboard.press('Escape');
    await expect(folha).toBeHidden();

    // Lista: a barra continua e o item ativo passa a ser Solicitações
    await page.goto('/solicitacoes?status=ABERTA');
    await expect(barra).toBeVisible();
    await expect(barra.getByRole('link', { name: /^Solicitações/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Detalhe de uma aberta de outra pessoa: a Carla pode iniciar a análise (RN-07)
    const card = page
      .getByRole('link', { name: /SOL-\d{6}/ })
      .filter({ hasNotText: 'Carla Mendes' })
      .first();
    await card.click();
    await expect(page).toHaveURL(/\/solicitacoes\/[^/?#]+$/);

    await expect(page.getByRole('link', { name: 'Voltar para solicitações' })).toBeVisible();
    await expect(barraNavegacao(page)).toBeHidden();
    const iniciar = page.getByRole('button', { name: 'Iniciar análise' });
    await expect(iniciar).toBeVisible();
    await expect(iniciar).toBeInViewport({ ratio: 1 });
  },
);
