import { expect, test } from '@playwright/test';

test('team starts with work, finds production and can distinguish entry from monthly delivery', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'O que vamos registrar hoje?' })).toBeVisible();
  await page.getByRole('link', { name: 'Registrar dados', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Registrar dados', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Registrar produção', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo lançamento diário' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Mapa mensal/ })).toBeHidden();
  await page.screenshot({ path: info.outputPath('production-entry.png'), fullPage: true });
});

test('mobile keeps scope and environment visible, and drawer restores focus', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.locator('.v2-workspace')).toContainText('UBS Jardim Aurora');
  await expect(page.locator('.v2-environment')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navegação móvel', exact: true });
  await expect(nav.getByRole('link', { name: /Registrar/ })).toBeVisible();
  const more = nav.getByRole('button', { name: 'Mais áreas e navegação' });
  await more.click();
  await expect(page.getByRole('dialog', { name: 'Seu espaço de trabalho' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('home-320.png'), fullPage: true });
});

test('user access has one person and a verified membership explanation', async ({ page }, info) => {
  await page.goto('/administracao/usuarios');
  await expect(page.getByRole('heading', { name: 'Usuários e acessos', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Ver acessos de Ana Lima' }).click();
  await expect(page.getByRole('heading', { name: 'Vínculos e responsabilidades' })).toBeVisible();
  await expect(page.getByText('Personalizado legado', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('user-access.png'), fullPage: true });
});

test('work APIs reject forged scope and never return nominal records', async ({ request }) => {
  const response = await request.get('/api/v1/work-items?organizationId=other');
  expect(response.status()).toBe(422);
  const capabilities = await request.get('/api/v1/workspace/capabilities');
  expect(capabilities.ok()).toBe(true);
  const data = await capabilities.json();
  expect(data.production).not.toHaveProperty('records');
  const items = await request.get('/api/v1/work-items');
  expect(items.ok()).toBe(true);
  expect(await items.json()).not.toHaveProperty('records');
});
