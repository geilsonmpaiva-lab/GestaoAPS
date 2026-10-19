import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyStagingSso } from './staging-browser';
const accounts = JSON.parse(readFileSync(process.env.SGC_STAGING_ACCOUNTS_FILE!, 'utf8')).accounts as { role: string; email: string; password: string }[];
const team = '9eb3f425-8423-436b-b550-edcd9175fbdc', pin = '135790';
async function login(page: Page, role = 'ADMIN_SISTEMA') {
  await applyStagingSso(page.context()); const a = accounts.find(a => a.role === role)!;
  await page.goto('/login'); await page.getByLabel('E-mail', { exact: true }).fill(a.email); await page.getByLabel('Senha', { exact: true }).fill(a.password); await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  const scope = page.getByRole('combobox', { name: 'Unidade de trabalho', exact: true }); if (await scope.count()) { const value = await scope.locator('option').filter({ hasText: 'UBS Sintética A' }).getAttribute('value'); await scope.selectOption(value!); await expect(scope).toBeEnabled(); }
}
async function prepare(page: Page) {
  let month = ''; for (let i = 0; i < 25; i++) { const candidate = `${2030 + Math.floor(Math.random() * 19)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`; const r = await page.request.get(`/api/v1/epidemiology/longitudinal?report=1&area=hanseniase&month=${candidate}&scope=team&team=${team}`); expect(r.status()).toBe(200); const data = await r.json(); if (data.total === 0 && data.teams[0].version === 0) { month = candidate; break; } }
  expect(month).toBeTruthy(); await page.goto(`/vigilancia/acompanhamentos?area=hanseniase&month=${month}&team=${team}`);
  await page.getByLabel('PIN local para preparar acompanhamento', { exact: true }).fill(pin); await page.getByRole('button', { name: 'Disponibilizar acompanhamento offline', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Disponível no cofre cifrado' })).toBeVisible(); await page.evaluate(async () => { await navigator.serviceWorker.ready; }); return month;
}
async function unlock(page: Page) { await page.getByLabel('PIN local', { exact: true }).fill(pin); await page.getByRole('button', { name: 'Desbloquear cofre', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Acompanhamentos longitudinais offline', exact: true })).toBeVisible(); }
const panel = (page: Page) => page.getByRole('region', { name: 'Acompanhamentos longitudinais offline', exact: true });
const sync = async (page: Page) => { const button = panel(page).getByRole('button', { name: 'Sincronizar acompanhamentos e anexos', exact: true }); await button.click(); await expect(button).toBeEnabled({ timeout: 60000 }); };

test('longitudinal: true offline restart, draft, attachment retry, durable conflict and expiry', async ({ browser }, info) => {
  test.setTimeout(420000); const profile = mkdtempSync(join(tmpdir(), 'sgc-long-offline-')), baseURL = info.project.use.baseURL;
  let context = await chromium.launchPersistentContext(profile, { baseURL, serviceWorkers: 'allow' }); let page = await context.newPage(); const marker = `[SINTÉTICO] Offline longitudinal ${Date.now()}`;
  const managerContext = await browser.newContext({ baseURL }); const manager = await managerContext.newPage();
  try {
    await login(page); const month = await prepare(page); await context.close();
    context = await chromium.launchPersistentContext(profile, { baseURL, serviceWorkers: 'allow' }); await applyStagingSso(context); await context.setOffline(true); page = await context.newPage();
    // A full authenticated-route navigation falls back to the public cached shell.
    await page.goto(`/vigilancia/acompanhamentos?area=hanseniase&month=${month}&team=${team}`); await expect(page.getByRole('heading', { name: 'Área de trabalho offline', exact: true })).toBeVisible();
    await page.getByLabel('PIN local', { exact: true }).fill('111111'); await page.getByRole('button', { name: 'Desbloquear cofre', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'PIN incorreto' })).toBeVisible();
    await unlock(page); await panel(page).getByRole('button', { name: /Novo caso preparado/ }).click();
    await panel(page).getByLabel('Nome sintético', { exact: true }).fill(marker); await panel(page).getByLabel('Data da notificação', { exact: true }).fill(`${month}-01`); await panel(page).getByLabel('Data deste acompanhamento', { exact: true }).fill(`${month}-02`); await panel(page).getByLabel('Contatos examinados', { exact: true }).fill('3');
    await panel(page).getByRole('button', { name: 'Salvar rascunho longitudinal cifrado', exact: true }).click(); await expect(panel(page).getByRole('status')).toContainText('Salvo neste dispositivo');
    await panel(page).getByLabel('Adicionar comprovante sintético', { exact: false }).setInputFiles({ name: 'comprovante-sintetico.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% SINTETICO SEM DADOS REAIS\n%%EOF') });
    await expect(panel(page).getByRole('status')).toContainText('Anexo salvo cifrado'); await panel(page).getByRole('button', { name: 'Preparar gravação longitudinal', exact: true }).click(); await expect(panel(page).getByText('Aguardando envio', { exact: true })).toBeVisible();
    const privacy = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('sgc-ubs-offline'); r.onsuccess = () => resolve(r.result); }); const records = await new Promise<unknown[]>(resolve => { const r = db.transaction('records').objectStore('records').getAll(); r.onsuccess = () => resolve(r.result); }); db.close(); const cached = await Promise.all((await caches.keys()).map(async k => (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname))); return { records: JSON.stringify(records), paths: cached.flat() }; });
    expect(privacy.records).not.toContain(marker); expect(privacy.paths.some(p => p.startsWith('/api/') || p.startsWith('/vigilancia/'))).toBe(false);
    await context.close(); context = await chromium.launchPersistentContext(profile, { baseURL, serviceWorkers: 'allow' }); await applyStagingSso(context); await context.setOffline(true); page = await context.newPage(); await page.goto('/offline'); await unlock(page);
    await panel(page).getByRole('button', { name: /Novo caso preparado/ }).click(); await expect(panel(page).getByLabel('Nome sintético', { exact: true })).toHaveValue(marker); await expect(panel(page).getByText(/comprovante-sintetico.pdf/)).toBeVisible();
    let lost = true, interrupted = true; const operations: string[] = [];
    await page.route('**/api/v1/epidemiology/longitudinal/offline', async route => { const req = route.request().postDataJSON(); if (req.kind === 'command') { operations.push(req.command.operationId); if (lost) { lost = false; const r = await route.fetch(); expect(r.status(), await r.text()).toBe(200); await route.abort('failed'); return; } } await route.continue(); });
    await page.route('**/storage/v1/object/upload/sign/**', async route => { if (interrupted) { interrupted = false; await route.abort('failed'); } else await route.continue(); });
    await context.setOffline(false); await sync(page); await expect(panel(page).getByRole('status')).toContainText(/fetch|conexão|Failed|Load/i);
    await sync(page); await expect(panel(page).getByRole('status')).toContainText(/interrompido/); await sync(page); await expect(panel(page).getByText('Confirmado pelo servidor', { exact: true })).toBeVisible(); await expect(panel(page).getByText(/comprovante-sintetico.pdf.*Confirmado/)).toBeVisible(); expect(operations[0]).toBe(operations[1]);
    const listed = await (await page.request.get(`/api/v1/epidemiology/longitudinal?area=hanseniase&month=${month}&team=${team}`)).json(); const c = listed.cases.find((c: { initial: { name: string } }) => c.initial.name === marker); expect(c).toBeTruthy();
    const currentQuery = `area=hanseniase&month=${month}&team=${team}&case=${c.id}`; const current = await (await page.request.get('/api/v1/epidemiology/longitudinal?' + currentQuery)).json(); expect(current.visit.version).toBe(1);
    await page.unroute('**/api/v1/epidemiology/longitudinal/offline'); await context.setOffline(true); await panel(page).getByLabel('Contatos examinados', { exact: true }).fill('7'); await panel(page).getByRole('button', { name: 'Salvar rascunho longitudinal cifrado', exact: true }).click(); await panel(page).getByRole('button', { name: 'Preparar gravação longitudinal', exact: true }).click();
    await login(manager, 'GERENTE_UBS'); await manager.goto('/vigilancia/acompanhamentos?' + currentQuery); await manager.getByLabel('Contatos examinados', { exact: true }).fill('9'); const update = manager.waitForResponse(r => r.url().endsWith('/api/v1/epidemiology/longitudinal') && r.request().method() === 'POST'); await manager.getByRole('button', { name: 'Salvar acompanhamento', exact: true }).click(); expect((await update).status()).toBe(200);
    await context.setOffline(false); await sync(page); await expect(panel(page).getByText('Conflito — caso bloqueado', { exact: true })).toBeVisible(); await expect(panel(page).getByRole('heading', { name: 'Versão consultada no servidor', exact: true })).toBeVisible();
    await panel(page).getByLabel('Decisão sobre o conflito longitudinal', { exact: true }).selectOption('RETRY'); await panel(page).getByLabel('Justificativa da resolução longitudinal', { exact: true }).fill('Conferência sintética: reaplicar a versão preparada.'); await panel(page).getByRole('button', { name: 'Confirmar resolução longitudinal auditada', exact: true }).click(); await expect(panel(page).getByRole('status')).toContainText('Decisão confirmada e auditada');
    const resolved = await (await page.request.get('/api/v1/epidemiology/longitudinal?' + currentQuery)).json(); expect(resolved.visit.payload.examinedContacts).toBe(7); expect(resolved.visit.version).toBe(3);
    await panel(page).getByRole('button').filter({ hasText: marker }).click(); await context.setOffline(true); await panel(page).getByRole('button', { name: 'Preparar envio à UBS', exact: true }).click(); await expect(panel(page).getByText('Aguardando envio', { exact: true })).toBeVisible(); await context.setOffline(false); await sync(page);
    const submitted = await (await page.request.get('/api/v1/epidemiology/longitudinal?' + currentQuery)).json(); expect(submitted.visit.status).toBe('SUBMITTED');
    await page.setViewportSize({ width: 320, height: 740 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('longitudinal-offline-confirmado.png'), fullPage: true });
    await context.setOffline(true); await page.clock.install({ time: new Date() }); await page.clock.fastForward(73 * 60 * 60 * 1000); await expect(page.getByRole('button', { name: 'Desbloquear cofre', exact: true })).toBeVisible(); await expect(page.getByLabel('Nome sintético', { exact: true })).toHaveCount(0);
  } finally { await context.close(); await managerContext.close(); }
});

