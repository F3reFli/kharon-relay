import { expect, test, type Page } from '@playwright/test';

const SETTINGS = JSON.stringify({ bootSequence: false });

async function start(page: Page, save?: object): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.addInitScript(
    ([settings, data]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('kharon-relay:settings', settings);
      if (data) localStorage.setItem('kharon-relay:save:v1', data);
    },
    [SETTINGS, save ? JSON.stringify(save) : ''] as const,
  );
  await page.goto('/');
  await page.locator('.boot-overlay').click();
  await expect(page.locator('.boot-overlay')).toHaveCount(0);
  return errors;
}

async function pulse(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press('Space');
}

function seededSave(extra: object = {}) {
  const now = Date.now();
  const res = { energy: 5000, alloy: 300, data: 50, cores: 0 };
  return {
    version: 1,
    time: 0,
    createdAt: now,
    lastSavedAt: now,
    resources: res,
    lifetime: res,
    run: res,
    modules: { capacitor: { count: 5 } },
    rng: 7,
    ...extra,
  };
}

test("démarre sans erreur et génère de l'énergie", async ({ page }) => {
  const errors = await start(page);
  await expect(page.locator('.brand-title')).toHaveText('KHARON//RELAY');
  await pulse(page, 1);
  await expect(page.locator('.floater').first()).toBeAttached();
  await pulse(page, 4);
  await expect(page.locator('.res-energy .res-value')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('construit un banc de condensateurs', async ({ page }) => {
  await start(page);
  await pulse(page, 20);
  const row = page.locator('.mod-row[data-module="capacitor"]');
  await row.locator('.buy-btn').click();
  await expect(row.locator('.mod-count')).toHaveText('×1');
});

test('le terminal exécute des commandes', async ({ page }) => {
  await start(page);
  const input = page.locator('.term-input');
  await input.fill('help');
  await input.press('Enter');
  await expect(page.locator('.term-output')).toContainText('Commandes disponibles');
  await input.fill('cat readme.txt');
  await input.press('Enter');
  await expect(page.locator('.term-output')).toContainText('Bienvenue, WARDEN');
  await input.fill('sta');
  await input.press('Tab');
  await expect(input).toHaveValue('status ');
});

test('répare un incident en KX-ASM', async ({ page }) => {
  await start(page, seededSave({ nextIncidentAt: 0.5 }));
  const row = page.locator('.mod-row[data-module="capacitor"]');
  await expect(row).toHaveClass(/has-incident/, { timeout: 10_000 });
  await row.getByRole('button', { name: 'DÉBOGUER' }).click();
  await expect(page.locator('.editor-overlay')).toBeVisible();
  await page.locator('.code-input').fill('boucle:\n  JEOF fin\n  MOV OUT, IN\n  JMP boucle\nfin:');
  await page.locator('.run-btn').click();
  await expect(page.locator('.success-banner')).toContainText('PATCH VALIDÉ');
  await expect(row).not.toHaveClass(/has-incident/);
  await expect(page.locator('.editor-overlay')).toBeHidden({ timeout: 5000 });
  await expect(row.locator('.mod-boost')).toBeVisible();
});

test('un firmware faux est refusé avec un diagnostic', async ({ page }) => {
  await start(page, seededSave({ nextIncidentAt: 0.5 }));
  const row = page.locator('.mod-row[data-module="capacitor"]');
  await expect(row).toHaveClass(/has-incident/, { timeout: 10_000 });
  await row.getByRole('button', { name: 'DÉBOGUER' }).click();
  await page.locator('.run-btn').click();
  await expect(page.locator('.test-results')).toContainText('cas réussis');
  await expect(row).toHaveClass(/has-incident/);
});

test('les réglages sont persistés', async ({ page }) => {
  await start(page);
  await page.getByTitle('Réglages').click();
  await page.locator('.setting', { hasText: 'Filtre' }).locator('select').selectOption('clean');
  const stored = await page.evaluate(() => localStorage.getItem('kharon-relay:settings'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ filter: 'clean' });
});

test('la progression survit à un rechargement', async ({ page }) => {
  await start(page);
  await pulse(page, 12);
  await page.reload();
  await page.locator('.boot-overlay').click();
  const value = await page.locator('.res-energy .res-value').textContent();
  expect(Number.parseFloat(value ?? '0')).toBeGreaterThanOrEqual(12);
});

test('répond à un événement de station au clavier', async ({ page }) => {
  const errors = await start(
    page,
    seededSave({
      event: { id: 'wreck', serial: 1, startedAt: 0, expiresAt: 40, progress: 0, seed: 3 },
      nextEventAt: 9999,
    }),
  );
  const card = page.locator('.event-card');
  await expect(card.locator('.ev-title')).toHaveText('ÉPAVE DÉRIVANTE');
  await expect(card.locator('.ev-choice')).toHaveCount(2);
  await page.keyboard.press('1');
  await expect(card).toHaveClass(/result-choice/);
  await expect(card.locator('.ev-source')).toContainText('RÉPONSE');
  await expect(page.locator('.event-log')).toContainText('ÉPAVE DÉRIVANTE');
  expect(errors).toEqual([]);
});

test('relance la station pendant une chute de tension', async ({ page }) => {
  await start(
    page,
    seededSave({
      event: { id: 'blackout', serial: 1, startedAt: 0, expiresAt: 60, progress: 0, seed: 3 },
      nextEventAt: 9999,
    }),
  );
  await expect(page.locator('.screen-fx')).toHaveClass(/fx-blackout/);
  await expect(page.locator('.ev-goal-text')).toContainText('0 / 25');
  await pulse(page, 25);
  await expect(page.locator('.event-card')).toHaveClass(/result-goal/);
  await expect(page.locator('.banner')).toContainText('OBJECTIF ATTEINT');
});
