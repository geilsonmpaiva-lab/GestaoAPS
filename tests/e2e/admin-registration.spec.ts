import { expect, test } from "@playwright/test";

test("administration exposes registrations and simulates a unit without claiming persistence",async({page},info)=>{
  await page.goto("/administracao");
  await page.getByRole("link",{name:/Unidades Consulte/}).click();
  await expect(page.getByRole("heading",{name:"Unidades",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Cadastrar unidade",exact:true}).click();
  await page.getByLabel("Nome da unidade",{exact:true}).fill("UBS de teste de interface");
  await page.getByLabel("CNES (7 dígitos)",{exact:true}).fill("1234567");
  await page.screenshot({path:info.outputPath("unit-registration.png"),fullPage:true});
  await page.getByRole("button",{name:"Salvar unidade"}).click();
  await expect(page.getByText("Simulação concluída.",{exact:false})).toBeVisible();
  await expect(page.getByText("Nenhum dado foi gravado",{exact:false})).toBeVisible();
});

test("invitation requires explicit permissions and never asks for a password",async({page},info)=>{
  await page.goto("/administracao/usuarios/novo");
  await page.getByLabel("Nome completo",{exact:true}).fill("Pessoa Teste");
  await page.getByLabel("E-mail do convite",{exact:true}).fill("pessoa@example.invalid");
  await expect(page.getByRole("button",{name:"Enviar convite"})).toBeDisabled();
  await page.getByRole("checkbox",{name:"Protocolos",exact:true}).check();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Enviar convite"})).toBeEnabled();
  await page.setViewportSize({width:320,height:740});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("user-invitation.png"),fullPage:true});
  await page.getByRole("button",{name:"Enviar convite"}).click();
  await expect(page.getByText("Nenhum dado foi gravado",{exact:false})).toBeVisible();
});

test("failed unit submission preserves fields and reuses the operation on retry",async({page})=>{
  const ids:string[]=[];
  await page.route("**/api/v1/admin/units",async route=>{ids.push(route.request().postDataJSON().operationId);await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Falha temporária de teste"})});});
  await page.goto("/administracao/unidades/novo");
  await page.getByLabel("Nome da unidade",{exact:true}).fill("UBS Teste");
  await page.getByLabel("CNES (7 dígitos)",{exact:true}).fill("1234567");
  await page.getByRole("button",{name:"Salvar unidade"}).click();
  await expect(page.getByText("Falha temporária de teste")).toBeVisible();
  await expect(page.getByLabel("Nome da unidade",{exact:true})).toHaveValue("UBS Teste");
  await page.getByRole("button",{name:"Salvar unidade"}).click();
  await expect.poll(()=>ids.length).toBe(2);expect(ids[0]).toBe(ids[1]);
});

test("registration list filters survive opening and returning from the form",async({page})=>{
  await page.goto("/administracao/usuarios?search=Ana&status=ACTIVE");
  await page.getByRole("link",{name:"Convidar usuário",exact:true}).click();
  await page.getByRole("link",{name:"Voltar à lista",exact:false}).click();
  await expect(page).toHaveURL(/search=Ana&status=ACTIVE/);
  await expect(page.getByLabel("Pesquisar",{exact:true})).toHaveValue("Ana");
});
