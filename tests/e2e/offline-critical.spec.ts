import {test,expect} from '@playwright/test';

// Frontend contract test with a simulated gateway. SQL/RLS tests independently
// qualify persistence; this test must never be cited as hosted DB evidence.
test('critical preparation is explicit, snapshot-bound and preserves conflict until reviewed',async({page,context})=>{
 const sent:Array<Record<string,unknown>>=[];
 await page.route('**/api/v1/offline/transitions',async route=>{
  const body=route.request().postDataJSON();sent.push(body);
  if(body.decision==='KEEP_SERVER')await route.fulfill({json:{status:'resolved',operationId:body.operationId,result:{id:body.entityId}}});
  else await route.fulfill({status:409,json:{status:'conflict',operationId:body.operationId,server:{record:{...body.expectedRecord,status:'IN_PROGRESS'},related:body.expectedRelated}}});
 });
 await page.goto('/reunioes');await page.getByRole('link',{name:/^Abrir /}).first().click();
 await expect(page).toHaveURL(/\/registros\/meetings\//);
 await expect(page.getByRole('button',{name:'Iniciar reunião',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sincronização',exact:true}).click();
 await page.getByLabel('PIN local de 6 a 12 dígitos').fill('135790');
 await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('status')).toContainText('Dispositivo protegido');
 await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await page.getByRole('button',{name:'Disponibilizar neste dispositivo',exact:true}).click();
 await expect(page.getByText('Registro cifrado e disponível', {exact:false})).toBeVisible();
 await context.setOffline(true);
 await page.getByRole('button',{name:'Iniciar reunião',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Confirme a preparação'})).toBeVisible();
 await page.getByRole('checkbox',{name:/Confirmo a preparação offline/}).check();
 await page.getByRole('button',{name:'Iniciar reunião',exact:true}).click();
 await expect(page.getByText('Aguardando envio. Operação cifrada', {exact:false})).toBeVisible();
 expect(sent).toHaveLength(0);
 await context.setOffline(false);await page.goto('/offline');
 await page.getByLabel('PIN local',{exact:true}).fill('135790');
 await page.getByRole('button',{name:'Desbloquear cofre',exact:true}).click();
 await page.getByRole('button',{name:'Sincronizar pendências',exact:true}).click();
 await expect(page.getByText('Conflito — entidade bloqueada nesta fila',{exact:true})).toBeVisible();
 expect(sent).toHaveLength(1);expect(sent[0].expectedRecord).toMatchObject({status:'SCHEDULED'});
 await page.getByLabel('Decisão sobre a transição').selectOption('KEEP_SERVER');
 await page.getByLabel('Motivo da decisão').fill('Preservar o estado atual na verificação de interface.');
 await page.getByRole('button',{name:'Confirmar decisão sobre a transição',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Conflito resolvido e auditado');
 expect(sent[1].sourceOperationId).toBe(sent[0].operationId);
 expect(sent[1].decision).toBe('KEEP_SERVER');
});
