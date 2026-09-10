import{expect,test}from"@playwright/test";
test("keyboard navigation and dialog focus remain accessible",async({page})=>{
  await page.goto("/protocolos");
  const skip=page.getByRole("link",{name:"Pular para o conteúdo principal"});await expect(skip).toBeAttached();await skip.focus();await expect(skip).toBeFocused();await page.keyboard.press("Enter");await expect(page.locator("#conteudo-principal")).toBeFocused();
  const account=page.getByRole("button",{name:"Abrir conta de Ana Lima"});await account.focus();await page.keyboard.press("Enter");
  const dialog=page.getByRole("dialog",{name:"Minha conta"});await expect(dialog).toBeVisible();await expect(dialog.getByRole("button",{name:"Sair deste dispositivo"})).toBeFocused();
  await page.keyboard.press("Escape");await expect(dialog).toBeHidden();await expect(account).toBeFocused();
  const create=page.getByRole("link",{name:"Criar protocolo"});await create.focus();await page.keyboard.press("Enter");await expect(page.getByRole("heading",{name:"Criar protocolo"})).toBeVisible();await page.getByLabel("Código").focus();await expect(page.getByLabel("Código")).toBeFocused();
});
