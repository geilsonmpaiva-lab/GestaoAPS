import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
const file=process.env.SGC_STAGING_ACCOUNTS_FILE;
if(!file)throw new Error('Contas sintéticas obrigatórias.');
const accounts: Array<{email:string;password:string;role:string}>=JSON.parse(readFileSync(file,'utf8')).accounts;
const org='362db1a9-bfdd-4334-9436-46b1c0117eab',unit='32747837-0478-49b4-be4d-f96d5e120c1d';
const section=(page:Page,title:string)=>page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
async function login(page:Page,role:string){
 const account=accounts.find(a=>a.role===role)!;await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(account.email);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Prioridades da unidade'})).toBeVisible();
 if(role==='ADMIN_SISTEMA'){
  const scope=page.getByRole('combobox',{name:'Unidade de trabalho'});
  const changed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/workspace/scope'&&r.request().method()==='POST');
  await scope.selectOption(`${org}:${unit}`);expect((await changed).status()).toBe(200);await expect(scope).toHaveValue(`${org}:${unit}`);
 }
}
async function post(page:Page,path:string,data:Record<string,unknown>){const response=await page.request.post(`/api/v1/${path}`,{data:{operationId:crypto.randomUUID(),...data}}).catch(()=>{throw new Error('Requisição sintética interrompida. Credenciais omitidas.');});expect(response.ok(),`${path}: ${await response.text()}`).toBeTruthy();return response.json();}
async function detail(page:Page,resource:string,id:string){await page.goto(`/registros/${resource}/${id}`);await expect(page.getByRole('heading',{name:'Informações do registro',exact:true})).toBeVisible();}
async function unlockHeader(page:Page){await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByLabel('PIN local de 6 a 12 dígitos').fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Dispositivo protegido');await page.getByRole('button',{name:'Fechar',exact:true}).click();}
async function unlockWorkbench(page:Page){await page.getByLabel('PIN local',{exact:true}).fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('button',{name:'Sincronizar pendências',exact:true})).toBeVisible();}
type Envelope=Record<string,unknown> & {operationId:string;deviceId:string};
async function prepare(page:Page,context:BrowserContext,resource:string,id:string,title:string,fields:Record<string,string>={},attachment=false){
 await detail(page,resource,id);await unlockHeader(page);
 await page.getByRole('button',{name:'Disponibilizar neste dispositivo',exact:true}).click();await expect(page.getByText('Registro cifrado e disponível', {exact:false})).toBeVisible();
 const form=section(page,title);for(const [label,value] of Object.entries(fields)){const field=form.getByLabel(label,{exact:false});if(await field.evaluate(el=>el.tagName==='SELECT'))await field.selectOption(value);else await field.fill(value);}
 await context.setOffline(true);
 if(attachment){await page.getByLabel('Arquivo de evidência',{exact:true}).setInputFiles({name:'evidencia-offline-sintetica.csv',mimeType:'text/csv',buffer:Buffer.from('registro,valor\nsintetico,1\n')});await page.getByRole('button',{name:'Guardar anexo cifrado para envio',exact:true}).click();await expect(page.getByText('Anexo cifrado neste dispositivo.',{exact:false})).toBeVisible();}
 await form.getByRole('checkbox',{name:/Confirmo a preparação offline/}).check();await form.getByRole('button',{name:title,exact:true}).click();await expect(form.locator('form').getByRole('status')).toContainText('Aguardando envio');
}
async function synchronize(page:Page,context:BrowserContext,title:string,lostResponse=false){
 await context.setOffline(false);await page.goto('/offline');await unlockWorkbench(page);
 let original:Envelope|undefined;
 const capture=(request:import('@playwright/test').Request)=>{if(new URL(request.url()).pathname==='/api/v1/offline/transitions')original=request.postDataJSON();};page.on('request',capture);
 if(lostResponse){await page.route('**/api/v1/offline/transitions',async route=>{const result=await route.fetch();expect(result.status()).toBe(200);await route.abort();},{times:1});await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();await expect(page.getByRole('status')).toContainText('Itens preservados');}
 await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();
 const queued=section(page,title);await expect(queued.getByText('Confirmado pelo servidor',{exact:true})).toBeVisible({timeout:45000});
 page.off('request',capture);expect(original).toBeDefined();
 const repeated=await page.request.post('/api/v1/offline/transitions',{headers:{'x-device-id':original!.deviceId},data:original}).catch(()=>{throw new Error('Reenvio sintético interrompido. Credenciais omitidas.');});expect(repeated.status(),await repeated.text()).toBe(200);expect((await repeated.json()).duplicate).toBe(true);
 console.log(`Transição offline confirmada: ${title}`);return original!;
}

