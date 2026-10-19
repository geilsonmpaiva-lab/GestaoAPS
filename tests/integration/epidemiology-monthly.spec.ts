import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { applyStagingSso, artifactRoot } from './staging-browser';
const accounts = JSON.parse(readFileSync(process.env.SGC_STAGING_ACCOUNTS_FILE!, 'utf8')).accounts as { role: string; email: string; password: string }[];
async function login(page: Page, role: string) {
  await applyStagingSso(page.context()); const account = accounts.find(a => a.role === role)!;
  await page.goto('/login'); await page.waitForLoadState('networkidle');
  await page.getByLabel('E-mail', { exact: true }).fill(account.email); await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Prioridades da unidade' })).toBeVisible();
}
async function recordAction(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true }); await expect(button).toBeEnabled();
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/epidemiology' && r.request().method() === 'POST');
  await button.click(); const r = await pending; expect(r.status()).toBe(200); const data = await r.json();
  await expect(page.locator('form').filter({ has: page.locator('.epi-fields') })).toContainText(`versão ${data.version}`); return data;
}
async function monthlyAction(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true }); await expect(button).toBeEnabled();
  page.once('dialog', d => d.accept());
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/epidemiology/monthly' && r.request().method() === 'POST');
  await button.click(); const r = await pending; expect(r.status()).toBe(200); return r.json();
}

