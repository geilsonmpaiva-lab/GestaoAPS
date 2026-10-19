import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { epiAreas } from '../../src/lib/epidemiology';
import { applyStagingSso, artifactRoot } from './staging-browser';
const month = '2028-04';
const accounts = JSON.parse(readFileSync(process.env.SGC_STAGING_ACCOUNTS_FILE!, 'utf8')).accounts as { role: string; email: string; password: string }[];
async function login(page: Page, role: string) {
  await applyStagingSso(page.context()); const account = accounts.find(a => a.role === role)!;
  await page.goto('/login'); await page.waitForLoadState('networkidle'); await page.getByLabel('E-mail', { exact: true }).fill(account.email); await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Prioridades da unidade' })).toBeVisible();
}
async function clickCommand(page: Page, name: string) {
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/epidemiology' && r.request().method() === 'POST');
  await page.getByRole('button', { name, exact: true }).click(); const response = await pending; expect(response.status()).toBe(200);
  const result = await response.json(); await expect(page.locator('form').filter({ has: page.locator('.epi-fields') })).toContainText(`versão ${result.version}`); return result;
}
test('epidemiology: nine forms, persisted data, explicit workflow, scopes and aggregated municipality', async ({ browser }) => {
  test.setTimeout(240000);
  const managerContext = await browser.newContext(); const manager = await managerContext.newPage();
  const adminContext = await browser.newContext(); const admin = await adminContext.newPage();
  const readerContext = await browser.newContext(); const reader = await readerContext.newPage();
  try {
    await login(manager, 'GERENTE_UBS');
    let first: { id: string; team_id: string; unit_id: string } | undefined;
    for (const area of epiAreas) {
      await manager.goto(`/vigilancia?area=${area.id}&month=${month}`);
      await expect(manager.getByRole('heading', { name: 'Vigilância Epidemiológica', exact: true })).toBeVisible();
      await expect(manager.getByText(area.pending[0], { exact: true })).toBeVisible();
      await manager.getByLabel('Equipe responsável', { exact: true }).selectOption({ label: '[SINTÉTICO] Vigilância A1' });
      await manager.locator('input[name="epi-name"]').fill(`[SINTÉTICO] Jornada ${area.id} ${randomUUID().slice(0, 8)}`);
      await manager.locator('input[name="epi-date"]').fill('2028-04-03');
      if (area.id === 'hanseniase') { await manager.locator('input[name="epi-contacts"]').fill('0'); await manager.locator('input[name="epi-sinan"]').fill('00001'); }
      const saved = await clickCommand(manager, 'Salvar rascunho');
      await expect(manager).toHaveURL(new RegExp(`record=${saved.id}`));
      await manager.reload(); await expect(manager.locator('input[name="epi-name"]')).toHaveValue(saved.payload.name);
      if (area.id === 'hanseniase') {
        first = saved; await expect(manager.locator('input[name="epi-contacts"]')).toHaveValue('0');
        await clickCommand(manager, 'Enviar à UBS'); await expect(manager.getByRole('button', { name: 'Confirmar revisão da UBS', exact: true })).toBeVisible();
        await clickCommand(manager, 'Confirmar revisão da UBS'); await expect(manager.locator('input[name="epi-name"]')).toBeDisabled();
        await expect(manager.getByRole('button', { name: 'Validar pela vigilância', exact: true })).toHaveCount(0);
      }
      await manager.setViewportSize({ width: 320, height: 780 });
      expect(await manager.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await manager.setViewportSize({ width: 1280, height: 900 });
    }
    expect(first).toBeTruthy();
    await login(admin, 'ADMIN_SISTEMA');
    await admin.goto(`/vigilancia?area=hanseniase&month=${month}&record=${first!.id}`);
    await clickCommand(admin, 'Validar pela vigilância');
    await expect(admin.getByRole('button', { name: 'Fechar registro', exact: true })).toBeVisible();
    await clickCommand(admin, 'Fechar registro');
    await admin.reload(); await expect(admin.getByRole('button', { name: 'Reabrir com justificativa', exact: true })).toBeDisabled();
    await expect(admin.getByRole('heading', { name: `Consolidado municipal autorizado · ${month}`, exact: true })).toBeVisible();
    const municipal = await admin.request.get(`/api/v1/epidemiology?area=hanseniase&month=${month}`); expect(municipal.status()).toBe(200);
    const data = await municipal.json(); expect(data.municipal).toBe(true); expect(JSON.stringify(data.municipalSummary)).not.toContain('[SINTÉTICO] Jornada');
    expect(data.municipalSummary.reduce((n: number, r: { total: number }) => n + r.total, 0)).toBeGreaterThanOrEqual(1);
    await admin.screenshot({ path: `${artifactRoot}/epidemiology-municipal.png`, fullPage: true });
    await login(reader, 'LEITOR');
    await reader.goto(`/vigilancia?area=hanseniase&month=${month}`);
    await expect(reader.getByText('Acesso somente aos consolidados. Dados nominais e comandos indisponíveis.', { exact: true })).toBeVisible();
    expect((await reader.request.get(`/api/v1/epidemiology?area=hanseniase&month=${month}&record=${first!.id}`)).status()).toBe(403);
    expect((await manager.request.get(`/api/v1/epidemiology?area=hanseniase&month=${month}&team=${data.municipalSummary.find((r: { unitId: string }) => r.unitId !== first!.unit_id).teamId}`)).status()).toBe(403);
    const readerData = await (await reader.request.get(`/api/v1/epidemiology?area=hanseniase&month=${month}`)).json();
    expect(readerData.records).toEqual([]); expect(readerData.municipal).toBe(false);
  } finally { await managerContext.close(); await adminContext.close(); await readerContext.close(); }
});
test('epidemiology: pagination, retry, conflict and network failure preserve edits', async ({ page }) => {
  test.setTimeout(240000); await login(page, 'GERENTE_UBS');
  await page.goto(`/vigilancia?area=dengue&month=${month}`);
  await page.getByLabel('Equipe responsável', { exact: true }).selectOption({ label: '[SINTÉTICO] Vigilância A1' });
  const team = await page.getByLabel('Equipe responsável', { exact: true }).inputValue();
  const envelope = () => ({ action: 'save', area: 'dengue', competency: month, teamId: team, entityId: randomUUID(), expectedVersion: 0, operationId: randomUUID(), deviceId: randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true, payload: { name: '[SINTÉTICO] Paginação', date: '2028-04-04', sinan: '00001' } });
  let latest = envelope();
  for (let i = 0; i < 51; i += 5) {
    const batch = Array.from({ length: Math.min(5, 51 - i) }, envelope); latest = batch[batch.length - 1];
    await Promise.all(batch.map(async data => { const response = await page.request.post('/api/v1/epidemiology', { data }); expect(response.status()).toBe(200); }));
  }
  const retry = await page.request.post('/api/v1/epidemiology', { data: latest }); expect(retry.status()).toBe(200); expect((await retry.json()).version).toBe(1);
  expect((await page.request.post('/api/v1/epidemiology', { data: { ...latest, operationId: randomUUID() } })).status()).toBe(409);
  await page.goto(`/vigilancia?area=dengue&month=${month}&team=${team}&page=2`);
  await expect(page.locator('.epi-records article')).toHaveCount(25);
  await page.locator('.epi-records article').first().getByRole('link', { name: 'Abrir acompanhamento', exact: true }).click();
  await expect(page).toHaveURL(/record=/); await expect(page).toHaveURL(/page=2/);
  await expect(page.getByLabel('Equipe responsável', { exact: true })).toBeDisabled();
  await expect(page.locator('input[name="epi-address"]')).toBeEnabled();
  await page.locator('input[name="epi-address"]').fill('[SINTÉTICO] Edição mantida');
  await page.route('**/api/v1/epidemiology', route => route.abort());
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText('edições permanecem');
  await expect(page.locator('input[name="epi-address"]')).toHaveValue('[SINTÉTICO] Edição mantida');
  await page.unroute('**/api/v1/epidemiology');
  await clickCommand(page, 'Tentar novamente a mesma gravação');
  await page.reload(); await expect(page.locator('input[name="epi-address"]')).toHaveValue('[SINTÉTICO] Edição mantida');
  await page.getByRole('link', { name: 'Voltar / novo registro', exact: true }).click();
  await expect(page).toHaveURL(/page=2/); await expect(page.locator('.epi-records article')).toHaveCount(25);
});
