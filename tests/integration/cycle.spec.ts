import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import {applyStagingSso,artifactRoot} from './staging-browser';

const file = process.env.SGC_STAGING_ACCOUNTS_FILE;
if (!file) throw new Error("Arquivo privado de contas sintéticas obrigatório.");
const accounts: { email: string; password: string; role: string }[] = JSON.parse(readFileSync(file, "utf8")).accounts;
const section = (page: Page, title: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
async function login(page: Page, role: string) {
  await applyStagingSso(page.context());
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(30_000);
  const account = accounts.find(item => item.role === role)!;
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^(Prioridades da unidade|Olá,)/ })).toBeVisible();
}
async function command(page: Page, title: string, form?: Locator) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname.startsWith("/api/v1/") && ["POST", "PUT"].includes(r.request().method()));
  await (form ?? section(page, title)).getByRole("button", { name: title, exact: true }).click();
  const result = await response;
  expect(result.ok(), `${title}: ${await result.text()}`).toBeTruthy();
  console.log(`Confirmado: ${title}`);
  return result.json();
}
async function create(page: Page, resource: string, values: Record<string, string>) {
  await page.goto(`/cadastros/${resource}`);
  for (const [label, value] of Object.entries(values)) await page.getByLabel(label, { exact: false }).fill(value);
  const result = await command(page, "Salvar e continuar", page.locator("form").first());
  await expect(page).toHaveURL(new RegExp(`/registros/${resource}/${result.id}`));
  return result.id as string;
}
async function detail(page: Page, resource: string, id: string) {
  await page.goto(`/registros/${resource}/${id}`);
  await expect(page.getByRole("heading", { name: "Informações do registro", exact: true })).toBeVisible();
}
async function selectUnit(page: Page, label: "A" | "B") {
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/v1/workspace/scope"&&r.request().method()==="POST");
  const scope = page.getByRole("combobox",{name:"Unidade de trabalho"});
  const value = await scope.locator('option').filter({hasText:`UBS Sintética ${label}`}).getAttribute('value');
  expect(value).toBeTruthy(); await scope.selectOption(value!);
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("combobox",{name:"Unidade de trabalho"})).toHaveValue(label === "A" ? /:32747837-0478-49b4-be4d-f96d5e120c1d$/ : /:04fa0c38-8f17-4747-87fa-0397e81612a4$/);
  await expect(page.getByRole("heading",{name:/^(Prioridades da unidade|Olá,)/})).toBeVisible();
}

