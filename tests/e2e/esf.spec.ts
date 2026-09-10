import { expect, test } from '@playwright/test';

test('ESF catalog keeps all ten models visible without enabling nominal collection', async ({ page }) => {
  await page.goto('/formularios-esf');
  await expect(page.getByRole('heading', { name: 'Formulários ESF', exact: true })).toBeVisible();
  await expect(page.locator('.esf-template-card')).toHaveCount(10);
  await page.getByRole('link', { name: /Página 4/ }).click();
  await expect(page.getByRole('heading', { name: 'Acompanhamento de tuberculose', exact: true })).toBeVisible();
  await expect(page.getByText('Modelo restrito: entrada de dados nominais não habilitada.')).toBeVisible();
  await expect(page.locator('main input')).toHaveCount(0);
});
test('daily production reconciles zero, correction, review, closure and reopening in demo', async ({ page }, info) => {
  await page.goto('/formularios-esf/producao?month=2026-09');
  await page.getByLabel('Data da produção', { exact: true }).fill('2026-09-09');
  await page.getByRole('combobox', { name: 'Procedimento / categoria', exact: true }).selectOption('med-consulta');
  await page.getByLabel('Quantidade', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Registrar produção', exact: true }).click();
  await expect(page.getByText('Simulação adicionada nesta tela.', { exact: false })).toBeVisible();
  const row = page.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: 'Consulta médica', exact: true }) });
  await expect(row.locator('td').last()).toHaveText('0');
  await page.getByRole('button', { name: 'Corrigir quantidade' }).click();
  await page.getByLabel('Quantidade', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Confirmar correção' }).click();
  await expect(row.locator('td').last()).toHaveText('7');
  await page.getByRole('button', { name: 'Enviar ao gerente' }).click();
  await expect(page.getByRole('button', { name: 'Registrar produção', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Validar e fechar mapa' }).click();
  await expect(page.getByRole('button', { name: 'Reabrir com justificativa' })).toBeVisible();
  await page.getByLabel('Justificativa de devolução / reabertura').fill('Correção solicitada pela equipe');
  await page.getByRole('button', { name: 'Reabrir com justificativa' }).click();
  await expect(page.getByText(/Em preenchimento · Revisão 2/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('esf-production-320.png'), fullPage: true });
});
test('failed production preserves fields and uses the same operation for retry', async ({ page }) => {
  const ids: string[] = [];
  await page.route('**/api/v1/esf/production', async route => { ids.push(route.request().postDataJSON().operationId); await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Conflito de teste: confira a versão' }) }); });
  await page.goto('/formularios-esf/producao?month=2026-09');
  await page.getByLabel('Data da produção').fill('2026-09-09');
  await page.getByRole('combobox', { name: 'Procedimento / categoria', exact: true }).selectOption('enf-consulta');
  await page.getByLabel('Quantidade', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Registrar produção', exact: true }).click();
  await expect(page.getByText('Conflito de teste: confira a versão')).toBeVisible();
  await expect(page.getByLabel('Quantidade', { exact: true })).toHaveValue('5');
  await page.getByRole('button', { name: 'Registrar produção', exact: true }).click();
  await expect.poll(() => ids.length).toBe(2); expect(ids[0]).toBe(ids[1]);
});
test('ESF team creation identifies nonpersistent demo behavior', async ({ page }) => {
  await page.goto('/administracao/equipes/novo');
  await page.getByLabel('Nome da equipe').fill('Equipe sintética');
  await page.getByLabel('Identificação institucional').fill('001-A');
  await page.getByLabel('Área de atuação').fill('Área de teste');
  await page.getByRole('button', { name: 'Cadastrar equipe', exact: true }).click();
  await expect(page.getByText('Cadastro simulado. Nenhuma equipe foi gravada no servidor.')).toBeVisible();
});

test('team allocation is separate from account invitation', async ({ page }) => {
  await page.goto('/administracao/equipes');
  await page.getByRole('button', { name: 'Gerenciar acessos da equipe' }).click();
  await expect(page.getByText('Executor sintético', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Vincular à equipe', exact: true }).click();
  await expect(page.getByText('Vínculo simulado. Nenhuma permissão real foi alterada.')).toBeVisible();
  await page.getByRole('button', { name: 'Remover da equipe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vincular à equipe', exact: true })).toBeVisible();
});
