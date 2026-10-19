import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { applyStagingSso } from './staging-browser';
const accounts = JSON.parse(readFileSync(process.env.SGC_STAGING_ACCOUNTS_FILE!, 'utf8')).accounts as { role: string; email: string; password: string }[];
const team = '9eb3f425-8423-436b-b550-edcd9175fbdc';
async function login(page: Page, role: string, unit = 'A') {
  await applyStagingSso(page.context()); const account = accounts.find(a => a.role === role)!;
  await page.goto('/login'); await page.getByLabel('E-mail', { exact: true }).fill(account.email); await page.getByLabel('Senha', { exact: true }).fill(account.password); await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  const scope = page.getByRole('combobox', { name: 'Unidade de trabalho', exact: true });
  if (await scope.count()) { const value = await scope.locator('option').filter({ hasText: `UBS Sintética ${unit}` }).getAttribute('value'); expect(value).toBeTruthy(); await scope.selectOption(value!); await expect(scope).toBeEnabled(); }
}
async function action(page: Page, name: string) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/epidemiology/longitudinal' && r.request().method() === 'POST');
  await page.getByRole('button', { name, exact: true }).click(); const r = await response; expect(r.status(), await r.text()).toBe(200); const data = await r.json();
  await expect(page.getByRole('button', { name: 'Repetir o mesmo comando' })).toHaveCount(0); return data;
}
for (const area of ['hanseniase', 'tuberculose']) test(`longitudinal ${area}: two competencies, roles, closure and filled reports`, async ({ browser }, info) => {
  test.setTimeout(240000); const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [admin, manager, reader] = await Promise.all(contexts.map(c => c.newPage()));
  admin.on('dialog', d => void d.accept());
  try {
    await login(admin, 'ADMIN_SISTEMA'); let month = '', next = '';
    for (let i = 0; i < 25; i++) {
      const year = 2050 + Math.floor(Math.random() * 29), m = 1 + Math.floor(Math.random() * 10);
      const candidate = `${year}-${String(m).padStart(2, '0')}`, after = `${year}-${String(m + 1).padStart(2, '0')}`;
      const reads = await Promise.all([candidate, after].map(async month => { const r = await admin.request.get(`/api/v1/epidemiology/longitudinal?report=1&area=${area}&month=${month}&scope=team&team=${team}`); expect(r.status()).toBe(200); return r.json(); }));
      if (reads.every(r => r.total === 0 && r.teams[0].version === 0)) { month = candidate; next = after; break; }
    }
    expect(month).toBeTruthy(); const query = `area=${area}&month=${month}&team=${team}`, name = `[SINTÉTICO] Longitudinal UI ${Date.now()}`;
    await admin.goto('/vigilancia/acompanhamentos?' + query);
    await admin.getByLabel('Nome sintético', { exact: true }).fill(name);
    await admin.getByLabel('Data da notificação', { exact: true }).fill(`${month}-01`);
    await admin.getByLabel('Data deste acompanhamento', { exact: true }).fill(`${month}-02`);
    await admin.getByLabel('SINAN da origem — significado pendente', { exact: true }).fill('00001');
    await admin.getByLabel('Contatos examinados', { exact: true }).fill('0');
    await admin.getByLabel('Responsável pelo preenchimento', { exact: true }).fill('[SINTÉTICO] Responsável');
    if (area === 'hanseniase') { await admin.getByLabel('Número da notificação confirmado para o formulário', { exact: true }).fill('00002'); await admin.getByLabel('Classificação operacional informada', { exact: true }).fill('Transcrição sintética'); }
    else { await admin.getByLabel('Baciloscopia — 1º mês de acompanhamento', { exact: true }).fill('Resultado sintético informado'); await admin.getByLabel('TDO informado', { exact: true }).fill('Transcrição sintética'); }
    const saved = await action(admin, 'Salvar acompanhamento'); await expect(admin).toHaveURL(/case=/); const caseId = saved.case_id;
    await action(admin, 'Enviar à UBS');
    await login(manager, 'GERENTE_UBS'); await manager.goto(`/vigilancia/acompanhamentos?${query}&case=${caseId}`);
    await expect(manager.getByRole('button', { name: 'Validar pela vigilância', exact: true })).toHaveCount(0); await action(manager, 'Confirmar revisão da UBS');
    await admin.goto(`/vigilancia/acompanhamentos?${query}&case=${caseId}`); await action(admin, 'Validar pela vigilância');
    await expect(admin.getByRole('button', { name: 'Fechar competência integrada', exact: true })).toBeEnabled(); await action(admin, 'Fechar competência integrada');
    await expect(admin.getByLabel('Nome sintético', { exact: true })).toBeDisabled();
    const reportQuery = `area=${area}&month=${month}&scope=team&team=${team}&nominal=true`;
    const before = await (await admin.request.get('/api/v1/epidemiology/longitudinal?report=1&' + reportQuery)).json(); expect(before.total).toBe(1);
    const exportResponse = await admin.request.get('/api/v1/epidemiology/longitudinal/export?' + reportQuery); expect(exportResponse.status()).toBe(200);
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await exportResponse.body() as never); expect(JSON.stringify(book.model)).toContain(name); expect(JSON.stringify(book.model)).toContain('00001');
    book.worksheets.forEach(s => s.eachRow(r => r.eachCell(c => expect(c.type).not.toBe(ExcelJS.ValueType.Formula))));
    await admin.goto('/vigilancia/acompanhamentos/impressao?' + reportQuery); await expect(admin.locator('[data-paper-cell] title').filter({ hasText: `NOME: ${name}` }).or(admin.locator('.esf-paper-annex td').filter({ hasText: name }))).not.toHaveCount(0);
    const pdf = await admin.pdf({ path: info.outputPath(`longitudinal-${area}.pdf`), preferCSSPageSize: true, printBackground: true }); expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await admin.screenshot({ path: info.outputPath(`longitudinal-${area}.png`), fullPage: true });
    await admin.goto(`/vigilancia/acompanhamentos?area=${area}&month=${next}&team=${team}&case=${caseId}`);
    await expect(admin.getByLabel('Nome sintético', { exact: true })).toHaveValue(name); await expect(admin.getByLabel('Data deste acompanhamento', { exact: true })).toHaveValue('');
    await admin.getByLabel('Data deste acompanhamento', { exact: true }).fill(`${next}-03`); const second = await action(admin, 'Salvar acompanhamento'); expect(second.case_id).toBe(caseId); expect(second.id).not.toBe(saved.id);
    const history = await (await admin.request.get(`/api/v1/epidemiology/longitudinal?area=${area}&month=${next}&team=${team}&case=${caseId}`)).json(); expect(history.history).toHaveLength(2);
    const after = await (await admin.request.get('/api/v1/epidemiology/longitudinal?report=1&' + reportQuery)).json(); expect(after.teams[0].records).toEqual(before.teams[0].records);
    await login(reader, 'LEITOR', 'B'); expect((await reader.request.get('/api/v1/epidemiology/longitudinal?report=1&' + reportQuery)).status()).toBe(403); expect((await reader.request.get('/api/v1/epidemiology/longitudinal/export?' + reportQuery)).status()).toBe(403);
    await admin.setViewportSize({ width: 320, height: 740 }); await admin.goto(`/vigilancia/acompanhamentos?${query}&case=${caseId}`); expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
