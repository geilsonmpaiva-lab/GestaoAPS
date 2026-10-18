import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mapIds } from '../../src/lib/esf/maps';
import { applyStagingSso, artifactRoot } from './staging-browser';

test('ESF new sheets: autofill hints, recovery, navigation and saved-data preservation', async ({ page }) => {
  test.setTimeout(240000);
  await applyStagingSso(page.context());
  const account = JSON.parse(readFileSync(process.env.SGC_STAGING_ACCOUNTS_FILE!, 'utf8')).accounts.find((a: {role:string}) => a.role === 'GERENTE_UBS');
  await page.goto('/login');
  await page.getByLabel('E-mail', {exact:true}).fill(account.email);
  await page.getByLabel('Senha', {exact:true}).fill(account.password);
  await page.getByRole('button', {name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Prioridades da unidade'})).toBeVisible();

  for (const id of mapIds) {
    await page.goto(`/formularios-esf/${id}`);
    await expect(page.getByRole('button', {name:'Trocar equipe / abrir novo mapa',exact:true})).toBeEnabled();
    const fields = page.locator('.esf-map-fields input:not([type="checkbox"]):not([type="file"]), .esf-map-fields select');
    const hints = await fields.evaluateAll(nodes => nodes.map(node => ({
      autocomplete: node.getAttribute('autocomplete'), name: node.getAttribute('name'),
    })));
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.every(h => h.autocomplete === 'off' && h.name?.startsWith('esf-'))).toBe(true);
    expect(new Set(hints.map(h => h.name)).size).toBe(hints.length);
    const vault = page.getByRole('form', {name:'Cofre local de rascunhos',exact:true});
    await expect(vault).toHaveAttribute('autocomplete','off');
    await expect(vault.locator('input')).toHaveCount(1);
    await expect(vault.locator('input')).toHaveAttribute('autocomplete','new-password');
    await expect(page.getByRole('button', {name:'Descartar alterações não confirmadas',exact:true})).toHaveCount(0);
  }

  await page.goto('/formularios-esf/medicamentos');
  const teamSelect = page.getByRole('combobox', {name:'Equipe ESF',exact:true});
  const latestTeam = await teamSelect.locator('option').last().getAttribute('value');
  expect(latestTeam).toBeTruthy();
  await teamSelect.selectOption(latestTeam!);
  await page.getByRole('button', {name:'Trocar equipe / abrir novo mapa',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`team=${latestTeam}`));
  const manager = page.getByLabel('Gerente da unidade', {exact:true});
  await expect(manager).toBeEnabled();
  await expect(manager).toHaveValue('');
  const team = await page.getByRole('combobox', {name:'Equipe ESF',exact:true}).inputValue();
  const beforeResponse = await page.request.get(`/api/v1/esf/maps?form=medicamentos&team=${team}`);
  expect(beforeResponse.status()).toBe(200);
  const before = await beforeResponse.json();
  expect(before.maps.length, 'A equipe sintética deve conter um mapa da jornada de persistência').toBeGreaterThan(0);
  let writes = 0;
  page.on('request', request => { if(new URL(request.url()).pathname.startsWith('/api/v1/esf/') && request.method() !== 'GET') writes++; });

  // Emulate an unwanted autofill value without using/copying any saved credentials.
  await manager.fill('autofill-sintetico@sgc-ubs.test');
  await expect(page.getByRole('button', {name:'Trocar equipe / abrir novo mapa',exact:true})).toBeDisabled();
  await manager.fill('');
  await expect(page.getByRole('button', {name:'Trocar equipe / abrir novo mapa',exact:true})).toBeEnabled();

  const month = page.getByLabel('Competência do mapa', {exact:true});
  const originalMonth = await month.inputValue();
  await month.fill(originalMonth === '2028-01' ? '2028-02' : '2028-01');
  await manager.fill('[SINTÉTICO] Gerente não confirmado');
  const rowForm = page.locator('form').filter({has:page.getByRole('heading',{name:'Adicionar lançamento',exact:true})});
  await rowForm.getByLabel('Item / Apresentação', {exact:true}).fill('[SINTÉTICO] Item não confirmado');
  await rowForm.getByRole('button', {name:'Adicionar linha nesta tela',exact:true}).click();
  await expect(page.getByText('Linha 1', {exact:true})).toBeVisible();
  const discard = page.getByRole('button', {name:'Descartar alterações não confirmadas',exact:true});
  page.once('dialog', dialog => dialog.dismiss());
  await discard.click();
  await expect(manager).toHaveValue('[SINTÉTICO] Gerente não confirmado');
  await expect(page.getByText('Linha 1', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'Trocar equipe / abrir novo mapa',exact:true})).toBeDisabled();
  page.once('dialog', dialog => dialog.accept());
  await discard.click();
  await expect(manager).toHaveValue('');
  await expect(month).toHaveValue(originalMonth);
  await expect(page.getByText('Linha 1', {exact:true})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Trocar equipe / abrir novo mapa',exact:true})).toBeEnabled();
  await page.setViewportSize({width:320,height:760});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:`${artifactRoot}/esf-autofill-recuperado-320.png`});
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button', {name:'Trocar equipe / abrir novo mapa',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`team=${team}`));

  // Opening a saved record is once again available; no save/close/delete command.
  const recent = page.getByRole('button', {name:/^Abrir .+ · .+ · [0-9a-f]{8}$/}).first();
  await expect(recent).toBeEnabled();
  await recent.click();
  await expect(page).toHaveURL(/map=[0-9a-f-]+/);
  const savedId = new URL(page.url()).searchParams.get('map');
  const afterResponse = await page.request.get(`/api/v1/esf/maps?form=medicamentos&team=${team}`);
  expect(afterResponse.status()).toBe(200);
  expect((await afterResponse.json()).maps).toEqual(before.maps);
  expect(before.maps.some((m:{id:string}) => m.id === savedId)).toBe(true);
  expect(writes).toBe(0);
});
