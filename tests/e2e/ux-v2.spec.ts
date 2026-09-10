import { expect, test } from "@playwright/test";

test("dashboard distinguishes the demonstration and links priorities to their records", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Prioridades da unidade" })).toBeVisible();
  await expect(page.getByText("Demonstração: painel sem registros operacionais carregados.")).toBeVisible();
  await expect(page.getByText("23/25", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Medições fora da meta/ })).toHaveAttribute("href", "/indicadores?view=outside");
  await page.screenshot({ path: testInfo.outputPath("ux-v2-dashboard.png") });
});

test("mobile navigation exposes every enabled MVP area without leaving the unit context", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.locator(".v2-workspace")).toContainText("UBS Jardim Aurora");
  const mobile = page.getByRole("navigation", { name: "Navegação móvel" });
  await expect(mobile.getByRole("link", { name: "Melhoria", exact: true })).toBeVisible();
  await expect(mobile.getByRole("link", { name: "Reuniões", exact: true })).toBeVisible();
  await mobile.getByRole("button", { name: "Mais áreas e navegação" }).click();
  const drawer = page.getByRole("dialog", { name: "Áreas de trabalho" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Conhecimento", exact: true })).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Qualidade", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("ux-v2-mobile-navigation.png") });
  await drawer.getByRole("link", { name: "Conhecimento", exact: true }).click();
  await expect(page).toHaveURL(/\/conhecimento$/);
  await expect(drawer).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("filters submit their selected values and can be cleared", async ({ page }) => {
  await page.goto("/conhecimento");
  await page.getByRole("combobox", { name: "Situação" }).selectOption("DRAFT");
  await page.getByRole("textbox", { name: "Pesquisar" }).fill("conteúdo");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/status=DRAFT/);
  await expect(page.getByRole("textbox", { name: "Pesquisar" })).toHaveValue("conteúdo");
  await expect(page.locator(".filter-button")).toHaveCount(0);
  await page.getByRole("link", { name: "Limpar filtros" }).click();
  await expect(page.getByRole("textbox", { name: "Pesquisar" })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Situação" })).toHaveValue("");
});

test("creation uses a page, translated options and usable mobile controls", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/conhecimento");
  await page.getByRole("link", { name: "Novo conteúdo", exact: true }).click();
  await expect(page).toHaveURL(/\/cadastros\/knowledge/);
  await expect(page.getByRole("heading", { name: "Novo conteúdo" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const type = page.getByRole("combobox", { name: "Tipo de conteúdo" });
  await expect(type.locator('option[value="GOOD_PRACTICE"]')).toHaveText("Boa prática");
  await expect(page.getByRole("combobox", { name: "Visibilidade" }).locator('option[value="INTERNAL"]')).not.toHaveText("INTERNAL");
  await page.getByRole("button", { name: "Salvar e continuar" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Salvar e continuar" })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: testInfo.outputPath("ux-v2-mobile-create.png") });
});

test("opening the account does not sign out and restores keyboard focus", async ({ page }) => {
  let signOutRequests = 0;
  page.on("request", request => { if (request.url().includes("/auth/v1/logout")) signOutRequests++; });
  await page.goto("/");
  const account = page.getByRole("button", { name: "Abrir conta de Ana Lima" });
  await account.click();
  const dialog = page.getByRole("dialog", { name: "Minha conta" });
  await expect(dialog.getByRole("button", { name: "Sair deste dispositivo" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Encerrar todas as sessões" })).toBeVisible();
  expect(signOutRequests).toBe(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(account).toBeFocused();
});

test("encrypted draft survives reload and disconnected submission preserves the form", async ({ page, context }) => {
  const marker = "RASCUNHO-SINTETICO-UX-PRIVADO";
  await page.goto("/cadastros/knowledge");
  await page.getByRole("textbox", { name: "Título", exact: false }).fill(marker);
  await page.getByRole("textbox", { name: "Domínio institucional", exact: false }).fill("HOMOLOGACAO");
  await page.getByLabel("PIN do cofre (se estiver bloqueado)").fill("135790");
  await page.getByRole("button", { name: "Salvar no dispositivo", exact: true }).click();
  await expect(page.locator(".v2-draft").getByRole("status")).toContainText("Salvo neste dispositivo");
  const stored = await page.evaluate(() => new Promise<Array<{ id: string; iv: string; value: string }>>((resolve, reject) => {
    const request = indexedDB.open("sgc-ubs-offline");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("records", "readonly");
      const records = transaction.objectStore("records").getAll();
      records.onsuccess = () => { db.close(); resolve(records.result); };
      records.onerror = () => { db.close(); reject(records.error); };
    };
  }));
  expect(stored.some(record => record.id.startsWith("draft:"))).toBe(true);
  expect(stored.every(record => Boolean(record.iv && record.value))).toBe(true);
  expect(JSON.stringify(stored)).not.toContain(marker);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Título", exact: false })).toHaveValue("");
  await page.getByLabel("PIN do cofre (se estiver bloqueado)").fill("135790");
  await page.getByRole("button", { name: "Recuperar rascunho", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Título", exact: false })).toHaveValue(marker);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.locator(".v2-form").getByRole("alert")).toContainText("Sem conexão");
  await expect(page.getByRole("textbox", { name: "Título", exact: false })).toHaveValue(marker);
  await context.setOffline(false);
});

test("a long checklist stays within the mobile viewport and remains scrollable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/registros/protocol-versions/00000000-0000-4000-8000-000000000301");
  await expect(page.getByRole("heading", { name: "Salvar checklist desta versão" })).toBeVisible();
  await page.getByRole("button", { name: "Adicionar campo", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar campo", exact: true }).click();
  await expect(page.getByRole("group", { name: "Campo 3", exact: true })).toBeVisible();
  const save = page.getByRole("button", { name: "Salvar checklist desta versão", exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: testInfo.outputPath("ux-v2-mobile-checklist.png") });
});

test("login shows password only when requested and remains compact on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/login");
  const password = page.getByRole("textbox", { name: "Senha", exact: true });
  await page.getByRole("button", { name: "Mostrar senhas" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar senhas" }).click();
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ux-v2-mobile-login.png") });
});
