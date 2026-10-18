import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdtempSync,readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test.use({serviceWorkers:'allow'});
const file=process.env.SGC_STAGING_ACCOUNTS_FILE;
if(!file)throw new Error('Arquivo de contas sintéticas obrigatório.');
const account=JSON.parse(readFileSync(file,'utf8')).accounts.find((a:{role:string})=>a.role==='GERENTE_UBS');
async function login(page:Page){await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(account.email);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Prioridades da unidade'})).toBeVisible();}

test('reinício sem rede recupera rascunho cifrado e confirma fila somente online',async({},info)=>{
  test.setTimeout(240_000);
  const profile=mkdtempSync(join(tmpdir(),'sgc-offline-reinicio-'));
  const baseURL=info.project.use.baseURL;
  let context=await chromium.launchPersistentContext(profile,{baseURL,serviceWorkers:'allow'});
  let page=await context.newPage();page.setDefaultTimeout(25_000);
  await login(page);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  const marker=`[HOMOLOGAÇÃO] Offline reinício ${Date.now()}`;
  await page.goto('/cadastros/knowledge');
  await page.getByRole('textbox',{name:/^Título/}).fill(marker);
  await page.getByLabel('Domínio institucional',{exact:false}).fill('gestao');
  await page.getByLabel('PIN do cofre (se estiver bloqueado)').fill('135790');
  await page.getByRole('button',{name:'Salvar no dispositivo',exact:true}).click();
  await expect(page.locator('.v2-draft').getByRole('status')).toContainText('Salvo neste dispositivo');
  const cachesStored=await page.evaluate(async()=>{const keys=await caches.keys();return (await Promise.all(keys.map(async key=>(await (await caches.open(key)).keys()).map(r=>new URL(r.url).pathname)))).flat();});
  expect(cachesStored).toContain('/offline');
  expect(cachesStored.some(path=>path.startsWith('/api/')||path.startsWith('/cadastros/'))).toBe(false);
  await context.close();
  // New browser process: no key, React state or open IndexedDB connection survives.
  context=await chromium.launchPersistentContext(profile,{baseURL,serviceWorkers:'allow'});
  page=await context.newPage();page.setDefaultTimeout(25_000);
  await context.setOffline(true);
  await page.goto('/offline');
  await expect(page.getByRole('heading',{name:'Área de trabalho offline'})).toBeVisible();
  await expect(page.getByText(marker,{exact:true})).toHaveCount(0);
  await page.getByLabel('PIN local',{exact:true}).fill('111111');
  await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('PIN incorreto');
  await page.getByLabel('PIN local',{exact:true}).fill('135790');
  await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Título',exact:true})).toHaveValue(marker);
  await page.getByRole('button',{name:'Preparar cadastro para envio',exact:true}).click();
  await expect(page.getByText('Aguardando envio',{exact:true})).toBeVisible();
  await expect(page.getByText('Confirmado pelo servidor',{exact:true})).toHaveCount(0);
  await context.setOffline(false);
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/v1/'))console.log(`Retomada: ${response.status()} ${path}`);});
  await page.getByRole('button',{name:'Sincronizar pendências'}).click();
  await expect(page.getByText('Confirmado pelo servidor',{exact:true})).toBeVisible({timeout:40_000});
  await page.reload();
  await page.getByLabel('PIN local',{exact:true}).fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();
  await expect(page.getByText('Confirmado pelo servidor',{exact:true})).toBeVisible();
  const list=await page.request.get(`/api/v1/knowledge?search=${encodeURIComponent(marker)}`);
  expect(list.ok()).toBeTruthy();
  const rows=(await list.json()).data.filter((r:{title:string})=>r.title===marker);
  expect(rows).toHaveLength(1);
  await page.screenshot({path:info.outputPath('reinicio-fila-confirmada.png'),fullPage:true});
  await context.setOffline(true);
  await page.clock.install({time:new Date()});
  await page.clock.fastForward(73*60*60*1000);
  await expect(page.getByRole('button',{name:'Desbloquear cofre',exact:true})).toBeVisible();
  await expect(page.getByRole('status')).toContainText(/bloqueado|expirado/);
  await expect(page.getByRole('textbox',{name:'Título',exact:true})).toHaveCount(0);
  await context.close();
});

async function unlockFromHeader(page:Page){await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByLabel('PIN local de 6 a 12 dígitos').fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('status')).toContainText('Dispositivo protegido');await page.getByRole('button',{name:'Fechar',exact:true}).click();}
async function unlockWorkbench(page:Page){await page.getByLabel('PIN local',{exact:true}).fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('button',{name:'Sincronizar pendências'})).toBeVisible();}

