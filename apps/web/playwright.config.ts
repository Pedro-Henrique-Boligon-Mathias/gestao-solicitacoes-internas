import { defineConfig, devices } from '@playwright/test';

const naCi = !!process.env.CI;

/**
 * E2E contra o ambiente do `docker compose` já de pé (sem webServer). As jornadas mudam dados e
 * conferem números do dashboard, então rodam em série. O login acontece uma vez por usuário, no
 * projeto `setup`, por causa do rate limit (5 por minuto por e-mail).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  // Na CI, um retry só para registrar o trace; teste que só passa no retry é instável
  retries: naCi ? 1 : 0,
  forbidOnly: naCi,
  reporter: naCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /autenticacao\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'desktop',
      testMatch: /jornadas\/.+\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'celular',
      testMatch: /jornadas\/.+\.spec\.ts$/,
      grep: /@celular/,
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
