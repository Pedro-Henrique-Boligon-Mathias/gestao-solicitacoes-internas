import { expect, test as setup } from '@playwright/test';
import { APELIDOS, SENHA_SEED, USUARIOS, estadoDoUsuario } from './apoio/usuarios';

/*
 * Um login por usuário por execução (rate limit de 5 por minuto por e-mail). As jornadas reusam
 * os cookies gravados aqui. Quem está no card "Modo demonstração" entra pelo botão "Usar", o que
 * cobre o modo demonstração de ponta a ponta; o Bruno entra pelo formulário.
 */
for (const apelido of APELIDOS) {
  const usuario = USUARIOS[apelido];

  setup(`login de ${usuario.nome}`, async ({ page }) => {
    await page.goto('/login');

    if (usuario.noModoDemonstracao) {
      await expect(page.getByRole('region', { name: /Modo demonstração/ })).toBeVisible();
      await page.getByRole('button', { name: `Usar ${usuario.nome}` }).click();
      await expect(page.getByLabel('E-mail')).toHaveValue(usuario.email);
      await expect(page.getByLabel('Senha')).not.toHaveValue('');
    } else {
      await page.getByLabel('E-mail').fill(usuario.email);
      await page.getByLabel('Senha').fill(SENHA_SEED);
    }

    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.context().storageState({ path: estadoDoUsuario(apelido) });
  });
}
