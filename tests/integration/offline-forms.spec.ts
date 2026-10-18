import {test,expect,chromium,type Page,type BrowserContext,type Locator} from '@playwright/test';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyStagingSso,artifactRoot} from './staging-browser';
const file=process.env.SGC_STAGING_ACCOUNTS_FILE;
if(!file)throw new Error('Contas sintéticas obrigatórias.');
const accounts:Array<{email:string;password:string;role:string}>=JSON.parse(readFileSync(file,'utf8')).accounts;
const org='362db1a9-bfdd-4334-9436-46b1c0117eab',unit='32747837-0478-49b4-be4d-f96d5e120c1d';
const section=(page:Page,title:string)=>page.locator('section').filter({has:page.getByRole('heading',{name:title,exact:true})});
async function login(page:Page,role:string){
 await applyStagingSso(page.context());
 const account=accounts.find(a=>a.role===role)!;await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(account.email);await page.getByLabel('Senha',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page.getByRole('heading',{name:'Prioridades da unidade'})).toBeVisible();
 if(role==='ADMIN_SISTEMA'){const scope=page.getByRole('combobox',{name:'Unidade de trabalho'});const changed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/workspace/scope'&&r.request().method()==='POST');await scope.selectOption(`${org}:${unit}`);expect((await changed).status()).toBe(200);}
}
async function post(page:Page,path:string,data:Record<string,unknown>){
 const response=await page.request.post(`/api/v1/${path}`,{data:{operationId:crypto.randomUUID(),...data}}).catch(()=>{throw new Error('Requisição sintética interrompida; credenciais omitidas.');});expect(response.ok(),`${path}: ${await response.text()}`).toBeTruthy();return response.json();
}
async function offlineCommand(page:Page,context:BrowserContext,resource:string,id:string,title:string,fields:Record<string,string>={},edit?:(form:Locator)=>Promise<void>){
 await page.goto(`/registros/${resource}/${id}`);await expect(page.getByRole('heading',{name:'Informações do registro',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByLabel('PIN local de 6 a 12 dígitos').fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Dispositivo protegido');await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.getByRole('button',{name:'Disponibilizar neste dispositivo',exact:true}).click();await expect(page.getByText('Registro cifrado e disponível',{exact:false})).toBeVisible();
 const form=section(page,title);for(const [label,value] of Object.entries(fields)){const field=form.getByLabel(label,{exact:false});if(await field.evaluate(el=>el.tagName==='SELECT'))await field.selectOption(value);else await field.fill(value);}if(edit)await edit(form);
 await context.setOffline(true);await form.getByRole('button',{name:title,exact:true}).click();await expect(form.locator('form').getByRole('status')).toContainText('Aguardando envio');
 await context.setOffline(false);await page.goto('/offline');await page.getByLabel('PIN local',{exact:true}).fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/offline/forms'&&r.request().method()==='POST');await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();
 const confirmed=await response;const result=await confirmed.json();expect(confirmed.status(),JSON.stringify(result)).toBe(200);expect(result.status).toBe('confirmed');
 await expect(page.getByRole('status')).toContainText('Sincronização verificada');await expect(page.getByText('Conflito — entidade bloqueada nesta fila',{exact:true})).toHaveCount(0);
 const envelope=confirmed.request().postDataJSON();const repeated=await page.request.post('/api/v1/offline/forms',{headers:{'x-device-id':envelope.deviceId},data:envelope}).catch(()=>{throw new Error('Reenvio sintético interrompido; credenciais omitidas.');});expect(repeated.status()).toBe(200);expect((await repeated.json()).duplicate).toBe(true);
 console.log(`Formulário offline confirmado: ${resource}/${envelope.command}`);return {result:result.result,envelope};
}

test('14 formulários MVP gravam offline pela interface e reenvio não duplica',async({page,context,browser})=>{
 test.setTimeout(1200000);const suffix=Date.now();const operations:Array<Record<string,unknown>>=[];
 const run=async(resource:string,id:string,title:string,fields:Record<string,string>={},edit?:(form:Locator)=>Promise<void>)=>{const result=await offlineCommand(page,context,resource,id,title,fields,edit);operations.push(result.envelope);return result.result;};
 await login(page,'ADMIN_SISTEMA');
 const k=await post(page,'knowledge',{organizationId:org,unitId:unit,title:`[HOMOLOGAÇÃO] Formulários offline ${suffix}`,type:'MANUAL',domain:'gestao'});
 const kv=await run('knowledge',k.id,'Criar nova versão',{'Conteúdo institucional':'Conteúdo administrativo sintético sem orientação clínica.','Início da vigência':'2026-01-01'});
 // Original online state commands are already independently qualified offline.
 for(const targetStatus of ['IN_REVIEW','APPROVED','PUBLISHED'])await post(page,`knowledge-versions/${kv.id}/transition`,{expectedVersion:1,targetStatus});
 const indicator=await post(page,'indicators',{organizationId:org,unitId:unit,code:`OF-${suffix}`,name:`[HOMOLOGAÇÃO] Indicador offline ${suffix}`,definition:'Índice administrativo sintético',unit:'percentual',periodicity:'mensal',source:'Teste sintético',domain:'gestao',betterDirection:'HIGHER'});
 const formula=await run('indicators',indicator.id,'Salvar nova versão da fórmula',{'Vigente a partir de':'2026-01-01'});
 await run('indicators',indicator.id,'Cadastrar meta institucional',{'Início da vigência':'2026-01-01','Fim da vigência':'2027-12-31','Comparação':'GTE','Valor da meta':'90'});
 const p=await post(page,'protocols',{organizationId:org,unitId:unit,code:`OF-${suffix}`,title:`[HOMOLOGAÇÃO] Protocolo offline ${suffix}`,domain:'gestao'});
 const pv=await run('protocols',p.id,'Criar nova versão',{'Conteúdo institucional':'Executar somente o checklist administrativo sintético.','Início da vigência':'2026-01-01','Conhecimento publicado de referência':kv.id});
 await run('protocol-versions',pv.id,'Salvar checklist desta versão',{'Nome do checklist':'Checklist sintético offline'},async form=>{await form.getByLabel('Pergunta',{exact:true}).fill('Valor sintético');await form.getByLabel('Identificador da resposta',{exact:true}).fill('valor');await form.getByRole('combobox',{name:'Formato',exact:true}).selectOption('number');});
 await run('protocol-versions',pv.id,'Vincular fórmula de indicador',{'Indicador e versão da fórmula':formula.id});
 for(const cmd of ['submit-review','approve','publish'])await post(page,`${cmd==='submit-review'?'protocol-versions':'protocols'}/${pv.id}/${cmd}`,{expectedVersion:1});
 const execution=await run('protocol-versions',pv.id,'Iniciar execução nesta UBS');
 await run('executions',execution.id,'Salvar respostas do checklist',{'Valor sintético':'70'});
 const detail=await (await page.request.get(`/api/v1/executions/${execution.id}`)).json();await post(page,`executions/${execution.id}/complete`,{expectedVersion:detail.record.version,indicatorInputs:{valor:70},result:{valor:70}});
 const final=await (await page.request.get(`/api/v1/executions/${execution.id}`)).json();const measurement=final.related.measurements[0];expect(measurement.status).toBe('FORA_META');
 await run('measurements',measurement.id,'Registrar análise crítica',{'Análise do resultado':'Resultado sintético abaixo da meta.','Decisão de acompanhamento':'Acompanhar plano sintético.'});
 const plan=await run('measurements',measurement.id,'Abrir desvio e plano de ação',{'Título do plano':`[HOMOLOGAÇÃO] Plano offline ${suffix}`,'Descrição do desvio':'Desvio sintético para testar os formulários offline.','Prazo':'2026-12-20T12:00','Classificação':'MINOR'});
 await run('action-plans',plan.actionPlanId??plan.id,'Adicionar ação 5W2H',{'O que será feito':'Ação administrativa sintética','Por quê':'Verificar operação offline','Onde':'UBS Sintética A','Quando':'2026-12-20T12:00','Como':'Teste controlado sem dados clínicos','Quanto custa':'0'});
 const meeting=await post(page,'meetings',{organizationId:org,unitId:unit,title:`[HOMOLOGAÇÃO] Reunião formulários ${suffix}`,startsAt:'2026-12-01T12:00:00Z'});
 await run('meetings',meeting.id,'Adicionar item de pauta',{'Assunto':'Pauta sintética offline'});
 await page.goto(`/registros/meetings/${meeting.id}`);const attendanceTitle=await page.getByRole('heading',{name:/^Registrar presença de/}).first().innerText();
 await run('meetings',meeting.id,attendanceTitle,{},async form=>{await form.getByRole('combobox').selectOption('true');});
 await run('meetings',meeting.id,'Criar encaminhamento',{'Encaminhamento decidido':'Encaminhamento administrativo sintético.','Prazo':'2026-12-20T12:00'});
 const actual=await (await page.request.get(`/api/v1/meetings/${meeting.id}`)).json();expect(actual.related.agenda).toHaveLength(1);expect(actual.related.participants).toHaveLength(1);expect(actual.related.referrals).toHaveLength(1);
 const readerContext=await browser.newContext({baseURL:page.url().split('/offline')[0]});const reader=await readerContext.newPage();await login(reader,'LEITOR');const deviceId=crypto.randomUUID();await post(reader,'devices/register',{deviceId,organizationId:org,label:'Teste sintético de formulários',platform:'Playwright'});
 const denied=await reader.request.post('/api/v1/offline/forms',{headers:{'x-device-id':deviceId},data:{...operations[operations.length-1],operationId:crypto.randomUUID(),deviceId}});expect(denied.status()).toBe(403);await readerContext.close();
 writeFileSync(`${artifactRoot}/form-operations.json`,JSON.stringify(operations.map(({operationId,entityId,resource,command})=>({operationId,entityId,resource,command}))));
});

test('formulário sobrevive reinício sem rede, resposta perdida e conflito de pauta',async({},info)=>{
 test.setTimeout(420000);const profile=mkdtempSync(join(tmpdir(),'sgc-form-offline-'));
 let context=await chromium.launchPersistentContext(profile,{baseURL:info.project.use.baseURL,serviceWorkers:'allow'});let page=await context.newPage();
 await login(page,'GERENTE_UBS');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 const meeting=await post(page,'meetings',{organizationId:org,unitId:unit,title:`[HOMOLOGAÇÃO] Retomada de formulário ${Date.now()}`,startsAt:'2026-12-01T12:00:00Z'});
 async function prepareAgenda(position:string,title:string){
  await page.goto(`/registros/meetings/${meeting.id}`);await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByLabel('PIN local de 6 a 12 dígitos').fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Dispositivo protegido');await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'Disponibilizar neste dispositivo',exact:true}).click();await expect(page.getByText('Registro cifrado e disponível',{exact:false})).toBeVisible();
  const form=section(page,'Adicionar item de pauta');await form.getByLabel('Ordem na pauta',{exact:false}).fill(position);await form.getByLabel('Assunto',{exact:false}).fill(title);await context.setOffline(true);await form.getByRole('button',{name:'Adicionar item de pauta',exact:true}).click();await expect(form.locator('form').getByRole('status')).toContainText('Aguardando envio');
 }
 async function unlock(){await page.goto('/offline');await page.getByLabel('PIN local',{exact:true}).fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('button',{name:'Sincronizar pendências',exact:true})).toBeVisible();}
 await prepareAgenda('1','Pauta sintética antes do reinício');await context.close();
 context=await chromium.launchPersistentContext(profile,{baseURL:info.project.use.baseURL,serviceWorkers:'allow'});await applyStagingSso(context);page=await context.newPage();await context.setOffline(true);await unlock();await expect(page.getByText('Aguardando envio',{exact:true})).toBeVisible();await expect(page.getByText('Confirmado pelo servidor',{exact:true})).toHaveCount(0);
 await context.setOffline(false);await page.route('**/api/v1/offline/forms',async route=>{const result=await route.fetch();expect(result.status()).toBe(200);await route.abort();},{times:1});await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();await expect(page.getByRole('status')).toContainText('Itens preservados');
 await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();await expect(page.getByText('Confirmado pelo servidor',{exact:true})).toBeVisible();
 const first=await (await page.request.get(`/api/v1/meetings/${meeting.id}`)).json();expect(first.related.agenda).toHaveLength(1);
 await prepareAgenda('2','Pauta offline a reavaliar');await context.setOffline(false);
 await post(page,`meetings/${meeting.id}/agenda`,{position:3,title:'Pauta concorrente inserida online'});
 await unlock();await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();await expect(page.getByText('Conflito — entidade bloqueada nesta fila',{exact:true})).toBeVisible();
 await page.getByLabel('Decisão sobre a transição').selectOption('RETRY');await page.getByLabel('Motivo da decisão').fill('Pauta concorrente revisada; confirmar a inclusão sem duplicação.');
 const resolving=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/offline/forms');await page.getByRole('button',{name:'Confirmar decisão sobre a transição',exact:true}).click();const resolved=await resolving;expect(resolved.status()).toBe(200);await expect(page.getByRole('status')).toContainText('Conflito resolvido e auditado');
 const envelope=resolved.request().postDataJSON();const replay=await page.request.post('/api/v1/offline/forms',{headers:{'x-device-id':envelope.deviceId},data:envelope});expect((await replay.json()).duplicate).toBe(true);
 const final=await (await page.request.get(`/api/v1/meetings/${meeting.id}`)).json();expect(final.record.status).toBe('SCHEDULED');expect(final.related.agenda).toHaveLength(3);expect(final.related.agenda.filter((a:{position:number})=>a.position===2)).toHaveLength(1);
 writeFileSync(`${artifactRoot}/form-resolution.json`,JSON.stringify({operationId:envelope.operationId,sourceOperationId:envelope.sourceOperationId,entityId:meeting.id}));await page.screenshot({path:info.outputPath('formulario-conflito-resolvido.png'),fullPage:true});await context.close();
});
