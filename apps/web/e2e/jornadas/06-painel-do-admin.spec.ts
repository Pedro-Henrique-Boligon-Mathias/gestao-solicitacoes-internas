import { expect, test, type Locator, type Page } from '@playwright/test';
import { estadoDoUsuario } from '../apoio/usuarios';

/*
 * Painel de gestão do admin (Fase 3.5, PR 4C): o Diego troca o período para "Últimos 7 dias"
 * (fica na URL), clica numa área e numa linha de analista e chega à lista filtrada, sem o
 * período (a lista não tem esse filtro). Roda no desktop e no celular.
 */

test.use({ storageState: estadoDoUsuario('diego') });

/** O bloco do dashboard pelo título. */
const bloco = (page: Page, titulo: RegExp): Locator =>
  page.locator('section', { has: page.getByRole('heading', { name: titulo }) }).first();

/** Itens visíveis da lista (tabela no desktop, cartões no celular). */
const itensVisiveis = (page: Page): Locator =>
  page
    .getByRole('region', { name: 'Resultados' })
    .locator('tbody tr, ul > li')
    .filter({ visible: true });

async function escolherUltimos7Dias(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Período:? Tudo$/ }).click();
  const painel = page.getByRole('dialog', { name: /Período/ });
  await expect(painel).toBeVisible();
  await painel.getByRole('radio', { name: /^Últimos 7 dias/ }).click();
  await expect(page).toHaveURL(/[?&]periodo=7d\b/);
  await expect(page.getByRole('button', { name: /^Período:? Últimos 7 dias$/ })).toBeVisible();
}

test('RF-04: o admin troca o período para 7 dias e abre a lista por área e por analista', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await escolherUltimos7Dias(page);

  // O período sobrevive ao recarregar
  await page.reload();
  await expect(page.getByRole('button', { name: /^Período:? Últimos 7 dias$/ })).toBeVisible();

  // Por área: a primeira área com solicitações leva à lista filtrada por ela, sem o período
  const porArea = bloco(page, /^Por área/);
  const linkArea = porArea.getByRole('link').filter({ visible: true }).first();
  const nomeArea = ((await linkArea.textContent()) ?? '').match(/^\D+/)![0].trim();
  await linkArea.click();
  await expect(page).toHaveURL(/\/solicitacoes\?(.*&)?area=[0-9a-f-]{36}/);
  expect(new URL(page.url()).searchParams.has('periodo')).toBe(false);
  await expect(itensVisiveis(page).first()).toBeVisible();
  for (const item of await itensVisiveis(page).all()) {
    await expect(item).toContainText(nomeArea);
  }

  // Por analista: a linha da Carla leva às solicitações em análise com ela
  await page.goto('/dashboard?periodo=7d');
  const porAnalista = bloco(page, /^Por analista/);
  // "Agora" da Carla no painel: a lista filtrada tem de ter exatamente essa quantidade
  const linhaCarla = porAnalista.getByRole('row').filter({ hasText: 'Carla Mendes' }).first();
  const emAnaliseAgora = Number((await linhaCarla.getByRole('cell').nth(1).textContent())?.trim());
  expect(emAnaliseAgora).toBeGreaterThan(0);
  await porAnalista
    .getByRole('link', { name: /^Carla Mendes/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/solicitacoes\?/);
  const params = new URL(page.url()).searchParams;
  expect(params.get('analista')).toMatch(/^[0-9a-f-]{36}$/);
  expect(params.get('status')).toBe('EM_ANALISE');
  expect(params.has('periodo')).toBe(false);
  await expect(itensVisiveis(page).first()).toBeVisible();
  for (const item of await itensVisiveis(page).all()) {
    await expect(item).toContainText('Em análise');
  }
  // Só as da Carla: o total da lista bate com o "Agora" dela no painel (não todas em análise)
  await expect(page.getByText(new RegExp(`^${emAnaliseAgora} resultados?\\b`))).toBeVisible();
});
