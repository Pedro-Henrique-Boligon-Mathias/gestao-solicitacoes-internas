import { expect, test } from '@playwright/test';
import {
  abrirModalNovaSolicitacao,
  buscarNaLista,
  preencherECriar,
  esperarStatus,
  tituloUnico,
} from '../apoio/solicitacoes';
import { estadoDoUsuario } from '../apoio/usuarios';

test.use({ storageState: estadoDoUsuario('ana') });

test(
  'RF-01: a solicitante cria uma solicitação e a vê na lista como "Aberta"',
  { tag: '@celular' },
  async ({ page, isMobile }) => {
    const titulo = tituloUnico('Acesso à VPN');
    const modal = await abrirModalNovaSolicitacao(page);

    if (isMobile) {
      // Abaixo de 760px o modal vira folha: largura da tela, colado no rodapé
      const tela = page.viewportSize();
      if (!tela) throw new Error('O projeto do celular precisa de viewport');
      await expect
        .poll(async () => {
          const caixa = await modal.boundingBox();
          return caixa && [Math.round(caixa.width), Math.round(caixa.y + caixa.height)];
        })
        .toEqual([tela.width, tela.height]);
      // Rodapé fixo: a ação principal aparece inteira sem rolar
      await expect(modal.getByRole('button', { name: 'Criar solicitação' })).toBeInViewport({
        ratio: 1,
      });
    }

    const { codigo } = await preencherECriar(page, modal, {
      titulo,
      descricao: 'Preciso de acesso à VPN para trabalhar de casa às sextas-feiras.',
      prioridade: 'Alta',
    });
    expect(codigo).toMatch(/^SOL-/);
    await esperarStatus(page, 'Aberta');

    await buscarNaLista(page, titulo);
    // Desktop: linha da tabela; celular: cartão (um link com todos os dados)
    const item = isMobile
      ? page.getByRole('link', { name: titulo })
      : page.getByRole('row', { name: titulo });
    await expect(item).toHaveCount(1);
    await expect(item.getByText('Aberta', { exact: true })).toBeVisible();
    await expect(item.getByText(codigo, { exact: true })).toBeVisible();
  },
);