test('longitudinal: new synthetic device revocation quarantines queued data', async ({}, info) => {
  test.skip(process.env.SGC_LONG_REVOKE_DEVICE !== 'true', 'Operator revokes only the fresh synthetic UUID emitted by this test.'); test.setTimeout(180000);
  const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'sgc-long-revoke-')), { baseURL: info.project.use.baseURL, serviceWorkers: 'allow' }); const page = await context.newPage();
  try {
    await login(page); const month = await prepare(page); await page.goto('/offline'); await unlock(page); await panel(page).getByRole('button', { name: /Novo caso preparado/ }).click(); await panel(page).getByLabel('Nome sintético', { exact: true }).fill(`[SINTÉTICO] Revogação ${Date.now()}`); await panel(page).getByRole('button', { name: 'Salvar rascunho longitudinal cifrado', exact: true }).click();
    const deviceId = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('sgc-ubs-offline'); r.onsuccess = () => resolve(r.result); }); const value = await new Promise<{ deviceId: string }>(resolve => { const r = db.transaction('meta').objectStore('meta').get('vault'); r.onsuccess = () => resolve(r.result); }); db.close(); return value.deviceId; });
    console.log('FRESH_LONGITUDINAL_DEVICE_TO_REVOKE=' + deviceId); await context.setOffline(true);
    await expect.poll(async () => (await page.request.post('/api/v1/devices/register', { data: { deviceId, organizationId: '362db1a9-bfdd-4334-9436-46b1c0117eab', label: '[SINTÉTICO] Revogação longitudinal', platform: 'Playwright synthetic' } })).status(), { timeout: 90000, intervals: [3000] }).toBe(403);
    await context.setOffline(false); await expect(page.getByRole('button', { name: 'Desbloquear cofre', exact: true })).toBeVisible(); await expect(page.getByLabel('Nome sintético', { exact: true })).toHaveCount(0);
    const preserved = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('sgc-ubs-offline'); r.onsuccess = () => resolve(r.result); }); const count = await new Promise<number>(resolve => { const r = db.transaction('records').objectStore('records').count(); r.onsuccess = () => resolve(r.result); }); db.close(); return count; }); expect(preserved).toBeGreaterThan(2);
    await page.screenshot({ path: info.outputPath(`revogado-${month}.png`), fullPage: true });
  } finally { await context.close(); }
});
