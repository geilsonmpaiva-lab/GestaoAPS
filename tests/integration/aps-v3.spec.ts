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
test('APS V3: production, correction, manager review, closure, reports and reader isolation', async ({ browser }, testInfo) => {
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
    await writer.getByRole('combobox', { name: 'Procedimento / categoria', exact: true }).selectOption('med-consulta');
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
    await expect(manager.locator('.esf-monthly > p').filter({ hasText: / · Fechado · Revisão / })).toBeVisible();
    const workbookResponse = await manager.request.get(`/api/v1/esf/production/export?month=${month}&team=${teamA}`);
    expect(workbookResponse.status()).toBe(200);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await workbookResponse.body() as never);
    const monthlySheet = workbook.getWorksheet('Produção mensal')!;
    expect(monthlySheet.getCell('B6').value).toBe('Fechado');
    const consultation = monthlySheet.getRows(10, 25)!.find(row => row.getCell(2).value === 'Consulta médica');
    expect(consultation?.getCell(3).value).toBe(19);
    await manager.goto(`/formularios-esf/producao/impressao?month=${month}&team=${teamA}`);
    // The faithful paper is annual: other synthetic months may already exist.
    const annualRow = workbook.getWorksheet('Consolidação anual')!.getRows(3,25)!.find(row => row.getCell(2).value === 'Consulta médica')!;
    expect(annualRow.getCell(Number(month.slice(5)) + 2).value).toBe(19);
    const knownMonths = Array.from({length:12},(_,i)=>annualRow.getCell(i+3).value).filter(v=>typeof v === 'number').map(String);
    await expect(manager.locator('[data-paper-cell="Consulta médica:Mês"] text')).toHaveText(knownMonths);
    await expect(manager.locator('[data-paper-cell="Consulta médica:TOTAL"] text')).toHaveText(String(annualRow.getCell(15).value));
    const pdf = await manager.pdf({ path: testInfo.outputPath('aps-v3-producao-preenchida.pdf'), preferCSSPageSize: true, printBackground: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

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
    await expect(page.getByRole('alert').filter({ hasText: 'Falha sintética de homologação' })).toBeVisible();
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

test('APS V3: encrypted epidemiology draft survives page reload and requires PIN in the same context', async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext();
  const page = await context.newPage();
  const marker = `[SINTÉTICO] Rascunho APS ${Date.now()}`;
  const blockedMutations: string[] = [];
  const pin = '135790'; // Disposable synthetic PIN, never an account password.
  try {
    await login(page, 'GERENTE_UBS', 'A');
    // Device registration/revalidation is part of the real vault workflow.
    // Every other API mutation is blocked before reaching the shared database.
    await context.route('**/api/v1/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (!['GET', 'HEAD'].includes(request.method()) && path !== '/api/v1/devices/register') {
        blockedMutations.push(path); return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    let month = '';
    for (let n = 0; n < 20; n++) {
      const candidate = `${2080 + Math.floor(Math.random() * 19)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`;
      const response = await page.request.get(`/api/v1/epidemiology?area=hanseniase&month=${candidate}&team=${teamA}`);
      expect(response.status()).toBe(200);
      if ((await response.json()).total === 0) { month = candidate; break; }
    }
    expect(month).toBeTruthy();
    const formUrl = `/vigilancia?area=hanseniase&month=${month}&team=${teamA}&view=records&create=1`;
    await page.goto(formUrl);
    await expect(page.getByRole('heading', { name: 'Novo registro sintético · Hanseníase', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Equipe responsável', exact: true })).toHaveValue(teamA);
    await page.getByLabel('Nome sintético', { exact: true }).fill(marker);
    await page.getByLabel('Data da notificação', { exact: true }).fill(`${month}-09`);
    await page.getByLabel('SINAN — identificador informado (interpretação pendente)', { exact: true }).fill('000012345');
    await page.getByLabel('Contatos — significado pendente', { exact: true }).fill('0');
    const vault = page.locator('aside.v2-draft');
    await vault.getByLabel('PIN do cofre (se estiver bloqueado)', { exact: true }).fill(pin);
    await vault.getByRole('button', { name: 'Salvar no dispositivo', exact: true }).click();
    await expect(vault.getByRole('status')).toContainText('Salvo neste dispositivo. O servidor ainda não recebeu esta cópia.');

    const cipher = await page.evaluate(async ({ marker, team, month }) => {
      type Cipher = { id: string; iv: string; value: string; updatedAt: number };
      return new Promise<{ count: number; scoped: boolean; encryptedShape: boolean; plaintextPresent: boolean; queued: number }>((resolve, reject) => {
        const open = indexedDB.open('sgc-ubs-offline');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, transaction = db.transaction(['records', 'queue'], 'readonly');
          const records = transaction.objectStore('records').getAll(), queue = transaction.objectStore('queue').count();
          transaction.onabort = () => { db.close(); reject(transaction.error); };
          transaction.oncomplete = () => {
            const rows = (records.result as Cipher[]).filter(row => row.id.startsWith('draft:'));
            const raw = JSON.stringify(records.result);
            const result = {
              count: rows.length, scoped: rows.every(row => row.id.endsWith(`:vigilancia:hanseniase:${team}:${month}:new`)),
              encryptedShape: rows.every(row => /^[A-Za-z0-9+/]{16}$/.test(row.iv) && typeof row.value === 'string' && row.value.length > 100 && Object.keys(row).sort().join(',') === 'id,iv,updatedAt,value'),
              plaintextPresent: raw.includes(marker) || raw.includes('000012345'), queued: queue.result,
            };
            db.close(); resolve(result);
          };
        };
      });
    }, { marker, team: teamA, month });
    expect(cipher).toEqual({ count: 1, scoped: true, encryptedShape: true, plaintextPresent: false, queued: 0 });

    // A real page reload drops the in-memory key and React values. Network stays online:
    // this verifies draft durability, not offline navigation or synchronization.
    page.once('dialog', dialog => dialog.accept());
    await page.reload();
    await expect(page.getByLabel('Nome sintético', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Contatos — significado pendente', { exact: true })).toHaveValue('');
    await expect(vault.getByLabel('PIN do cofre (se estiver bloqueado)', { exact: true })).toHaveValue('');
    await vault.getByLabel('PIN do cofre (se estiver bloqueado)', { exact: true }).fill('111111');
    await vault.getByRole('button', { name: 'Recuperar rascunho', exact: true }).click();
    await expect(vault.getByRole('status')).toContainText('PIN incorreto. Seus dados locais foram preservados.');
    await expect(page.getByLabel('Nome sintético', { exact: true })).toHaveValue('');
    await vault.getByLabel('PIN do cofre (se estiver bloqueado)', { exact: true }).fill(pin);
    await vault.getByRole('button', { name: 'Recuperar rascunho', exact: true }).click();
    await expect(vault.getByRole('status')).toContainText('Cópia local recuperada. Revise os dados antes de enviar.');
    await expect(page.getByLabel('Nome sintético', { exact: true })).toHaveValue(marker);
    await expect(page.getByLabel('Data da notificação', { exact: true })).toHaveValue(`${month}-09`);
    await expect(page.getByLabel('SINAN — identificador informado (interpretação pendente)', { exact: true })).toHaveValue('000012345');
    await expect(page.getByLabel('Contatos — significado pendente', { exact: true })).toHaveValue('0');
    await expect(page.getByRole('combobox', { name: 'Equipe responsável', exact: true })).toHaveValue(teamA);
    await expect(page.getByRole('form', { name: 'Filtros epidemiológicos' }).getByLabel('Competência', { exact: true })).toHaveValue(month);
    expect(new URL(page.url()).searchParams.has('record')).toBe(false);
    expect(page.url()).not.toContain(encodeURIComponent(marker));

    // Clearing only the displayed copy must not delete the encrypted draft.
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Descartar edições da tela', exact: true }).click();
    const otherMonth = `${month.slice(0, 4)}-${month.endsWith('-12') ? '01' : String(Number(month.slice(5)) + 1).padStart(2, '0')}`;
    await page.goto(formUrl.replace(`month=${month}`, `month=${otherMonth}`));
    await vault.getByLabel('PIN do cofre (se estiver bloqueado)', { exact: true }).fill(pin);
    await vault.getByRole('button', { name: 'Recuperar rascunho', exact: true }).click();
    await expect(vault.getByRole('status')).toContainText('Nenhuma cópia local encontrada para este formulário.');
    await expect(page.getByLabel('Nome sintético', { exact: true })).toHaveValue('');
    await page.goto(formUrl);
    await vault.getByLabel('PIN do cofre (se estiver bloqueado)', { exact: true }).fill(pin);
    await vault.getByRole('button', { name: 'Recuperar rascunho', exact: true }).click();
    await expect(vault.getByRole('status')).toContainText('Cópia local recuperada.');
    await expect(page.getByLabel('Nome sintético', { exact: true })).toHaveValue(marker);
    expect(blockedMutations).toEqual([]);
    const unchanged = await page.request.get(`/api/v1/epidemiology?area=hanseniase&month=${month}&team=${teamA}`);
    expect(unchanged.status()).toBe(200);
    expect((await unchanged.json()).total).toBe(0);
  } finally { await context.close(); }
});