test('monthly epidemiology: 51 records, permissions, snapshots, reopen, PDF and Excel', async ({ browser }) => {
  test.setTimeout(420000); mkdirSync(artifactRoot, { recursive: true });
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [admin, manager, reader] = await Promise.all(contexts.map(c => c.newPage()));
  try {
    await login(admin, 'ADMIN_SISTEMA'); const scope = admin.getByRole('combobox', { name: 'Unidade de trabalho', exact: true });
    const scopeA = await scope.locator('option').filter({ hasText: 'UBS Sintética A' }).getAttribute('value'); expect(scopeA).toBeTruthy();
    await scope.selectOption(scopeA!); await expect(scope).toHaveValue(scopeA!); await expect(scope).toBeEnabled();
    // Choose a fresh period: never change previous synthetic fixtures or closed months.
    let month = '';
    for (let i = 0; i < 30; i++) {
      const candidate = `${2040 + Math.floor(Math.random() * 59)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`;
      const r = await admin.request.get(`/api/v1/epidemiology/monthly?area=hanseniase&month=${candidate}`); expect(r.status()).toBe(200);
      const d = await r.json(); if (d.total === 0 && d.teams.every((t: { version: number }) => t.version === 0)) { month = candidate; break; }
    }
    expect(month).not.toBe(''); const date = `${month}-01`; const areaQuery = `area=hanseniase&month=${month}`;
    await login(manager, 'GERENTE_UBS'); await manager.goto('/vigilancia?' + areaQuery);
    await expect(manager.getByRole('button', { name: 'Fechar competência da equipe', exact: true })).toHaveCount(0);
    await manager.getByLabel('Equipe responsável', { exact: true }).selectOption({ label: '[SINTÉTICO] Vigilância A1' });
    await manager.locator('[name="epi-name"]').fill(`[SINTÉTICO] Mensal UI ${randomUUID().slice(0, 8)}`);
    await manager.locator('[name="epi-date"]').fill(date); await manager.locator('[name="epi-sinan"]').fill('00001'); await manager.locator('[name="epi-contacts"]').fill('0');
    const first = await recordAction(manager, 'Salvar rascunho'); await recordAction(manager, 'Enviar à UBS'); await recordAction(manager, 'Confirmar revisão da UBS');
    await admin.goto(`/vigilancia?${areaQuery}&record=${first.id}`); await recordAction(admin, 'Validar pela vigilância');
    const envelope = { area: 'hanseniase', competency: month, teamId: first.team_id, deviceId: randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true, reason: '' };
    // Exercise all export pages, not just the first 25 list items.
    for (let offset = 0; offset < 50; offset += 5) await Promise.all(Array.from({ length: 5 }, async (_, n) => {
      const entityId = randomUUID(); let version = 0;
      for (const action of ['save', 'submit', 'review', 'validate']) {
        const r = await admin.request.post('/api/v1/epidemiology', { data: { ...envelope, entityId, operationId: randomUUID(), expectedVersion: version, action, payload: action === 'save' ? { name: `[SINTÉTICO] Mensal ${offset + n}`, date, sinan: '00001', ...(n === 0 ? { contacts: 0, classification: '=1+1' } : {}) } : {} } });
        expect(r.status()).toBe(200); version = (await r.json()).version;
      }
    }));
    await admin.goto('/vigilancia?' + areaQuery);
    const panel = admin.getByRole('region', { name: 'Fechamento e relatórios mensais' });
    await panel.getByLabel('Equipe do fechamento', { exact: true }).selectOption(first.team_id);
    await expect(panel).toContainText('51 registros · 0 sem validação');
    const closed = await monthlyAction(admin, 'Fechar competência da equipe'); expect(closed.revision).toBe(1);
    await expect(panel).toContainText('Competência fechada');
    const freshWrite = await admin.request.post('/api/v1/epidemiology', { data: { ...envelope, action: 'save', entityId: randomUUID(), operationId: randomUUID(), expectedVersion: 0, payload: { name: '[SINTÉTICO] Bloqueado no fechamento', date } } }); expect(freshWrite.status()).toBe(422);
    const reportQuery = `${areaQuery}&scope=team&team=${first.team_id}&nominal=true`;
    const xlsx = await admin.request.get('/api/v1/epidemiology/export?' + reportQuery); expect(xlsx.status()).toBe(200);
    const bytes = await xlsx.body(); writeFileSync(`${artifactRoot}/epidemiology-closed.xlsx`, bytes);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(bytes).buffer);
    const rows = book.getWorksheet('Registros restritos')!; expect(rows.getCell('E11').value).toBe('00001');
    let names = 0; rows.eachRow(r => { if (String(r.getCell(6).value ?? '').startsWith('[SINTÉTICO]')) names++; r.eachCell(c => expect(c.type).not.toBe(ExcelJS.ValueType.Formula)); }); expect(names).toBe(51);
    await admin.goto('/vigilancia/relatorio?' + reportQuery); await expect(admin.locator('.epi-report-record')).toHaveCount(51);
    await expect(admin.getByText('REVISÕES FECHADAS NO RECORTE AUTORIZADO', { exact: true })).toBeVisible();
    await admin.pdf({ path: `${artifactRoot}/epidemiology-closed.pdf`, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:9px;text-align:center;width:100%">SGC-UBS · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    await admin.screenshot({ path: `${artifactRoot}/epidemiology-report.png`, fullPage: false });
    await admin.goto('/vigilancia?' + areaQuery); await panel.getByLabel('Equipe do fechamento', { exact: true }).selectOption(first.team_id);
    await panel.getByLabel('Justificativa do fechamento ou reabertura').fill('Correção sintética para verificar revisão preservada');
    await monthlyAction(admin, 'Reabrir competência da equipe'); await expect(panel).toContainText('Em preenchimento');
    const historical = await (await admin.request.get('/api/v1/epidemiology/monthly?' + reportQuery + '&revision=1')).json(); expect(historical.total).toBe(51); expect(historical.definitive).toBe(true);
    const current = await (await admin.request.get('/api/v1/epidemiology/monthly?' + reportQuery)).json(); expect(current.definitive).toBe(false);
    let revisedVersion = 4;
    for (const action of ['return', 'save', 'submit', 'review', 'validate']) {
      const r = await admin.request.post('/api/v1/epidemiology', { data: { ...envelope, entityId: first.id, operationId: randomUUID(), expectedVersion: revisedVersion, action, reason: 'Correção exclusiva da ficha sintética desta jornada', payload: action === 'save' ? { ...first.payload, contacts: 7 } : {} } });
      expect(r.status()).toBe(200); revisedVersion = (await r.json()).version;
    }
    await admin.reload(); await panel.getByLabel('Equipe do fechamento', { exact: true }).selectOption(first.team_id);
    const closedAgain = await monthlyAction(admin, 'Fechar competência da equipe'); expect(closedAgain.revision).toBe(2); await expect(panel).toContainText('Competência fechada');
    const previous = await (await admin.request.get('/api/v1/epidemiology/monthly?' + reportQuery + '&revision=1')).json();
    const latest = await (await admin.request.get('/api/v1/epidemiology/monthly?' + reportQuery + '&revision=2')).json();
    expect(previous.teams[0].records.find((r: { id: string }) => r.id === first.id).payload.contacts).toBe(0);
    expect(latest.teams[0].records.find((r: { id: string }) => r.id === first.id).payload.contacts).toBe(7);
    // A no-activity declaration is explicit and cannot be confused with an empty month.
    const all = await (await admin.request.get('/api/v1/epidemiology/monthly?' + areaQuery)).json();
    const second = all.teams.find((t: { teamName: string }) => t.teamName === '[SINTÉTICO] Vigilância A2'); expect(second).toBeTruthy();
    await panel.getByLabel('Equipe do fechamento', { exact: true }).selectOption(second.teamId);
    await expect(admin.getByRole('button', { name: 'Fechar competência da equipe', exact: true })).toBeDisabled();
    await panel.getByLabel(/Confirmo ausência de atividade/).check(); await panel.getByLabel('Justificativa do fechamento ou reabertura').fill('Ausência de atividade sintética confirmada para teste');
    // The server commits, but the response is lost. Retry must use the original operation.
    let lostBody = '';
    await admin.route('**/api/v1/epidemiology/monthly', async route => { lostBody = route.request().postData()!; const r = await route.fetch(); expect(r.status()).toBe(200); await route.abort(); });
    admin.once('dialog', d => d.accept()); await admin.getByRole('button', { name: 'Fechar competência da equipe', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('Falha de conexão'); await admin.unroute('**/api/v1/epidemiology/monthly');
    const repeated = admin.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/epidemiology/monthly' && r.request().method() === 'POST');
    await admin.getByRole('button', { name: 'Tentar novamente o mesmo comando mensal', exact: true }).click(); const confirmed = await repeated;
    expect(confirmed.status()).toBe(200); expect(confirmed.request().postData()).toBe(lostBody); expect((await confirmed.json()).revision).toBe(1);
    await expect(panel).toContainText('Competência fechada');
    await admin.setViewportSize({ width: 320, height: 780 }); expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await admin.screenshot({ path: `${artifactRoot}/epidemiology-monthly-mobile.png`, fullPage: true });
    await login(reader, 'LEITOR');
    expect((await reader.request.get('/api/v1/epidemiology/export?' + reportQuery)).status()).toBe(403);
    expect((await reader.request.get('/api/v1/epidemiology/export?' + areaQuery + '&scope=municipal')).status()).toBe(403);
    const ownAggregate = await reader.request.get('/api/v1/epidemiology/export?' + areaQuery); expect(ownAggregate.status()).toBe(200);
    const readerBook = new ExcelJS.Workbook(); await readerBook.xlsx.load(new Uint8Array(await ownAggregate.body()).buffer); expect(readerBook.worksheets).toHaveLength(1); expect(JSON.stringify(readerBook.model)).not.toContain('Mensal UI');
    expect((await manager.request.post('/api/v1/epidemiology/monthly', { data: { action: 'close', area: 'hanseniase', month, team: first.team_id, operationId: randomUUID(), expectedVersion: 2, deviceId: randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true } })).status()).toBe(403);
  } finally { await Promise.all(contexts.map(c => c.close().catch(() => {}))); }
});
