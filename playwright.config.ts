import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout sur le build de production (vite preview).
 * PW_CHROMIUM_PATH permet d'utiliser un Chromium déjà installé localement.
 * E2E_BASE_URL permet de tester un déploiement existant (conteneur Docker).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1600, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
        launchOptions: {
          executablePath: process.env.PW_CHROMIUM_PATH || undefined,
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  // E2E_BASE_URL permet de viser un conteneur déjà lancé (ex. http://localhost:8089).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
