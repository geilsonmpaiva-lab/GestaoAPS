import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, failFirst = false) {
  const submissions: { operationId: string; selection: string[] }[] = [];
  await page.route('**/api/v1/admin/cnes?*', async route => {
    const url = new URL(route.request().url());
    const unit = (cnes: string, alreadyRegistered = false) => ({ cnes, name: `UBS teste ${cnes}`, type: '2', municipality: '230020', sourceUpdatedAt: '2025-09-03', alreadyRegistered, address: { street: 'Rua de teste, 123', neighborhood: 'Centro', city: 'ACARAU', state: 'CE', postalCode: '62580000' } });
    const body = url.searchParams.get('action') === 'municipalities' ? { municipalities: [{ code: '230020', name: 'ACARAU', uf: 'CE' }] } : { units: url.searchParams.get('offset') === '20' ? [unit('0220949')] : [unit('0808792'), unit('3657973', true)], nextOffset: url.searchParams.get('offset') === '20' ? null : 20, fetchedAt: '2026-09-09T15:00:00Z' };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/v1/admin/cnes', async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ status: failFirst && submissions.length === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failFirst && submissions.length === 1 ? { error: 'Falha temporária de teste' } : { mode: 'demo', created: submissions.at(-1)!.selection.map(cnes => ({ cnes, name: `UBS teste ${cnes}`, id: cnes })), skipped: [] }) });
  });
  await page.goto('/administracao/unidades');
  await page.getByRole('link', { name: 'Buscar no CNES' }).click();
  await page.getByRole('button', { name: 'Carregar municípios' }).click();
  await page.getByRole('combobox', { name: 'Município', exact: true }).selectOption('230020');
  await page.getByRole('button', { name: 'Buscar unidades', exact: true }).click();
  return submissions;
}

test('CNES selection, paging and explicit review work on narrow screens', async ({ page }, info) => {
  const submissions = await prepare(page);
  await expect(page.getByRole('checkbox', { name: /Já cadastrada/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Selecionar.*0808792/ }).check();
  await page.getByRole('button', { name: 'Carregar mais unidades' }).click();
  await page.getByRole('checkbox', { name: /Selecionar.*0220949/ }).check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('cnes-results.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Revisar 2 selecionada(s)' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar 2 unidade(s)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Revisar 2 unidade(s)' })).toBeFocused();
  expect(submissions).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('cnes-review.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cadastrar selecionadas' }).click();
  await expect(page.getByText('Nenhum dado foi gravado nesta demonstração.')).toBeVisible();
  expect(submissions[0].selection).toEqual(['0220949', '0808792']);
});

test('local filter and bulk selection preserve the selection across review', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: 'Carregar mais unidades' }).click();
  await page.getByLabel('Filtrar resultados carregados').fill('0220949');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('button', { name: 'Selecionar disponíveis (até 20)' }).click();
  await page.getByLabel('Filtrar resultados carregados').fill('0808792');
  await page.getByRole('button', { name: 'Selecionar disponíveis (até 20)' }).click();
  await page.getByRole('button', { name: 'Revisar 2 selecionada(s)' }).click();
  await page.getByRole('button', { name: 'Voltar à seleção' }).click();
  await expect(page.getByRole('heading', { name: 'Unidades encontradas' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Revisar 2 selecionada(s)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Limpar seleção', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Revisar 0 selecionada(s)' })).toBeDisabled();
});

test('CNES failure preserves review and operation id for safe retry', async ({ page }) => {
  const submissions = await prepare(page, true);
  await page.getByRole('checkbox', { name: /Selecionar.*0808792/ }).check();
  await page.getByRole('button', { name: 'Revisar 1 selecionada(s)' }).click();
  await page.getByRole('button', { name: 'Cadastrar selecionadas' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Falha temporária de teste' })).toBeVisible();
  await page.getByRole('button', { name: 'Cadastrar selecionadas' }).click();
  await expect(page.getByRole('heading', { name: 'Simulação concluída' })).toBeVisible();
  expect(submissions).toHaveLength(2); expect(submissions[0].operationId).toBe(submissions[1].operationId);
});

test('changing the geographic filter clears stale selections', async ({ page }) => {
  await prepare(page);
  await page.getByRole('checkbox', { name: /Selecionar.*0808792/ }).check();
  await page.getByRole('button', { name: 'Alterar busca' }).click();
  await page.getByRole('combobox', { name: 'UF', exact: true }).selectOption('SP');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Município', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Buscar unidades', exact: true })).toBeDisabled();
});