test('falha de armazenamento preserva formulário e logout remove o cofre privado',async({},info)=>{
  const context=await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(),'sgc-offline-quota-')),{baseURL:info.project.use.baseURL,serviceWorkers:'allow'});
  const page=await context.newPage();await login(page);await page.goto('/cadastros/knowledge');
  const title=page.getByRole('textbox',{name:/^Título/});
  await title.fill('[HOMOLOGAÇÃO] Cópia anterior preservada');
  await page.getByLabel('Domínio institucional',{exact:false}).fill('gestao');
  await page.getByLabel('PIN do cofre (se estiver bloqueado)').fill('135790');
  await page.getByRole('button',{name:'Salvar no dispositivo',exact:true}).click();
  await expect(page.locator('.v2-draft').getByRole('status')).toContainText('Salvo neste dispositivo');
  // Controlled browser fault injection, not a claim of physical low-disk testing.
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(this.name==='records'&&String(value.id).startsWith('draft:'))throw new DOMException('Armazenamento insuficiente','QuotaExceededError');return original.call(this,value,key);};});
  await title.fill('[HOMOLOGAÇÃO] Edição que não pode ser descartada');
  await page.getByRole('button',{name:'Salvar no dispositivo',exact:true}).click();
  await expect(page.locator('.v2-draft').getByRole('status')).toContainText('Armazenamento insuficiente');
  await expect(title).toHaveValue('[HOMOLOGAÇÃO] Edição que não pode ser descartada');
  await page.getByRole('button',{name:'Recuperar rascunho',exact:true}).click();
  await expect(title).toHaveValue('[HOMOLOGAÇÃO] Cópia anterior preservada');
  await page.getByRole('button',{name:/Abrir conta de/}).click();
  await page.getByRole('button',{name:'Sair deste dispositivo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
  expect(await page.evaluate(async()=>(await indexedDB.databases()).some(db=>db.name==='sgc-ubs-offline'))).toBe(false);
  await page.goto('/offline');await page.getByLabel('PIN local',{exact:true}).fill('135790');
  await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Prepare o cofre online');
  await context.close();
});

