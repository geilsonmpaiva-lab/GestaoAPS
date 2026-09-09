import{expect,test}from"@playwright/test";
test("keyboard navigation and dialog focus remain accessible",async({page})=>{
  await page.goto("/protocolos");
  const skip=page.getByRole("link",{name:"Pular para o conteúdo principal"});await expect(skip).toBeAttached();await skip.focus();await expect(skip).toBeFocused();await page.keyboard.press("Enter");await expect(page.locator("#conteudo-principal")).toBeFocused();
  const create=page.getByRole("button",{name:"Criar protocolo"});await create.focus();await page.keyboard.press("Enter");
  const dialog=page.getByRole("dialog",{name:"Criar protocolo"});await expect(dialog).toBeVisible();await expect(page.getByLabel("Código")).toBeFocused();
  await page.keyboard.press("Escape");await expect(dialog).toBeHidden();await expect(create).toBeFocused();
});
