import { expect, test } from "@playwright/test";

test("critical commands expose versioned and idempotent contracts", async ({ request }) => {
  const entityId = crypto.randomUUID();
  const base = { operationId: crypto.randomUUID(), expectedVersion: 1 };
  const calls = [
    request.post(`/api/v1/protocols/${entityId}/approve`, { data: base }),
    request.post(`/api/v1/protocols/${entityId}/publish`, { data: { ...base, operationId: crypto.randomUUID() } }),
    request.post(`/api/v1/executions/${entityId}/complete`, { data: { ...base, operationId: crypto.randomUUID(), compliance: "CONFORME", indicatorInputs: { conformes: 23, total: 25 } } }),
    request.post(`/api/v1/measurements/${entityId}/open-plan`, { data: { ...base, operationId: crypto.randomUUID(), title: "Plano para tratar desvio", description: "Descrição institucional do desvio.", classification: "MAJOR" } }),
    request.post(`/api/v1/meetings/${entityId}/complete`, { data: { ...base, operationId: crypto.randomUUID(), minutes: "Ata validada no teste automatizado." } })
  ];
  const responses = await Promise.all(calls);
  responses.forEach((response) => expect(response.ok()).toBeTruthy());
  await expect(responses[0].json()).resolves.toMatchObject({ status: "APROVADO", version: 1 });
  await expect(responses[2].json()).resolves.toMatchObject({ status: "COMPLETED", version: 2, measurement: { value: 92, status: "ATENCAO" } });
  await expect(responses[3].json()).resolves.toMatchObject({ status: "OPEN" });

  const indicatorId = crypto.randomUUID();
  const formulaId = crypto.randomUUID();
  const formula = await request.post(`/api/v1/indicators/${indicatorId}/formulas`, { data: {
    operationId: crypto.randomUUID(), expectedVersion: 1, variables: ["conformes", "total"], validFrom: "2026-09-01",
    expression: { type: "binary", operator: "*", left: { type: "binary", operator: "/", left: { type: "variable", name: "conformes" }, right: { type: "variable", name: "total" } }, right: { type: "literal", value: 100 } }
  } });
  const target = await request.post(`/api/v1/indicators/${indicatorId}/targets`, { data: { organizationId: crypto.randomUUID(), unitId: crypto.randomUUID(), startsOn: "2026-09-01", endsOn: "2026-12-31", comparison: "GTE", targetValue: 95, attentionRule: { value: 90 } } });
  const binding = await request.post(`/api/v1/protocol-versions/${entityId}/indicator-bindings`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, indicatorId, formulaVersionId: formulaId, unitId: null } });
  expect(formula.status()).toBe(201);
  expect(target.status()).toBe(201);
  expect(binding.status()).toBe(201);

  const organizationId = crypto.randomUUID();
  const unitId = crypto.randomUUID();
  const actionPlanId = crypto.randomUUID();
  const actionId = crypto.randomUUID();
  const policy = await request.put(`/api/v1/indicators/${indicatorId}/deviation-policy`, { data: { organizationId, unitId, autoOpenNonconformity: true, classification: "MAJOR", defaultResponsibleId: null, dueDays: 15, planTitle: "Tratar desvio do indicador" } });
  const action = await request.post(`/api/v1/action-plans/${actionPlanId}/actions`, { data: { what: "Revisar o processo assistencial", why: "Corrigir a causa do desvio", where: "UBS piloto", whenAt: "2026-09-30T18:00:00-03:00", whoId: null, how: "Aplicar o protocolo revisado", howMuch: 0 } });
  const completion = await request.post(`/api/v1/actions/${actionId}/complete`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, evidenceAttachmentId: null } });
  const effectiveness = await request.post(`/api/v1/action-plans/${actionPlanId}/effectiveness`, { data: { operationId: crypto.randomUUID(), expectedVersion: 2, effective: true, notes: "A nova medição confirmou a recuperação do indicador.", evidenceAttachmentId: null } });
  expect(policy.status()).toBe(200);
  await expect(policy.json()).resolves.toMatchObject({ indicatorId, autoOpenNonconformity: true });
  expect(action.status()).toBe(201);
  await expect(action.json()).resolves.toMatchObject({ actionPlanId, status: "NAO_INICIADO", version: 1 });
  await expect(completion.json()).resolves.toMatchObject({ id: actionId, status: "CONCLUIDO", planReadyForEffectiveness: true });
  await expect(effectiveness.json()).resolves.toMatchObject({ actionPlanId, effective: true, status: "CLOSED" });

  const meetingId = crypto.randomUUID();
  const participantId = crypto.randomUUID();
  const referralId = crypto.randomUUID();
  const meetingStart = await request.post(`/api/v1/meetings/${meetingId}/start`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1 } });
  const agenda = await request.post(`/api/v1/meetings/${meetingId}/agenda`, { data: { position: 1, title: "Analisar resultado mensal", description: "Revisão do indicador e definição do encaminhamento." } });
  const attendance = await request.put(`/api/v1/meetings/${meetingId}/participants/${participantId}`, { data: { attended: true } });
  const referral = await request.post(`/api/v1/meetings/${meetingId}/referrals`, { data: { agendaItemId: null, description: "Revisar fluxo da sala de vacina", responsibleId: participantId, dueAt: "2026-10-15T18:00:00-03:00", priority: "HIGH" } });
  const conversion = await request.post(`/api/v1/referrals/${referralId}/convert-to-action`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1 } });
  await expect(meetingStart.json()).resolves.toMatchObject({ id: meetingId, status: "IN_PROGRESS", version: 2 });
  expect(agenda.status()).toBe(201);
  await expect(attendance.json()).resolves.toMatchObject({ meetingId, userId: participantId, attended: true });
  await expect(referral.json()).resolves.toMatchObject({ meetingId, status: "OPEN", priority: "HIGH" });
  await expect(conversion.json()).resolves.toMatchObject({ id: referralId, status: "IN_PROGRESS", version: 2 });

  const auditModelId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const modelPublication = await request.post(`/api/v1/audit-models/${auditModelId}/publish`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1 } });
  const auditStart = await request.post(`/api/v1/audits/${auditId}/start`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1 } });
  const auditCompletion = await request.post(`/api/v1/audits/${auditId}/complete`, { data: { operationId: crypto.randomUUID(), expectedVersion: 2, result: { summary: "Auditoria concluída no piloto.", criteria: [{ id: "armazenamento", compliant: false, notes: "Temperatura fora do padrão institucional.", evidenceAttachmentIds: [] }] } } });
  await expect(modelPublication.json()).resolves.toMatchObject({ id: auditModelId, status: "PUBLISHED", version: 2 });
  await expect(auditStart.json()).resolves.toMatchObject({ id: auditId, status: "IN_PROGRESS", version: 2 });
  await expect(auditCompletion.json()).resolves.toMatchObject({ id: auditId, status: "COMPLETED", version: 3, failedCriteria: 1 });

  const assetId = crypto.randomUUID();
  const batchId = crypto.randomUUID();
  const assetMovement = await request.post(`/api/v1/assets/${assetId}/move`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, toLocation: "Consultório 2", reason: "Reorganização aprovada no inventário" } });
  const stockMovement = await request.post(`/api/v1/stock-batches/${batchId}/movements`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, movementType: "EXIT", quantity: 20, reason: "Consumo registrado pela UBS" } });
  await expect(assetMovement.json()).resolves.toMatchObject({ id: assetId, location: "Consultório 2", version: 2 });
  await expect(stockMovement.json()).resolves.toMatchObject({ id: batchId, quantity: 80, version: 2 });
  const maintenanceId = crypto.randomUUID();
  const maintenance = await request.post(`/api/v1/maintenance-orders/${maintenanceId}/transition`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, targetStatus: "IN_PROGRESS" } });
  await expect(maintenance.json()).resolves.toMatchObject({ id: maintenanceId, status: "IN_PROGRESS", version: 2, assetStatus: "MAINTENANCE" });

  const safetyEventId = crypto.randomUUID();
  const ombudsmanId = crypto.randomUUID();
  const safetyAnalysis = await request.post(`/api/v1/safety-events/${safetyEventId}/analyze`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, contributingFactors: "Fluxo institucional não seguido", immediateAction: "Orientação e contenção imediata registradas", createPlan: true } });
  const ombudsmanResponse = await request.post(`/api/v1/ombudsman/${ombudsmanId}/respond`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, analysis: "Manifestação analisada pela equipe responsável", response: "Resposta institucional validada e registrada" } });
  await expect(safetyAnalysis.json()).resolves.toMatchObject({ id: safetyEventId, status: "ACTION_PLAN", version: 2 });
  await expect(ombudsmanResponse.json()).resolves.toMatchObject({ id: ombudsmanId, status: "CLOSED", version: 2 });

  const knowledgeId=crypto.randomUUID();const knowledgeVersionId=crypto.randomUUID();const protocolId=crypto.randomUUID();const protocolVersionId=crypto.randomUUID();const executionId=crypto.randomUUID();
  const knowledgeVersion=await request.post(`/api/v1/knowledge/${knowledgeId}/versions`,{data:{operationId:crypto.randomUUID(),expectedVersion:1,content:{situation:"Situação gerencial",learning:"Aprendizado validado"},references:[],validFrom:"2026-09-03",validUntil:null}});
  const knowledgeTransition=await request.post(`/api/v1/knowledge-versions/${knowledgeVersionId}/transition`,{data:{operationId:crypto.randomUUID(),expectedVersion:1,targetStatus:"IN_REVIEW"}});
  const protocolVersion=await request.post(`/api/v1/protocols/${protocolId}/versions`,{data:{operationId:crypto.randomUUID(),expectedVersion:1,content:{objective:"Padronizar processo",steps:[]},validFrom:"2026-09-03",validUntil:null}});
  const review=await request.post(`/api/v1/protocol-versions/${protocolVersionId}/submit-review`,{data:{operationId:crypto.randomUUID(),expectedVersion:1}});
  const execution=await request.post(`/api/v1/protocol-versions/${protocolVersionId}/executions`,{data:{operationId:crypto.randomUUID(),executionId,unitId:crypto.randomUUID()}});
  expect(knowledgeVersion.status()).toBe(201);await expect(knowledgeTransition.json()).resolves.toMatchObject({id:knowledgeVersionId,status:"IN_REVIEW"});expect(protocolVersion.status()).toBe(201);await expect(review.json()).resolves.toMatchObject({id:protocolVersionId,status:"EM_REVISAO"});await expect(execution.json()).resolves.toMatchObject({id:executionId,protocolVersionId,status:"IN_PROGRESS",version:1});

  const attachmentId=crypto.randomUUID();const evidence=await request.post("/api/v1/evidence/upload-url",{data:{attachmentId,organizationId:crypto.randomUUID(),unitId:crypto.randomUUID(),entityType:"executions",entityId:executionId,evidenceKind:"COMPLETION",fileName:"evidencia.pdf",contentType:"application/pdf",byteSize:10,sha256:"a".repeat(64),classification:"INTERNAL"}});expect(evidence.status()).toBe(201);await expect(evidence.json()).resolves.toMatchObject({attachmentId,mode:"demo"});
  const finalized=await request.post(`/api/v1/evidence/${attachmentId}/finalize`,{data:{expectedVersion:1}});await expect(finalized.json()).resolves.toMatchObject({id:attachmentId,status:"AVAILABLE",version:2});const download=await request.get(`/api/v1/evidence/${attachmentId}/download-url`);await expect(download.json()).resolves.toMatchObject({id:attachmentId,expiresIn:60});

  const measurementId=crypto.randomUUID();const analysis=await request.post(`/api/v1/measurements/${measurementId}/analysis`,{data:{operationId:crypto.randomUUID(),expectedVersion:1,analysis:"Resultado abaixo da meta institucional",cause:"Falha identificada no processo",decision:"Executar e monitorar o plano",actionPlanId:null}});expect(analysis.status()).toBe(201);await expect(analysis.json()).resolves.toMatchObject({measurementId});
  const updatedAction=await request.post(`/api/v1/actions/${actionId}/update`,{data:{operationId:crypto.randomUUID(),expectedVersion:1,status:"BLOQUEADO",percentage:35,blockedReason:"Dependência externa pendente",comment:"Responsável comunicado"}});await expect(updatedAction.json()).resolves.toMatchObject({id:actionId,status:"BLOQUEADO",percentage:35,version:2});
  const notificationId=crypto.randomUUID();const readNotification=await request.post(`/api/v1/notifications/${notificationId}/read`);await expect(readNotification.json()).resolves.toMatchObject({id:notificationId,resolved:false});
});

