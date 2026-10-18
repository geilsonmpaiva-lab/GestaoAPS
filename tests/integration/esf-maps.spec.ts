import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mapDefinition, mapIds } from '../../src/lib/esf/maps';
import type { EsfField } from '../../src/lib/esf/catalog';
import { esfReferenceItems } from '../../src/lib/esf/reference-items';
import { execFileSync } from 'node:child_process';
import { buildProductionPaper } from '../../src/lib/esf/paper';
import type { EsfProductionData } from '../../src/lib/esf/production';
import { applyStagingSso, artifactRoot } from './staging-browser';
const accounts = JSON.parse(readFileSync(process.env.SGC_STAGING_ACCOUNTS_FILE!, 'utf8')).accounts as { role: string; email: string; password: string }[];
async function login(page: Page, role: string) {
  await applyStagingSso(page.context()); const account = accounts.find(a => a.role === role)!;
  await page.goto('/login'); await page.getByLabel('E-mail', { exact: true }).fill(account.email); await page.getByLabel('Senha', { exact: true }).fill(account.password); await page.getByRole('button', { name: 'Entrar', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Prioridades da unidade' })).toBeVisible();
}
async function postButton(page: Page, name: string, path = '/api/v1/esf/maps') {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === 'POST').catch(async () => { throw new Error(`Comando não enviado: ${(await page.locator('[role="status"]').allTextContents()).join(' | ')}`); });
  await page.getByRole('button', { name, exact: true }).click(); const result = await response; expect(result.status(), await result.text()).toBeLessThan(300); return result.json();
}
async function unit(page: Page, letter: string) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/workspace/scope' && r.request().method() === 'POST');
  await page.getByRole('combobox', { name: 'Unidade de trabalho' }).selectOption({ label: `[HOMOLOGAÇÃO] UBS Sintética ${letter} · [HOMOLOGAÇÃO] Município Sintético` }); expect((await response).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Prioridades da unidade' })).toBeVisible();
}
async function team(page: Page, name: string) {
  await page.goto('/administracao/equipes/novo'); await page.getByLabel('Nome da equipe').fill(name); await page.getByLabel('Identificação institucional').fill(name.slice(-25)); await page.getByLabel('Área de atuação').fill('[SINTÉTICO] Área de homologação');
  const result = await postButton(page, 'Cadastrar equipe', '/api/v1/esf/teams'); await expect(page).toHaveURL(/\/administracao\/equipes$/); return result.id as string;
}
async function fillFields(root: Locator, fields: EsfField[], form: string) {
  for (const field of fields) {
    if (field.type === 'calculated' || field.type === 'attachment' || form === 'obitos' && ['age', 'ageUnit'].includes(field.key)) continue;
    const input = root.getByLabel(field.label, { exact: true });
    if (field.options) await input.selectOption(field.options[0]);
    else if (field.type === 'date') await input.fill(field.key === 'birthDate' && form !== 'nascidos-vivos' ? '1950-01-01' : '2028-01-02');
    else if (['integer', 'decimal'].includes(field.type)) await input.fill(field.key === 'previousBalance' ? '100' : field.key === 'losses' ? '0' : '4');
    else await input.fill(`[SINTÉTICO] ${field.key}`);
  }
}
test('nine ESF maps: real synthetic persistence, filled/calculated PDF, closure, profiles and two UBS', async ({ page, browser }) => {
  test.setTimeout(600000); const suffix = Date.now();
  await login(page, 'ADMIN_SISTEMA'); await unit(page, 'B'); const teamB = await team(page, `[HOMOLOGAÇÃO] ESF B ${suffix}`); await page.goto('/'); await unit(page, 'A'); const teamA = await team(page, `[HOMOLOGAÇÃO] ESF A ${suffix}`);
  const managerContext = await browser.newContext(); const manager = await managerContext.newPage(); await login(manager, 'GERENTE_UBS');
  let materialId = '', materialInput: unknown;
  for (const id of mapIds.filter(id => !process.env.SGC_ESF_ONLY || process.env.SGC_ESF_ONLY.split(',').includes(id))) {
    console.log(`Validando mapa sintético: ${id}`);
    const def = mapDefinition(id)!;
    await manager.goto(`/formularios-esf/${id}?team=${teamA}`); await expect(manager.getByRole('heading', { name: 'Homologação com dados sintéticos' })).toBeVisible();
    await manager.getByLabel('Competência do mapa', { exact: true }).fill('2028-01');
    if (id === 'insulinas') { await postButton(manager, 'Confirmar mapa no servidor'); await expect(manager).toHaveURL(/map=/); }
    const header = manager.locator('section').filter({ has: manager.getByRole('heading', { name: 'Cabeçalho do mapa', exact: true }) });
    await fillFields(header, def.headers, id);
    for (const section of def.sections) {
      if (def.sections.length > 1) await manager.getByLabel('Bloco do formulário', { exact: true }).selectOption(section.id);
      const form = manager.locator('form').filter({ has: manager.getByRole('heading', { name: 'Adicionar lançamento', exact: true }) });
      await fillFields(form, section.fields, id);
      if(id==='insulinas'&&section.id==='supplies')await form.getByLabel(section.fields.find(f=>f.key==='item')!.label,{exact:true}).fill('Agulhas');
      if(id==='insulinas'&&section.id==='insulinStock'){
        await form.getByLabel(section.fields.find(f=>f.key==='insulinType')!.label,{exact:true}).fill('NPH');
        await form.getByLabel(section.fields.find(f=>f.key==='presentation')!.label,{exact:true}).fill('Frasco');
      }
      if(esfReferenceItems[id]) await form.getByRole('combobox',{name:'Item do formulário revisado',exact:true}).selectOption(esfReferenceItems[id][0].line);
      if (section.id === 'deliveries') {
        await form.getByLabel('Selecionar comprovante sintético').setInputFiles({ name: 'comprovante-sintetico.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64') });
        await postButton(manager, 'Enviar comprovante sintético', '/api/v1/esf/maps/receipt');
        await expect(manager.getByRole('link', { name: 'Baixar comprovante confirmado' })).toBeVisible();
        const receiptUrl = await manager.getByRole('link', { name: 'Baixar comprovante confirmado' }).getAttribute('href'); const receipt = await manager.request.get(receiptUrl!); expect(receipt.status()).toBe(200); expect(receipt.headers()['content-type']).toBe('image/png');
      }
      await form.getByRole('button', { name: 'Adicionar linha nesta tela', exact: true }).click();
    }
    let savedInput: unknown; const capture = (r: import('@playwright/test').Request) => { if (new URL(r.url()).pathname === '/api/v1/esf/maps' && r.method() === 'POST') savedInput = r.postDataJSON(); }; manager.on('request', capture);
    const saved = await postButton(manager, 'Confirmar mapa no servidor'); manager.off('request', capture);
    await expect(manager).toHaveURL(new RegExp(`map=${saved.id}`));
    if (id === 'materiais') { materialId = saved.id; materialInput = savedInput; }
    await manager.reload(); await expect(manager.getByRole('link', { name: 'Abrir formulário preenchido / PDF' })).toBeVisible();
    await postButton(manager, 'Enviar à revisão de teste'); await expect(manager.getByRole('button', { name: 'Fechar mapa de teste', exact: true })).toBeVisible();
    await postButton(manager, 'Fechar mapa de teste'); await expect(manager.getByRole('button', { name: 'Reabrir mapa de teste', exact: true })).toBeVisible();
    const print = await managerContext.newPage();
    await print.goto(`/formularios-esf/${id}/impressao?team=${teamA}&map=${saved.id}`);
    await expect(print.getByText('SNAPSHOT DE TESTE', { exact: false }).first()).toBeVisible(); await expect(print.locator('.esf-faithful-report')).toContainText('[SINTÉTICO]');
    const svg=print.locator('svg.esf-source-canvas').first();await expect(svg).toHaveAttribute('data-source-svg',/\/esf\/revisados\/.+_revisado\.svg$/);
    const source=await print.request.get((await svg.getAttribute('data-source-svg'))!);expect(source.status()).toBe(200);await expect(svg).toBeVisible();
    // Horizontal SVG lines have zero-height bounding boxes: inspect their stroke,
    // then validate the painted result in the rendered PDF rather than visibility.
    await expect(svg.locator('.esf-source-background line').first()).toHaveAttribute('stroke',/#[0-9a-f]+/i);
    if (id === 'medicamentos') { await expect(print.locator('.esf-faithful-report')).toContainText('100'); await expect(print.locator('.esf-faithful-report')).toContainText('8'); }
    await print.pdf({ path: `${artifactRoot}/esf-${id}-preenchido.pdf`, preferCSSPageSize: true, printBackground: true }); await print.close();
    await manager.setViewportSize({ width: 320, height: 760 });
    expect(await manager.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await manager.screenshot({ path: `${artifactRoot}/esf-${id}-320.png` }); await manager.setViewportSize({ width: 1280, height: 720 });
  }
  const readerContext = await browser.newContext(); const reader = await readerContext.newPage(); await login(reader, 'LEITOR');
  expect((await reader.request.get(`/api/v1/esf/maps?form=materiais&team=${teamA}&map=${materialId}`)).status()).toBe(403);
  expect((await reader.request.post('/api/v1/esf/maps', { data: materialInput })).status()).toBe(403);
  await reader.goto(`/formularios-esf/materiais?team=${teamB}`); await expect(reader.getByRole('heading', { name: 'Homologação com dados sintéticos' })).toBeVisible(); await expect(reader.getByRole('button', { name: 'Confirmar mapa no servidor' })).toHaveCount(0);
  await reader.goto(`/formularios-esf/hanseniase?team=${teamB}`); await expect(reader.getByText('Não foi possível abrir este mapa ou equipe.', { exact: false })).toBeVisible();
  await readerContext.close(); await managerContext.close();
});

test('original 25-line production sheet: visual fixture with 12 months and calculated total',async({page})=>{
  await login(page,'GERENTE_UBS');
  const styles=await page.locator('link[rel="stylesheet"]').evaluateAll(nodes=>nodes.map(node=>(node as HTMLLinkElement).href));
  const data={annual:Array.from({length:12},(_,i)=>({competency:`2028-${String(i+1).padStart(2,'0')}`,procedureId:'med-consulta',quantity:i+1})),monthly:null} as EsfProductionData;
  const document=buildProductionPaper(data,'2028-01',{organization:'[HOMOLOGAÇÃO] Município sintético',unit:'[HOMOLOGAÇÃO] UBS de teste',team:'[SINTÉTICO] ESF de conferência'});
  // Playwright transforms TSX into component-test descriptors, not React nodes.
  // Compile the trusted app component with the same automatic JSX runtime instead.
  const script=`import{build}from'esbuild';import{createElement}from'react';import{renderToStaticMarkup}from'react-dom/server';const r=await build({entryPoints:['src/components/esf-paper-report.tsx'],bundle:true,platform:'node',format:'esm',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});const m=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));process.stdout.write(renderToStaticMarkup(createElement(m.EsfPaperReport,{document:JSON.parse(process.argv[1])})));`;
  const html=execFileSync(process.execPath,['--input-type=module','-e',script,JSON.stringify(document)],{encoding:'utf8',maxBuffer:8*1024*1024});
  await page.setContent(`<html lang="pt-BR"><head>${styles.map(href=>`<link rel="stylesheet" href="${href}">`).join('')}</head><body><main class="esf-print-page esf-faithful-print">${html}</main></body></html>`);
  await expect(page.locator('svg.esf-source-canvas')).toHaveAttribute('data-source-svg',/01_producao_consolidada_revisado.svg$/);await expect(page.locator('.esf-source-background')).toContainText('PRODUÇÃO CONSOLIDADA');
  await expect(page.locator('[data-paper-cell="Consulta médica:TOTAL"]')).toContainText('78');
  await page.pdf({path:`${artifactRoot}/esf-producao-fiel-fixture.pdf`,preferCSSPageSize:true,printBackground:true});
});
