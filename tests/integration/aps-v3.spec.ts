import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { applyStagingSso } from './staging-browser';
import type { MapInput } from '../../src/lib/esf/maps';

const accounts = JSON.parse(readFileSync(process.env.SGC_STAGING_ACCOUNTS_FILE!, 'utf8')).accounts as { role: string; email: string; password: string }[];
const teamA = '9eb3f425-8423-436b-b550-edcd9175fbdc';
async function login(page: Page, role: string, unit: 'A' | 'B') {
  await applyStagingSso(page.context());
  const account = accounts.find(a => a.role === role)!;
  await page.goto('/login'); await page.getByLabel('E-mail', { exact: true }).fill(account.email); await page.getByLabel('Senha', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Olá,/ })).toBeVisible();
  const scope = page.getByRole('combobox', { name: 'Unidade de trabalho', exact: true });
  if (await scope.count()) {
    const value = await scope.locator('option').filter({ hasText: `UBS Sintética ${unit}` }).getAttribute('value');
    expect(value).toBeTruthy(); await scope.selectOption(value!); await expect(scope).toHaveValue(value!); await expect(scope).toBeEnabled();
  }
}
async function productionAction(page: Page, label: string) {
  const response = page.waitForResponse(r => r.url().includes('/api/v1/esf/production/month') && r.request().method() === 'POST');
  await page.getByRole('button', { name: label, exact: true }).click();
  expect((await response).status()).toBe(200);
}
test('APS V3: production, correction, manager review, closure, reports and reader isolation', async ({ browser }) => {
  test.setTimeout(300000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [writer, manager, reader] = await Promise.all(contexts.map(c => c.newPage()));
  try {
    await login(writer, 'ADMIN_SISTEMA', 'A');
    let month = '';
    for (let n = 0; n < 20; n++) {
      const candidate = `${2080 + Math.floor(Math.random() * 19)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`;
      const response = await writer.request.get(`/api/v1/esf/production?month=${candidate}&team=${teamA}`);
      expect(response.status()).toBe(200);
      const data = await response.json();
      if (data.total === 0 && !data.monthly) { month = candidate; break; }
    }
    expect(month).toBeTruthy();
    await writer.goto(`/registrar?month=${month}`);
    await writer.getByRole('link', { name: 'Registrar produção', exact: true }).click();
    await writer.goto(`/formularios-esf/producao?month=${month}&team=${teamA}&view=new`);
    await writer.getByLabel('Data da produção', { exact: true }).fill(`${month}-05`);
    await writer.getByLabel('Procedimento / categoria', { exact: true }).selectOption('med-consulta');
    await writer.getByLabel('Quantidade', { exact: true }).fill('17');
    await writer.getByRole('button', { name: 'Registrar produção', exact: true }).click();
    await expect(writer.getByText('Salvo no sistema.', { exact: false })).toBeVisible();
    await writer.getByRole('link', { name: 'Mapa e fechamento', exact: true }).click();
    await productionAction(writer, 'Enviar ao gerente');
    await expect(writer.getByText('Em revisão do gerente', { exact: false }).first()).toBeVisible();

    await login(manager, 'GERENTE_UBS', 'A');
    await manager.goto(`/formularios-esf/producao?month=${month}&team=${teamA}&view=monthly`);
    await manager.getByLabel('Justificativa de devolução / reabertura').fill('[SINTÉTICO] Conferir quantidade do lançamento diário.');
    await productionAction(manager, 'Devolver para correção');

    await writer.goto(`/formularios-esf/producao?month=${month}&team=${teamA}&view=records`);
    await writer.getByRole('button', { name: 'Corrigir quantidade', exact: true }).click();
    await writer.getByLabel('Quantidade', { exact: true }).fill('19');
    await writer.getByRole('button', { name: 'Confirmar correção', exact: true }).click();
    await expect(writer.getByText('Salvo no sistema.', { exact: false })).toBeVisible();
    await writer.getByRole('link', { name: 'Mapa e fechamento', exact: true }).click();
    await productionAction(writer, 'Enviar ao gerente');
    await manager.reload(); await productionAction(manager, 'Validar e fechar mapa');
    await expect(manager.getByText('Fechado', { exact: false }).first()).toBeVisible();
    const workbookResponse = await manager.request.get(`/api/v1/esf/production/export?month=${month}&team=${teamA}`);
    expect(workbookResponse.status()).toBe(200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await workbookResponse.body() as never);
    expect(JSON.stringify(workbook.worksheets.map(sheet => sheet.getSheetValues()))).toContain('19');
    await manager.goto(`/formularios-esf/producao/impressao?month=${month}&team=${teamA}`);
    await expect(manager.locator('body')).toContainText('19');

    await login(reader, 'LEITOR', 'B');
    const forbidden = await reader.request.get(`/api/v1/esf/production?month=${month}&team=${teamA}`);
    expect(forbidden.status()).toBe(403);
    const caps = await reader.request.get('/api/v1/workspace/capabilities'); expect(caps.status()).toBe(200);
    expect(JSON.stringify(await caps.json())).not.toContain(teamA);
    const tasks = await reader.request.get(`/api/v1/work-items?month=${month}`); expect(tasks.status()).toBe(200);
    expect(JSON.stringify(await tasks.json())).not.toContain(teamA);
    await reader.setViewportSize({ width: 320, height: 740 }); await reader.goto('/registrar');
    expect(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

test('APS V3: medication item, map review, retry, persistence and filled/calculated PDF', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const context = await browser.newContext();
  const page = await context.newPage();
  const month = '2086-04';
  const itemName = `[SINTÉTICO] Item APS ${Date.now()}`;
  const commands: MapInput[] = [];
  // The map route without an entity id creates a new map. Never open or update a prior fixture.
  try {
    await login(page, 'GERENTE_UBS', 'A');
    await page.goto(`/formularios-esf/medicamentos?team=${teamA}`);
    await expect(page.getByRole('heading', { name: 'Homologação com dados sintéticos', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preencher itens', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Novo mapa não salvo', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Equipe ESF', { exact: true })).toHaveValue(teamA);
    await page.getByLabel('Competência do mapa', { exact: true }).fill(month);
    await page.getByLabel('Responsável pelo preenchimento', { exact: true }).fill('[SINTÉTICO] Conferência APS V3');

    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/v1/esf/maps' && request.method() === 'POST') commands.push(request.postDataJSON() as MapInput);
    });
    const item = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Novo item', exact: true }) });
    await item.getByLabel('Data efetiva do lançamento', { exact: true }).fill(`${month}-07`);
    await item.getByLabel('Item / Apresentação', { exact: true }).fill(itemName);
    await item.getByLabel('Lote', { exact: true }).fill('[SINTÉTICO] Lote APS V3');
    await item.getByLabel('Validade', { exact: true }).fill('2087-04-30');
    await item.getByLabel('Apresentação / unidade de contagem', { exact: true }).fill('[SINTÉTICO] Unidade');
    for (const [label, value] of [
      ['Saldo anterior', '100'], ['Entrada UNID. A.F.', '12'], ['Entrada outros', '3'],
      ['DISPEN.', '9'], ['REMAN.', '2'], ['PERDA', '1'],
      ['Demanda atendida', '9'], ['Demanda não atendida', '4'],
      ['Liberado pela unidade de assistência farmacêutica', '40'],
    ]) await item.getByLabel(label, { exact: true }).fill(value);
    await expect(page.getByRole('button', { name: 'Salvar mapa', exact: true })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: /^Alterações não salvas$/ })).toBeVisible();

    // Switching steps preserves the uncommitted item; it does not save or discard it.
    await page.getByRole('button', { name: 'Conferir mapa e PDF', exact: true }).click();
    await expect(page.getByText('Nenhum item foi adicionado a este bloco.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar item em preenchimento', exact: true }).click();
    await expect(item.getByLabel('Item / Apresentação', { exact: true })).toHaveValue(itemName);
    await expect(item.getByLabel('Saldo anterior', { exact: true })).toHaveValue('100');
    await item.getByRole('button', { name: 'Adicionar item ao mapa', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Conferir mapa e PDF', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: itemName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Novo item', exact: true })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Salvar mapa', exact: true })).toBeEnabled();
    expect(commands).toHaveLength(0);
    await expect(page.getByRole('link', { name: 'Abrir formulário preenchido / PDF', exact: true })).toHaveCount(0);

    // An HTTP failure is synthetic and intercepted before it can reach the shared database.
    await page.route('**/api/v1/esf/maps', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Falha sintética de homologação. Tente novamente.' }) }), { times: 1 });
    const rejected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/esf/maps' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Salvar mapa', exact: true }).click();
    expect((await rejected).status()).toBe(500);
    await expect(page.getByRole('alert')).toContainText('Falha sintética de homologação');
    await expect(page.getByRole('heading', { name: itemName, exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /^Alterações não salvas$/ })).toBeVisible();

    const confirmed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/esf/maps' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Salvar mapa', exact: true }).click();
    const response = await confirmed;
    expect(response.status()).toBe(200);
    const saved = await response.json() as { id: string; version: number };
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(commands[1]).toMatchObject({ action: 'save', expectedVersion: 0, synthetic: true, templateId: 'medicamentos', teamId: teamA, competency: month });
    expect(saved.id).toBe(commands[1].entityId);
    expect(saved.version).toBe(1);
    await expect(page).toHaveURL(new RegExp(`map=${saved.id}`));
    await page.reload();
    await expect(page.getByRole('heading', { name: itemName, exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /^Salvo no sistema · versão 1$/ })).toBeVisible();

    const popup = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Abrir formulário preenchido / PDF', exact: true }).click();
    const print = await popup;
    await expect(print).toHaveURL(new RegExp(`/formularios-esf/medicamentos/impressao\\?team=${teamA}&map=${saved.id}`));
    await expect(print.getByRole('heading', { name: 'Formulário revisado preenchido', exact: true })).toBeVisible();
    await expect(print.locator('.esf-paper-strip').first()).toContainText(`${month} · v1 · PRÉVIA NÃO DEFINITIVA`);
    await expect(print.locator('svg.esf-source-canvas').first()).toHaveAttribute('data-source-svg', '/esf/revisados/08_estoque_medicamentos_revisado.svg');
    await expect(print.locator('[data-paper-cell$=":Item / Apresentação"] > title')).toHaveText(`Item / Apresentação: ${itemName}`);
    // Exact overlaid cells, not incidental matches elsewhere in the original printed template.
    for (const [label, value] of [
      ['Saldo anterior', '100'], ['Total de entradas', '15'], ['Total de saídas', '12'],
      ['Saldo atual', '103'], ['Total de demanda', '13'], ['Liberado pela unidade de assistência farmacêutica', '40'],
    ]) {
      const cell = print.locator(`[data-paper-cell$=":${label}"]`);
      await expect(cell.locator('title')).toHaveText(`${label}: ${value}`);
      await expect(cell.locator('text')).toHaveText(value);
    }
    await expect(print.locator('.esf-paper-annex')).toContainText('[SINTÉTICO] Lote APS V3');
    const pdf = await print.pdf({ path: testInfo.outputPath('aps-v3-medicamentos-preenchido.pdf'), preferCSSPageSize: true, printBackground: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1000);
  } finally { await context.close(); }
});