test("critical commands reject malformed identifiers and payloads", async ({ request }) => {
  const response = await request.post("/api/v1/executions/not-a-uuid/complete", { data: { expectedVersion: -1 } });
  expect(response.status()).toBe(422);
  const invalidFormula = await request.post(`/api/v1/indicators/${crypto.randomUUID()}/formulas`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, variables: ["x"], validFrom: "2026-09-01", expression: { type: "binary", operator: "eval", left: { type: "literal", value: 1 }, right: { type: "literal", value: 2 } } } });
  expect(invalidFormula.status()).toBe(422);
  const invalidEffectiveness = await request.post(`/api/v1/action-plans/${crypto.randomUUID()}/effectiveness`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, effective: true, notes: "x" } });
  expect(invalidEffectiveness.status()).toBe(422);
  const invalidAgenda = await request.post(`/api/v1/meetings/${crypto.randomUUID()}/agenda`, { data: { position: 0, title: "x" } });
  expect(invalidAgenda.status()).toBe(422);
  const invalidAudit = await request.post(`/api/v1/audits/${crypto.randomUUID()}/complete`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, result: { criteria: [] } } });
  expect(invalidAudit.status()).toBe(422);
  const invalidStock = await request.post(`/api/v1/stock-batches/${crypto.randomUUID()}/movements`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, movementType: "EXIT", quantity: -1, reason: "inválido" } });
  expect(invalidStock.status()).toBe(422);
  const invalidMaintenance = await request.post(`/api/v1/maintenance-orders/${crypto.randomUUID()}/transition`, { data: { operationId: crypto.randomUUID(), expectedVersion: 0, targetStatus: "OPEN" } });
  expect(invalidMaintenance.status()).toBe(422);
  const invalidSafety = await request.post(`/api/v1/safety-events/${crypto.randomUUID()}/analyze`, { data: { operationId: crypto.randomUUID(), expectedVersion: 1, contributingFactors: "x", immediateAction: "y", createPlan: false } });
  expect(invalidSafety.status()).toBe(422);
  const invalidEvidence=await request.post("/api/v1/evidence/upload-url",{data:{attachmentId:crypto.randomUUID(),fileName:"x.exe",contentType:"application/octet-stream",byteSize:0,sha256:"bad"}});expect(invalidEvidence.status()).toBe(422);
  const unjustifiedDeadline=await request.post(`/api/v1/actions/${crypto.randomUUID()}/update`,{data:{operationId:crypto.randomUUID(),expectedVersion:1,dueAt:"2026-12-01T12:00:00-03:00"}});expect(unjustifiedDeadline.status()).toBe(422);
});

test("authorized exports provide safe CSV and XLSX downloads",async({request})=>{
  const csv=await request.get("/api/v1/exports/protocols?format=csv");expect(csv.status()).toBe(200);expect(csv.headers()["content-type"]).toContain("text/csv");expect(await csv.text()).toContain("code");
  const xlsx=await request.get("/api/v1/exports/indicators?format=xlsx");expect(xlsx.status()).toBe(200);expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");const bytes=await xlsx.body();expect(bytes.subarray(0,2).toString()).toBe("PK");
});