test("ciclo completo pela interface, com gerente A e leitor B segregados", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const suffix = Date.now().toString();
  await login(page, "ADMIN_SISTEMA");
  await selectUnit(page,"A");
  // Every business entity below is newly created; existing fixtures are read-only.
  const knowledge = await create(page, "knowledge", { "Título": `[HOMOLOGAÇÃO] Ciclo ${suffix}`, "Domínio institucional": "gestao" });
  let form = section(page, "Criar nova versão");
  await form.getByLabel("Conteúdo institucional", { exact: false }).fill("Conteúdo administrativo sintético para homologação, sem orientação clínica.");
  await form.getByLabel("Início da vigência", { exact: false }).fill("2026-01-01");
  const kv = await command(page, "Criar nova versão");
  await expect(page).toHaveURL(new RegExp(`/knowledge-versions/${kv.id}`));
  for (const title of ["Enviar para revisão", "Aprovar conteúdo", "Publicar conteúdo"]) {
    await command(page, title);
    await page.reload();
  }
  await expect(section(page, "Informações do registro")).toContainText("Publicado");

  const indicator = await create(page, "indicators", { "Código": `HML-${suffix}`, "Nome": `[HOMOLOGAÇÃO] Indicador ${suffix}`, "Definição institucional": "Índice sintético de verificação administrativa.", "Unidade de medida": "percentual", "Periodicidade": "mensal", "Fonte dos dados": "checklist sintético", "Domínio institucional": "gestao" });
  form = section(page, "Salvar nova versão da fórmula");
  await form.getByLabel("Vigente a partir de", { exact: false }).fill("2026-01-01");
  await command(page, "Salvar nova versão da fórmula");
  await page.reload();
  form = section(page, "Cadastrar meta institucional");
  await form.getByLabel("Início da vigência", { exact: false }).fill("2026-01-01");
  await form.getByLabel("Fim da vigência", { exact: false }).fill("2027-12-31");
  await form.getByLabel("Comparação", { exact: false }).selectOption("GTE");
  await form.getByLabel("Valor da meta", { exact: false }).fill("90");
  await command(page, "Cadastrar meta institucional");

  const protocol = await create(page, "protocols", { "Código": `HML-${suffix}`, "Título": `[HOMOLOGAÇÃO] Protocolo ${suffix}`, "Domínio institucional": "gestao" });
  form = section(page, "Criar nova versão");
  await form.getByLabel("Conteúdo institucional", { exact: false }).fill("Aplicar checklist administrativo sintético e anexar o comprovante de teste.");
  await form.getByLabel("Início da vigência", { exact: false }).fill("2026-01-01");
  await form.getByLabel("Conhecimento publicado de referência", { exact: false }).selectOption(kv.id);
  await expect(form.locator(`option[value="${kv.id}"]`)).toContainText(`[HOMOLOGAÇÃO] Ciclo ${suffix} · versão 1`);
  const pv = await command(page, "Criar nova versão");
  await expect(page).toHaveURL(new RegExp(`/protocol-versions/${pv.id}`));
  form = section(page, "Salvar checklist desta versão");
  await form.getByLabel("Nome do checklist", { exact: false }).fill("Checklist sintético");
  await form.getByLabel("Pergunta", { exact: true }).fill("Percentual administrativo verificado");
  await form.getByLabel("Identificador da resposta", { exact: true }).fill("valor");
  await form.getByRole("combobox", { name: "Formato", exact: true }).selectOption("number");
  await command(page, "Salvar checklist desta versão");
  await expect(section(page, 'Checklists').getByRole('list', { name: 'Campos do checklist' })).toBeVisible();
  await expect(section(page, 'Checklists')).toContainText('Formato: Número · Resposta obrigatória');
  await expect(section(page, 'Checklists')).not.toContainText('fields:');
  await expect(section(page, 'Checklists')).not.toContainText('key:');
  await page.setViewportSize({ width: 320, height: 760 });
  await section(page, 'Checklists').getByRole('list', { name: 'Campos do checklist' }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${artifactRoot}/checklist-legivel-320.png` });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  form = section(page, "Vincular fórmula de indicador");
  const formula = form.getByLabel("Indicador e versão da fórmula", { exact: false });
  await formula.selectOption({ label: `[HOMOLOGAÇÃO] Indicador ${suffix} · versão 1` });
  await command(page, "Vincular fórmula de indicador");
  for (const title of ["Enviar protocolo para revisão", "Aprovar protocolo", "Publicar protocolo"]) {
    await command(page, title);
    await page.reload();
  }

  // Independent browser sessions exercise actual membership-scoped permissions.
  const managerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: "block" });
  const manager = await managerContext.newPage();
  await login(manager, "GERENTE_UBS");
  await detail(manager, "protocol-versions", pv.id);
  const execution = await command(manager, "Iniciar execução nesta UBS");
  await expect(manager).toHaveURL(new RegExp(`/executions/${execution.id}`));
  await expect(manager.getByRole('heading',{level:1})).toContainText('Execução de protocolo');
  expect(new URL(manager.url()).searchParams.get('returnTo')).not.toContain('returnTo=');
  form = section(manager, "Salvar respostas do checklist");
  await form.getByLabel("Percentual administrativo verificado", { exact: false }).fill("70");
  await command(manager, "Salvar respostas do checklist");
  await manager.reload();
  const finalized=manager.waitForResponse(r=>/\/api\/v1\/evidence\/[^/]+\/finalize$/.test(new URL(r.url()).pathname)&&r.request().method()==="POST");
  await manager.getByLabel("Arquivo de evidência", { exact: true }).setInputFiles({ name: `homologacao-${suffix}.csv`, mimeType: "text/csv", buffer: Buffer.from("tipo,valor\nsintetico,70\n") });
  await manager.getByRole("button", { name: "Enviar evidência", exact: true }).click();
  await expect(manager.getByText("Evidência enviada e integridade confirmada.")).toBeVisible();
  await expect(manager.getByRole("button", { name: /Abrir arquivo verificado/ })).toBeVisible();
  const attachment=(await (await finalized).json()).id;
  form = section(manager, "Concluir execução e calcular indicador");
  await form.getByLabel("Dado para cálculo: valor", { exact: false }).fill("70");
  const completionRequest=manager.waitForRequest(r=>r.url().endsWith(`/api/v1/executions/${execution.id}/complete`)&&r.method()==="POST");
  const completion = await command(manager, "Concluir execução e calcular indicador");
  expect(completion.measurement).toMatchObject({ value: 70, status: "FORA_META" });
  const originalPayload=(await completionRequest).postDataJSON();
  const replay=await manager.request.post(`/api/v1/executions/${execution.id}/complete`,{data:originalPayload});
  expect(replay.ok()).toBeTruthy();
  expect((await replay.json()).measurement.id).toBe(completion.measurement.id);
  const measurement = completion.measurement.id;
  await manager.reload();
  await expect(section(manager, "Informações do registro")).toContainText("Concluído");
  await detail(manager, "measurements", measurement);
  form = section(manager, "Registrar análise crítica");
  await form.getByLabel("Análise do resultado", { exact: false }).fill("Resultado sintético abaixo da meta de 90.");
  await form.getByLabel("Causa identificada", { exact: false }).fill("Cenário de teste intencional.");
  await form.getByLabel("Decisão de acompanhamento", { exact: false }).fill("Abrir plano sintético e verificar eficácia.");
  await command(manager, "Registrar análise crítica");
  await manager.reload();
  form = section(manager, "Abrir desvio e plano de ação");
  await form.getByLabel("Título do plano", { exact: false }).fill(`[HOMOLOGAÇÃO] Plano ${suffix}`);
  await form.getByLabel("Descrição do desvio", { exact: false }).fill("Diferença sintética entre 70 observado e 90 esperado.");
  await form.getByLabel("Classificação", { exact: false }).selectOption("MINOR");
  const plan = await command(manager, "Abrir desvio e plano de ação");
  const planId = plan.actionPlanId ?? plan.id;
  await expect(manager).toHaveURL(new RegExp(`/action-plans/${planId}`));
  form = section(manager, "Adicionar ação 5W2H");
  for (const [label, value] of Object.entries({ "O que será feito": "Rever checklist sintético", "Por quê": "Corrigir desvio administrativo de teste", "Onde": "UBS Sintética A", "Quando": "2026-12-15T14:00", "Como": "Revisão administrativa para homologação", "Quanto custa": "0" })) await form.getByLabel(label, { exact: false }).fill(value);
  const action = await command(manager, "Adicionar ação 5W2H");
  await expect(manager).toHaveURL(new RegExp(`/actions/${action.id}`));
  await expect(section(manager,'Informações do registro')).toContainText('15/12/2026');
  await expect(section(manager,'Informações do registro')).toContainText('(Brasília)');
  await expect(manager.getByRole('heading',{name:'Comentários',exact:true})).toBeVisible();
  form = section(manager, "Atualizar acompanhamento");
  await form.getByLabel("Situação", { exact: false }).selectOption("EM_ANDAMENTO");
  await form.getByLabel("Percentual concluído", { exact: false }).fill("50");
  await command(manager, "Atualizar acompanhamento");
  await manager.reload();
  await command(manager, "Concluir ação");
  await detail(manager, "action-plans", planId);
  form = section(manager, "Registrar verificação de eficácia");
  await form.getByLabel("O plano foi eficaz?", { exact: false }).selectOption("true");
  await form.getByLabel("Justificativa da avaliação", { exact: false }).fill("Cenário de eficácia comprovado com evidência sintética, sem dado clínico.");
  await command(manager, "Registrar verificação de eficácia");
  await manager.reload();
  await expect(section(manager, "Verificações de eficácia")).toContainText("Cenário de eficácia comprovado");

  const meeting = await create(manager, "meetings", { "Título": `[HOMOLOGAÇÃO] Reunião ${suffix}`, "Data e horário de início": "2026-10-18T14:00", "Local ou sala virtual": "Sala sintética" });
  form = section(manager, "Adicionar item de pauta");
  await form.getByLabel("Assunto", { exact: false }).fill("Revisar ciclo sintético");
  await command(manager, "Adicionar item de pauta");
  await manager.reload();
  const attendance = manager.locator("section").filter({ has: manager.getByRole("heading", { name: /^Registrar presença de/ }) }).first();
  await attendance.getByRole("combobox").selectOption("true");
  const attendanceTitle = await attendance.getByRole("heading", { level: 2 }).innerText();
  await command(manager, attendanceTitle, attendance);
  await manager.reload();
  await command(manager, "Iniciar reunião");
  await manager.reload();
  form = section(manager, "Criar encaminhamento");
  await form.getByLabel("Encaminhamento decidido", { exact: false }).fill("Acompanhar resultado sintético no próximo ciclo.");
  await form.getByLabel("Prazo", { exact: false }).fill("2026-12-20T14:00");
  const referral = await command(manager, "Criar encaminhamento");
  await expect(manager).toHaveURL(new RegExp(`/referrals/${referral.id}`));
  await command(manager, "Converter encaminhamento em ação");
  await expect(manager).toHaveURL(/\/action-plans\//);
  await detail(manager, "meetings", meeting);
  await section(manager, "Registrar ata e encerrar reunião").getByLabel("Ata:", { exact: false }).fill("Reunião sintética concluída. Revisados indicador, desvio, plano e encaminhamento administrativo.");
  await command(manager, "Registrar ata e encerrar reunião");
  await manager.reload();
  await expect(section(manager, "Informações do registro")).toContainText("Concluído");

  const readerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: "block" });
  const reader = await readerContext.newPage();
  await login(reader, "LEITOR");
  await reader.goto(`/registros/protocols/${protocol}`);
  await expect(reader.getByText("Página não encontrada", { exact: true })).toBeVisible();
  const denied = await reader.request.get(`/api/v1/protocols/${protocol}`);
  expect([403, 404]).toContain(denied.status());
  const deniedWrite = await reader.request.post("/api/v1/knowledge", { data: { operationId: crypto.randomUUID(), organizationId: "362db1a9-bfdd-4334-9436-46b1c0117eab", unitId: "04fa0c38-8f17-4747-87fa-0397e81612a4", title: `[HOMOLOGAÇÃO] Escrita proibida ${suffix}`, domain: "gestao", type: "MANUAL" } });
  expect(deniedWrite.status()).toBe(403);
  const deniedEvidence=await reader.request.get(`/api/v1/evidence/${attachment}/download-url`);
  expect([403,404]).toContain(deniedEvidence.status());
  await reader.goto("/cadastros/knowledge");
  await expect(reader.getByText("Seu perfil permite consultar esta área, mas não criar registros.")).toBeVisible();
  await manager.goto("/");
  await expect(manager.getByRole("heading", { name: /^(Prioridades da unidade|Olá,)/ })).toBeVisible();
  const outsideCard=manager.getByRole("link",{name:/Medições fora da meta/});
  if (await outsideCard.count()) {
    const outsideCount=Number((await outsideCard.innerText()).match(/\d+/)?.[0]);
    await outsideCard.click();
    await expect(manager.getByText(`${outsideCount} registro(s) no recorte selecionado`,{exact:false})).toBeVisible();
  } else {
    await expect(manager.getByRole('link',{name:'Resultados',exact:true}).first()).toBeVisible();
    await manager.goto('/indicadores?view=outside');
    const total = await manager.request.get('/api/v1/measurements?status=FORA_META');
    expect(total.status()).toBe(200);
    const outside = await total.json();
    await expect(manager.getByText(`${outside.total} registro(s) no recorte selecionado`,{exact:false})).toBeVisible();
  }
  await expect(manager.locator(`a[href*="/measurements/${measurement}"]`).first()).toBeVisible();
  const exportA=await manager.request.get("/api/v1/exports/protocols?format=csv");
  expect(exportA.status()).toBe(200);
  expect(await exportA.text()).toContain(protocol);
  const deniedExport=await reader.request.get("/api/v1/exports/protocols?format=csv");
  expect(deniedExport.status()).toBe(403);
  const bootstrap=await reader.request.get("/api/v1/sync/bootstrap?unitId=04fa0c38-8f17-4747-87fa-0397e81612a4");
  expect(bootstrap.ok()).toBeTruthy();
  expect(await bootstrap.text()).not.toContain(protocol);
  await page.goto("/");
  await selectUnit(page,"B");
  const unitBRecord=await create(page,"knowledge",{"Título":`[HOMOLOGAÇÃO] Exclusivo UBS B ${suffix}`,"Domínio institucional":"gestao"});
  const managerDenied=await manager.request.get(`/api/v1/knowledge/${unitBRecord}`);
  expect([403,404]).toContain(managerDenied.status());
  const visibleToReader=await reader.request.get(`/api/v1/knowledge/${unitBRecord}`);
  expect(visibleToReader.status()).toBe(200);
  await manager.goto("/");
  await manager.screenshot({ path: `${artifactRoot}/ciclo-dashboard.png`, fullPage: true });
  await test.info().attach("registros-sinteticos", { body: JSON.stringify({ knowledge, indicator, protocol, protocolVersion: pv.id, execution: execution.id, measurement, planId, action: action.id, meeting, referral: referral.id }), contentType: "application/json" });
  await managerContext.close();
  await readerContext.close();
});
