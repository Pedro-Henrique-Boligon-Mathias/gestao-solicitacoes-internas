import { expect, type Locator, type Page } from '@playwright/test';

export type PrioridadeE2E = 'Baixa' | 'Média' | 'Alta';

export interface DadosNovaSolicitacao {
  titulo: string;
  descricao: string;
  prioridade: PrioridadeE2E;
}

export interface SolicitacaoCriada {
  codigo: string;
  /** Caminho do detalhe, por exemplo `/solicitacoes/<id>`. */
  url: string;
}

/**
 * Título único por execução, para a suíte rodar de novo sem recriar o banco. Fica dentro do
 * limite do formulário (5 a 120 caracteres).
 */
export function tituloUnico(assunto: string): string {
  const sufixo = Math.random().toString(36).slice(2, 6);
  return `E2E ${Date.now()}${sufixo} · ${assunto}`.slice(0, 120);
}

/** O modal de criação, aberto pelo botão "Nova solicitação". */
export const modalNovaSolicitacao = (page: Page): Locator =>
  page.getByRole('dialog', { name: 'Nova solicitação' });

/** Abre o modal de criação a partir do dashboard (único botão "Nova solicitação" da tela). */
export async function abrirModalNovaSolicitacao(page: Page): Promise<Locator> {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Nova solicitação' }).click();
  const modal = modalNovaSolicitacao(page);
  await expect(modal).toBeVisible();
  return modal;
}

/** Preenche o formulário do modal e cria a solicitação; espera o detalhe abrir. */
export async function preencherECriar(
  page: Page,
  modal: Locator,
  { titulo, descricao, prioridade }: DadosNovaSolicitacao,
): Promise<SolicitacaoCriada> {
  await modal.getByLabel('Título').fill(titulo);
  await modal.getByLabel('Descrição').fill(descricao);
  await modal.getByRole('radio', { name: new RegExp(`^${prioridade}\\b`) }).check();
  await modal.getByRole('button', { name: 'Criar solicitação' }).click();

  const toast = page.getByText(/^Solicitação SOL-\S+ criada$/);
  await expect(toast).toBeVisible();
  const codigo = (await toast.textContent())?.match(/SOL-\S+/)?.[0];
  if (!codigo) throw new Error('O toast de criação não trouxe o código da solicitação');

  await expect(page).toHaveURL(/\/solicitacoes\/[^/?#]+$/);
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
  return { codigo, url: new URL(page.url()).pathname };
}

/** Cria uma solicitação pela tela: "Nova solicitação", modal e "Criar solicitação". */
export async function criarSolicitacao(
  page: Page,
  dados: DadosNovaSolicitacao,
): Promise<SolicitacaoCriada> {
  const modal = await abrirModalNovaSolicitacao(page);
  return preencherECriar(page, modal, dados);
}

/** Espera o selo de status do detalhe, que o leitor de tela anuncia como "Status: <rótulo>". */
export async function esperarStatus(page: Page, rotulo: string): Promise<void> {
  await expect(page.getByText(`Status: ${rotulo}`, { exact: true })).toBeVisible();
}

/** Busca na lista pelo campo "Buscar" e espera o filtro chegar na URL (debounce de 300 ms). */
export async function buscarNaLista(page: Page, termo: string): Promise<void> {
  await page.goto('/solicitacoes');
  await page.getByRole('searchbox', { name: 'Buscar' }).fill(termo);
  await expect(page).toHaveURL(/[?&]q=/);
}

/** Analista: inicia a análise da solicitação aberta no detalhe. */
export async function iniciarAnalise(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Iniciar análise' }).click();
  await esperarStatus(page, 'Em análise');
  await expect(page.getByText(/^Com você desde /)).toBeVisible();
}

/** Analista: aprova a solicitação em análise com o comentário informado. */
export async function aprovar(
  page: Page,
  { comentario, decisor }: { comentario: string; decisor: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Aprovar' }).click();
  const modal = page.getByRole('dialog', { name: 'Decidir a solicitação' });
  await expect(modal).toBeVisible();
  await modal.getByRole('radio', { name: 'Aprovar' }).check();
  await modal.getByLabel('Comentário').fill(comentario);
  await modal.getByRole('button', { name: 'Confirmar aprovação' }).click();
  await expect(modal).toBeHidden();

  await esperarStatus(page, 'Aprovada');
  const decisao = page.getByRole('region', { name: 'Decisão' });
  await expect(decisao).toContainText(`Aprovada por ${decisor}`);
  await expect(decisao).toContainText(comentario);
}