test('anexo interrompido retoma após reinício e conflito de ação preserva versões até resolução auditada',async({},info)=>{
  test.setTimeout(300_000);
  const profile=mkdtempSync(join(tmpdir(),'sgc-offline-anexo-'));const baseURL=info.project.use.baseURL;
  let context=await chromium.launchPersistentContext(profile,{baseURL,serviceWorkers:'allow'});
  let page=await context.newPage();page.setDefaultTimeout(25_000);await login(page);
  const workspace=await (await page.request.get('/api/v1/offline/context')).json();
  const suffix=Date.now();const what=`[HOMOLOGAÇÃO] Ação offline ${suffix}`;
  const planResponse=await page.request.post('/api/v1/action-plans',{data:{operationId:crypto.randomUUID(),organizationId:workspace.organizationId,unitId:workspace.unitId,title:`[HOMOLOGAÇÃO] Plano offline ${suffix}`}});expect(planResponse.ok()).toBeTruthy();const plan=await planResponse.json();
  const actionResponse=await page.request.post(`/api/v1/action-plans/${plan.id}/actions`,{data:{operationId:crypto.randomUUID(),what,why:'Homologação da concorrência offline',where:'UBS Sintética A',whenAt:'2026-12-20T12:00:00Z',whoId:workspace.userId,how:'Teste administrativo sem dado clínico',howMuch:0}});expect(actionResponse.ok()).toBeTruthy();const action=await actionResponse.json();
  await page.goto(`/registros/actions/${action.id}`);await unlockFromHeader(page);
  await page.getByRole('button',{name:'Disponibilizar neste dispositivo',exact:true}).click();await expect(page.getByText('Registro cifrado e disponível na área offline.',{exact:false})).toBeVisible();
  const deviceId=await page.evaluate(()=>new Promise<string>((resolve,reject)=>{const r=indexedDB.open('sgc-ubs-offline');r.onsuccess=()=>{const db=r.result;const q=db.transaction('meta').objectStore('meta').get('vault');q.onsuccess=()=>{resolve(q.result.deviceId);db.close();};q.onerror=()=>reject(q.error);};}));
  await context.setOffline(true);
  await page.getByLabel('Arquivo de evidência',{exact:true}).setInputFiles({name:`offline-${suffix}.csv`,mimeType:'text/csv',buffer:Buffer.from('tipo,valor\nsintetico-confidencial,30\n')});
  await page.getByRole('button',{name:'Guardar anexo cifrado para envio',exact:true}).click();await expect(page.getByText('Anexo cifrado neste dispositivo.',{exact:false})).toBeVisible();
  const progress=page.locator('section').filter({has:page.getByRole('heading',{name:'Atualizar acompanhamento',exact:true})});
  await progress.getByLabel('Situação',{exact:false}).selectOption('EM_ANDAMENTO');await progress.getByLabel('Percentual concluído',{exact:false}).fill('30');await progress.getByRole('button',{name:'Atualizar acompanhamento',exact:true}).click();await expect(progress.locator('form').getByRole('status')).toContainText('Aguardando envio');
  await context.close();
  const other=await chromium.launch();const otherContext=await other.newContext({baseURL,serviceWorkers:'block'});const otherPage=await otherContext.newPage();await login(otherPage);
  const changed=await otherPage.request.post(`/api/v1/actions/${action.id}/update`,{data:{operationId:crypto.randomUUID(),expectedVersion:1,status:'EM_ANDAMENTO',percentage:60,comment:'Alteração concorrente sintética de homologação'}});expect(changed.ok()).toBeTruthy();await other.close();
  context=await chromium.launchPersistentContext(profile,{baseURL,serviceWorkers:'allow'});await context.setOffline(true);page=await context.newPage();page.setDefaultTimeout(25_000);await page.goto('/offline');await unlockWorkbench(page);
  await expect(page.getByText(`offline-${suffix}.csv`,{exact:false})).toBeVisible();
  await context.setOffline(false);
  await page.route('**/storage/v1/object/upload/sign/**',route=>route.abort());
  await page.getByRole('button',{name:'Sincronizar pendências'}).click();await expect(page.getByRole('status')).toContainText('Envio interrompido');
  await context.close();
  context=await chromium.launchPersistentContext(profile,{baseURL,serviceWorkers:'allow'});page=await context.newPage();page.setDefaultTimeout(25_000);await page.goto('/offline');await unlockWorkbench(page);
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/v1/'))console.log(`Envio: ${request.method()} ${path}`);});
  page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/api/v1/'))console.log(`Resposta: ${response.status()} ${path}`);});
  const guarded=await page.request.post(`/api/v1/actions/${action.id}/update`,{timeout:15_000,headers:{'x-device-id':deviceId},data:{operationId:crypto.randomUUID(),expectedVersion:1,percentage:30}}).catch(()=>{throw new Error('A requisição com dispositivo não respondeu no tempo esperado. Credenciais omitidas.');});
  expect(guarded.status(),await guarded.text()).toBe(409);
  await page.getByRole('button',{name:'Sincronizar pendências'}).click();
  await expect(page.getByText('Conflito — entidade bloqueada nesta fila',{exact:true})).toBeVisible({timeout:45_000});
  await expect(page.locator('pre').first()).toContainText('30');await expect(page.locator('pre').nth(1)).toContainText('60');
  const attached=await (await page.request.get(`/api/v1/actions/${action.id}`)).json();expect(attached.related.attachments).toHaveLength(1);expect(attached.related.attachments[0].status).toBe('AVAILABLE');
  await page.getByLabel('Versão a manter').selectOption('KEEP_CLIENT');await page.getByLabel('Justificativa da resolução').fill('Revisão sintética autorizada: reaplicar o progresso local de trinta por cento.');
  const resolutionRequest=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/v1/offline/resolve');
  await page.getByRole('button',{name:'Confirmar resolução auditada'}).click();await expect(page.getByRole('status')).toContainText('Conflito resolvido e auditado');
  const repeated=await page.request.post('/api/v1/offline/resolve',{headers:{'x-device-id':deviceId},data:(await resolutionRequest).postDataJSON()});
  expect(repeated.status()).toBe(200);expect((await repeated.json()).duplicate).toBe(true);
  const resolved=await (await page.request.get(`/api/v1/actions/${action.id}`)).json();expect(resolved.record.percentage).toBe(30);expect(resolved.record.version).toBe(3);expect(resolved.related.comments.some((c:{comment:string})=>c.comment.includes('Resolução offline')&&c.comment.includes('Revisão sintética autorizada'))).toBe(true);
  // Qualify the alternative resolution against the real synthetic database too.
  const sourceOperationId=crypto.randomUUID();
  const staleAgain=await page.request.post(`/api/v1/actions/${action.id}/update`,{data:{operationId:sourceOperationId,expectedVersion:2,percentage:5}});
  expect(staleAgain.status()).toBe(409);
  const keepServerBody={operationId:crypto.randomUUID(),sourceOperationId,entityId:action.id,expectedVersion:3,strategy:'KEEP_SERVER',justification:'Revisão sintética: preservar os dados atuais do servidor.',client:{percentage:5}};
  const kept=await page.request.post('/api/v1/offline/resolve',{headers:{'x-device-id':deviceId},data:keepServerBody});expect(kept.status()).toBe(200);
  const keptReplay=await page.request.post('/api/v1/offline/resolve',{headers:{'x-device-id':deviceId},data:keepServerBody});expect((await keptReplay.json()).duplicate).toBe(true);
  const final=await (await page.request.get(`/api/v1/actions/${action.id}`)).json();expect(final.record.percentage).toBe(30);expect(final.record.version).toBe(4);expect(final.related.comments.filter((c:{comment:string})=>c.comment.includes(keepServerBody.sourceOperationId))).toHaveLength(1);
  await page.screenshot({path:info.outputPath('anexo-conflito-resolvido.png'),fullPage:true});await context.close();
});