test('transições críticas persistem com snapshots reais, anexos e reenvio sem duplicação',async({page,context,browser})=>{
 test.setTimeout(900000);const suffix=Date.now();const operations:Envelope[]=[];
 await login(page,'ADMIN_SISTEMA');
 const k=await post(page,'knowledge',{organizationId:org,unitId:unit,title:`[HOMOLOGAÇÃO] Offline crítico ${suffix}`,type:'MANUAL',domain:'gestao'});
 const kv=await post(page,`knowledge/${k.id}/versions`,{expectedVersion:1,content:{instructions:'Conteúdo administrativo exclusivamente sintético.'},references:[],validFrom:'2026-01-01'});
 for(const title of ['Enviar para revisão','Aprovar conteúdo','Publicar conteúdo']){await prepare(page,context,'knowledge-versions',kv.id,title);operations.push(await synchronize(page,context,title,title==='Publicar conteúdo'));}
 expect((await (await page.request.get(`/api/v1/knowledge-versions/${kv.id}`)).json()).record.status).toBe('PUBLISHED');
 const p=await post(page,'protocols',{organizationId:org,unitId:unit,code:`OFF-${suffix}`,title:`[HOMOLOGAÇÃO] Protocolo offline ${suffix}`,domain:'QUALIDADE'});
 const pv=await post(page,`protocols/${p.id}/versions`,{expectedVersion:1,content:{instructions:'Protocolo sintético de homologação.',knowledgeVersionId:kv.id},validFrom:'2026-01-01'});
 await post(page,`protocol-versions/${pv.id}/forms`,{name:'Checklist sintético',fields:[{key:'quantidade',label:'Quantidade sintética',type:'number',required:true}]});
 for(const title of ['Enviar protocolo para revisão','Aprovar protocolo','Publicar protocolo']){await prepare(page,context,'protocol-versions',pv.id,title);operations.push(await synchronize(page,context,title));}
 const managerContext=await browser.newContext({baseURL:page.url().split('/offline')[0],serviceWorkers:'allow'});const manager=await managerContext.newPage();await login(manager,'GERENTE_UBS');
 const execution=await post(manager,`protocol-versions/${pv.id}/executions`,{executionId:crypto.randomUUID(),unitId:unit});
 await post(manager,`executions/${execution.id}/responses`,{expectedVersion:1,responses:[{fieldKey:'quantidade',value:7}]});
 await prepare(manager,managerContext,'executions',execution.id,'Concluir execução e calcular indicador',{},true);operations.push(await synchronize(manager,managerContext,'Concluir execução e calcular indicador'));
 const completed=await (await manager.request.get(`/api/v1/executions/${execution.id}`)).json();expect(completed.record.status).toBe('COMPLETED');expect(completed.related.attachments).toHaveLength(1);expect(completed.related.attachments[0].status).toBe('AVAILABLE');
 const plan=await post(manager,'action-plans',{organizationId:org,unitId:unit,title:`[HOMOLOGAÇÃO] Plano offline ${suffix}`});
 const action=await post(manager,`action-plans/${plan.id}/actions`,{what:'Ação sintética',why:'Homologação',where:'UBS sintética',whenAt:'2026-12-30T12:00:00Z',whoId:'d439f7ad-7068-4ef9-b79e-4d36bd193ada',how:'Verificação controlada',howMuch:0});
 await prepare(manager,managerContext,'actions',action.id,'Concluir ação');operations.push(await synchronize(manager,managerContext,'Concluir ação'));
 await prepare(manager,managerContext,'action-plans',plan.id,'Registrar verificação de eficácia',{'O plano foi eficaz?':'true','Justificativa da avaliação':'Eficácia sintética confirmada na homologação.'});operations.push(await synchronize(manager,managerContext,'Registrar verificação de eficácia'));
 const meeting=await post(manager,'meetings',{organizationId:org,unitId:unit,title:`[HOMOLOGAÇÃO] Reunião offline ${suffix}`,startsAt:'2026-12-01T12:00:00Z'});
 await post(manager,`meetings/${meeting.id}/agenda`,{position:1,title:'Pauta sintética'});
 const attendance=await manager.request.put(`/api/v1/meetings/${meeting.id}/participants/d439f7ad-7068-4ef9-b79e-4d36bd193ada`,{data:{attended:true}});expect(attendance.ok()).toBeTruthy();
 await prepare(manager,managerContext,'meetings',meeting.id,'Iniciar reunião');operations.push(await synchronize(manager,managerContext,'Iniciar reunião'));
 const referral=await post(manager,`meetings/${meeting.id}/referrals`,{description:'Encaminhamento sintético para testar sincronização.',responsibleId:'d439f7ad-7068-4ef9-b79e-4d36bd193ada',dueAt:'2026-12-15T12:00:00Z'});
 await prepare(manager,managerContext,'referrals',referral.id,'Converter encaminhamento em ação');operations.push(await synchronize(manager,managerContext,'Converter encaminhamento em ação'));
 await prepare(manager,managerContext,'meetings',meeting.id,'Registrar ata e encerrar reunião',{'Ata: discussões, decisões e encaminhamentos':'Ata sintética: verificadas as transições offline e o acompanhamento.'});operations.push(await synchronize(manager,managerContext,'Registrar ata e encerrar reunião'));
 expect((await (await manager.request.get(`/api/v1/meetings/${meeting.id}`)).json()).record.status).toBe('COMPLETED');
 writeFileSync('test-results/staging/critical-operations.json',JSON.stringify(operations.map(({operationId,entityId,resource,command})=>({operationId,entityId,resource,command}))));
 await managerContext.close();
});

