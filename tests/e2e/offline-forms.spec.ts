import {test,expect} from '@playwright/test';
// Simulated gateway validates UI contracts, not hosted persistence.
test('offline agenda preserves typed payload and requires a durable receipt at 320px',async({page,context})=>{
 await page.setViewportSize({width:320,height:760});const sent:Array<Record<string,unknown>>=[];
 await page.route('**/api/v1/offline/forms',async route=>{const body=route.request().postDataJSON();sent.push(body);await route.fulfill({json:{status:'confirmed',operationId:body.operationId,result:{id:body.operationId}}});});
 await page.goto('/reunioes');await page.getByRole('link',{name:/^Abrir /}).first().click();
 await expect(page.getByRole('heading',{name:'Informações do registro',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sincronização',exact:true}).click();await page.getByLabel('PIN local de 6 a 12 dígitos').fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await expect(page.getByRole('dialog').getByRole('status')).toContainText('Dispositivo protegido');await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.getByRole('button',{name:'Disponibilizar neste dispositivo',exact:true}).click();await expect(page.getByText('Registro cifrado e disponível',{exact:false})).toBeVisible();
 const form=page.locator('section').filter({has:page.getByRole('heading',{name:'Adicionar item de pauta',exact:true})});await form.getByLabel('Assunto',{exact:false}).fill('Pauta preparada sem conexão');await form.getByLabel('Ordem na pauta',{exact:false}).fill('2');
 await context.setOffline(true);await form.getByRole('button',{name:'Adicionar item de pauta',exact:true}).click();await expect(form.locator('form').getByRole('status')).toContainText('Aguardando envio');expect(sent).toHaveLength(0);
 await context.setOffline(false);await page.goto('/offline');await page.getByLabel('PIN local',{exact:true}).fill('135790');await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();await expect(page.getByText('Confirmado pelo servidor',{exact:true})).toBeVisible();
 expect(sent).toHaveLength(1);expect(sent[0]).toMatchObject({resource:'meetings',command:'agenda',expectedVersion:1,payload:{position:2,title:'Pauta preparada sem conexão'},expectedRelated:{agenda:[],participants:[],referrals:[]}});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