test('revogação de dispositivo sintético bloqueia reconexão e mantém pendências cifradas',async({},info)=>{
  test.skip(process.env.SGC_STAGING_REVOKE_DEVICE!=='true','Exige operador: revogar somente o UUID novo informado pelo teste.');
  test.setTimeout(180_000);
  const context=await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(),'sgc-offline-revogacao-')),{baseURL:info.project.use.baseURL,serviceWorkers:'allow'});
  const page=await context.newPage();page.setDefaultTimeout(25_000);await login(page);
  await page.goto('/cadastros/knowledge');await page.getByRole('textbox',{name:/^Título/}).fill(`[HOMOLOGAÇÃO] Rascunho revogação ${Date.now()}`);await page.getByLabel('Domínio institucional',{exact:false}).fill('gestao');await page.getByLabel('PIN do cofre (se estiver bloqueado)').fill('135790');await page.getByRole('button',{name:'Salvar no dispositivo',exact:true}).click();await expect(page.locator('.v2-draft').getByRole('status')).toContainText('Salvo neste dispositivo');
  const device=await page.evaluate(()=>new Promise<{deviceId:string;userId:string;organizationId:string}>((resolve,reject)=>{const request=indexedDB.open('sgc-ubs-offline');request.onsuccess=()=>{const db=request.result;const read=db.transaction('meta').objectStore('meta').get('vault');read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error);}));
  const label=`HOMOLOGACAO-OFFLINE-REVOGACAO-${Date.now()}`;
  const registration=await page.request.post('/api/v1/devices/register',{data:{deviceId:device.deviceId,organizationId:device.organizationId,label,platform:'Teste sintético de revogação'}});expect(registration.ok()).toBeTruthy();
  await page.goto('/offline');await unlockWorkbench(page);
  // The external test operator revokes only this newly created synthetic ID.
  writeFileSync('test-results/staging/revocation-device.json',JSON.stringify({deviceId:device.deviceId,userId:device.userId,organizationId:device.organizationId,label,createdForThisTest:true}));
  console.log('Dispositivo sintético aguardando revogação controlada.');
  await expect(page.getByRole('button',{name:'Desbloquear cofre',exact:true})).toBeVisible({timeout:100_000});
  await expect(page.getByRole('status')).toContainText(/bloqueado|autorização/);
  const denied=await page.request.post('/api/v1/knowledge',{headers:{'x-device-id':device.deviceId},data:{operationId:crypto.randomUUID(),organizationId:device.organizationId,unitId:'32747837-0478-49b4-be4d-f96d5e120c1d',title:'[HOMOLOGAÇÃO] Não pode gravar após revogação',type:'MANUAL',domain:'gestao'}});expect(denied.status()).toBe(401);
  const count=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{const request=indexedDB.open('sgc-ubs-offline');request.onsuccess=()=>{const db=request.result;const read=db.transaction('records').objectStore('records').count();read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>reject(read.error);};}));expect(count).toBeGreaterThan(1);
  await context.setOffline(true);await page.getByLabel('PIN local',{exact:true}).fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('status')).toContainText(/expirou|expirado|revogado/);
  await page.screenshot({path:info.outputPath('revogacao-pendencias-preservadas.png'),fullPage:true});await context.close();
});