for(const decision of ['KEEP_SERVER','RETRY'] as const)test(`alteração de pauta gera conflito real e resolução autorizada ${decision}`,async({page,context,browser})=>{
 test.setTimeout(300000);await login(page,'GERENTE_UBS');
 const meeting=await post(page,'meetings',{organizationId:org,unitId:unit,title:`[HOMOLOGAÇÃO] Conflito offline ${Date.now()}`,startsAt:'2026-12-01T12:00:00Z'});
 await prepare(page,context,'meetings',meeting.id,'Iniciar reunião');
 const concurrent=await browser.newContext({baseURL:page.url().split('/registros/')[0]});const other=await concurrent.newPage();await login(other,'GERENTE_UBS');await post(other,`meetings/${meeting.id}/agenda`,{position:1,title:'Pauta adicionada após preparação offline'});await concurrent.close();
 await context.setOffline(false);await page.goto('/offline');await unlockWorkbench(page);await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();
 await expect(page.getByText('Conflito — entidade bloqueada nesta fila',{exact:true})).toBeVisible({timeout:45000});
 await expect(page.locator('pre').nth(1)).toContainText('Pauta adicionada');
 await page.getByLabel('Decisão sobre a transição').selectOption(decision);await page.getByLabel('Motivo da decisão').fill(decision==='KEEP_SERVER'?'Preservar agendamento e revisar a pauta sintética antes de iniciar.':'Pauta sintética revisada: confirmar explicitamente o início da reunião.');
 const request=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/v1/offline/transitions');await page.getByRole('button',{name:'Confirmar decisão sobre a transição',exact:true}).click();await expect(page.getByRole('status')).toContainText('Conflito resolvido e auditado');
 const envelope=(await request).postDataJSON();const repeat=await page.request.post('/api/v1/offline/transitions',{headers:{'x-device-id':envelope.deviceId},data:envelope});expect((await repeat.json()).duplicate).toBe(true);
 const current=await (await page.request.get(`/api/v1/meetings/${meeting.id}`)).json();expect(current.record.status).toBe(decision==='KEEP_SERVER'?'SCHEDULED':'IN_PROGRESS');
 const readerContext=await browser.newContext({baseURL:page.url().split('/offline')[0]});const reader=await readerContext.newPage();await login(reader,'LEITOR');
 const deviceId=crypto.randomUUID();const registered=await reader.request.post('/api/v1/devices/register',{data:{deviceId,organizationId:org,label:'Homologação de acesso offline',platform:'Playwright sintético'}});expect(registered.ok()).toBeTruthy();
 const denied=await reader.request.post('/api/v1/offline/transitions',{headers:{'x-device-id':deviceId},data:{...envelope,deviceId,operationId:crypto.randomUUID()}});expect(denied.status()).toBe(403);
 writeFileSync(`test-results/staging/critical-resolution-${decision}.json`,JSON.stringify({operationId:envelope.operationId,sourceOperationId:envelope.sourceOperationId,entityId:meeting.id}));await readerContext.close();
});
