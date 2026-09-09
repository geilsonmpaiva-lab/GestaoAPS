import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { modules } from "@/lib/modules";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

type ResourceDefinition = { table: string; demoModule?: string; search?: string[]; domain?: boolean; responsible?: string; type?: string; due?: string };
const resources: Record<string, ResourceDefinition> = {
  organizations: { table: "organizations", demoModule: "administracao", search: ["name"] },
  units: { table: "units", demoModule: "administracao", search: ["name", "cnes_code"] },
  knowledge: { table: "knowledge_items", demoModule: "conhecimento", search: ["title", "domain", "type"], domain: true, responsible: "responsible_id", type: "type" },
  protocols: { table: "protocols", demoModule: "protocolos", search: ["title", "code", "domain"], domain: true, responsible: "responsible_id" },
  executions: { table: "executions", demoModule: "protocolos" },
  indicators: { table: "indicators", demoModule: "indicadores", search: ["name", "code", "domain"], domain: true, responsible: "responsible_id" },
  targets: { table: "targets", demoModule: "indicadores" },
  measurements: { table: "measurements", demoModule: "indicadores" },
  nonconformities: { table: "nonconformities", demoModule: "melhoria", search: ["code", "description", "classification"], responsible: "responsible_id", type: "origin_type", due: "due_at" },
  "action-plans": { table: "action_plans", demoModule: "melhoria", search: ["title", "origin_type"], responsible: "responsible_id", type: "origin_type", due: "due_at" },
  actions: { table: "actions", demoModule: "melhoria", search: ["what", "why", "where_text", "how"], responsible: "who_id", due: "when_at" },
  notifications: { table: "notifications" },
  meetings: { table: "meetings", demoModule: "reunioes", search: ["title", "location"], due: "starts_at" },
  referrals: { table: "referrals", demoModule: "reunioes" },
  "audit-models": { table: "audit_model_versions", demoModule: "qualidade" },
  audits: { table: "audit_executions", demoModule: "qualidade" },
  people: { table: "professionals", demoModule: "pessoas", search: ["name", "category", "role_name"], type: "category" },
  shifts: { table: "shifts", demoModule: "pessoas" },
  assets: { table: "assets", demoModule: "patrimonio", search: ["name", "asset_code", "category", "location"], type: "category" },
  "maintenance-orders": { table: "maintenance_orders", demoModule: "patrimonio" },
  inventory: { table: "inventory_items", demoModule: "estoque", search: ["name", "code", "category"], type: "category" },
  "stock-batches": { table: "stock_batches", demoModule: "estoque" },
  "coverage-requirements": { table: "coverage_requirements", demoModule: "pessoas" },
  "asset-inventories": { table: "asset_inventories", demoModule: "patrimonio", search: ["title"] },
  "stock-inventories": { table: "stock_inventories", demoModule: "estoque", search: ["title"] },
  "safety-events": { table: "safety_events", demoModule: "seguranca" },
  ombudsman: { table: "ombudsman_cases", demoModule: "ouvidoria" }
};

function normalizedSearch(value: string | null) {
  return (value ?? "").trim().slice(0, 100).replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

const scopeSchema = { organizationId: z.uuid(), unitId: z.uuid().nullable() };
const createSchemas = {
  knowledge: z.object({ ...scopeSchema, title: z.string().trim().min(3).max(240), type: z.enum(["PROTOCOL","PROCEDURE","POLICY","STANDARD","MANUAL","GOOD_PRACTICE","LESSON_LEARNED","TEMPLATE","FLOW","FAQ","TECHNICAL_REFERENCE","EXTERNAL_DOCUMENT"]), domain: z.string().trim().min(2).max(80), accessLevel: z.enum(["PUBLIC_INSTITUTIONAL","INTERNAL","RESTRICTED"]).default("INTERNAL") }),
  protocols: z.object({ ...scopeSchema, code: z.string().trim().min(2).max(40), title: z.string().trim().min(3).max(240), domain: z.string().trim().min(2).max(80) }),
  indicators: z.object({ ...scopeSchema, code: z.string().trim().min(2).max(40), name: z.string().trim().min(3).max(240), definition: z.string().trim().min(3).max(2_000), unit: z.string().trim().min(1).max(40), periodicity: z.string().trim().min(2).max(40), source: z.string().trim().min(2).max(120), domain: z.string().trim().min(2).max(80), betterDirection: z.enum(["HIGHER","LOWER","RANGE","EQUAL"]) }),
  meetings: z.object({ ...scopeSchema, title: z.string().trim().min(3).max(240), startsAt: z.iso.datetime({ offset: true }), location: z.string().trim().max(240).optional() }),
  "action-plans": z.object({ ...scopeSchema, title: z.string().trim().min(3).max(240), dueAt: z.iso.datetime({ offset: true }).nullable().optional() })
  ,"audit-models": z.object({ ...scopeSchema, name: z.string().trim().min(3).max(240), auditType: z.enum(["INTERNAL","EXTERNAL"]), domain: z.string().trim().min(2).max(80), periodicity: z.string().trim().max(80).optional(), versionNumber: z.number().int().positive(), checklistSchema: z.object({ criteria: z.array(z.object({ id: z.string().trim().min(1).max(80), label: z.string().trim().min(3).max(500), requiresEvidence: z.boolean().default(false) })).min(1).max(300) }) }),
  audits: z.object({ organizationId: z.uuid(), unitId: z.uuid(), modelVersionId: z.uuid(), scheduledAt: z.iso.datetime({ offset: true }).nullable().optional() })
  ,people: z.object({ organizationId: z.uuid(), unitId: z.uuid(), name: z.string().trim().min(3).max(240), category: z.string().trim().min(2).max(120), roleName: z.string().trim().max(120).optional(), employmentType: z.string().trim().max(80).optional(), weeklyHours: z.number().positive().max(168).optional() }),
  shifts: z.object({ organizationId: z.uuid(), unitId: z.uuid(), professionalId: z.uuid(), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), functionName: z.string().trim().max(120).optional(), location: z.string().trim().max(240).optional() }).refine((value)=>new Date(value.endsAt)>new Date(value.startsAt),{message:"O término deve ser posterior ao início.",path:["endsAt"]}),
  assets: z.object({ organizationId: z.uuid(), unitId: z.uuid(), assetCode: z.string().trim().min(2).max(80), name: z.string().trim().min(3).max(240), category: z.string().trim().max(120).optional(), location: z.string().trim().max(240).optional(), condition: z.string().trim().max(80).optional() }),
  "maintenance-orders": z.object({ organizationId: z.uuid(), unitId: z.uuid(), assetId: z.uuid(), description: z.string().trim().min(3).max(4000), dueAt: z.iso.datetime({ offset: true }).nullable().optional() }),
  inventory: z.object({ organizationId: z.uuid(), unitId: z.uuid(), code: z.string().trim().min(2).max(80), name: z.string().trim().min(3).max(240), category: z.string().trim().max(120).optional(), minimumStock: z.number().nonnegative(), unitOfMeasure: z.string().trim().min(1).max(40) }),
  "stock-batches": z.object({ organizationId: z.uuid(), unitId: z.uuid(), inventoryItemId: z.uuid(), batchCode: z.string().trim().max(120).optional(), expiresOn: z.iso.date().nullable().optional() })
  ,"coverage-requirements": z.object({ organizationId: z.uuid(), unitId: z.uuid(), category: z.string().trim().min(2).max(120), weekday: z.number().int().min(0).max(6), startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), minimumPeople: z.number().int().positive(), validFrom: z.iso.date(), validUntil: z.iso.date().nullable().optional() })
  ,"asset-inventories": z.object({ organizationId: z.uuid(), unitId: z.uuid(), title: z.string().trim().min(3).max(240) })
  ,"stock-inventories": z.object({ organizationId: z.uuid(), unitId: z.uuid(), title: z.string().trim().min(3).max(240) })
  ,"safety-events": z.object({ organizationId: z.uuid(), unitId: z.uuid(), eventAt: z.iso.datetime({ offset: true }), location: z.string().trim().max(240).optional(), eventType: z.string().trim().min(2).max(120), description: z.string().trim().min(3).max(10000), harmClassification: z.string().trim().max(120).optional(), analysisResponsibleId: z.uuid().nullable().optional() }),
  ombudsman: z.object({ organizationId: z.uuid(), unitId: z.uuid(), channel: z.string().trim().min(2).max(80), manifestationType: z.string().trim().min(2).max(120), subject: z.string().trim().min(3).max(240), description: z.string().trim().min(3).max(10000), priority: z.enum(["LOW","NORMAL","HIGH","CRITICAL"]).default("NORMAL"), responsibleId: z.uuid().nullable().optional(), dueAt: z.iso.datetime({ offset: true }).nullable().optional() })
} as const;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { resource } = await context.params;
  const definition = resources[resource];
  if (!definition) return NextResponse.json({ error: "Recurso desconhecido." }, { status: 404 });

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") || 20)));
  const unitId = request.nextUrl.searchParams.get("unitId");
  const status = request.nextUrl.searchParams.get("status");
  const search = normalizedSearch(request.nextUrl.searchParams.get("search") ?? request.nextUrl.searchParams.get("q"));
  const domain = request.nextUrl.searchParams.get("domain");
  const responsibleId = request.nextUrl.searchParams.get("responsibleId");
  const type = request.nextUrl.searchParams.get("type");
  const dueBefore = request.nextUrl.searchParams.get("dueBefore");
  const dueAfter = request.nextUrl.searchParams.get("dueAfter");

  if (isDemoMode()) {
    let records = definition.demoModule ? modules[definition.demoModule].records : [];
    if (search) records = records.filter((record) => `${record.title} ${record.meta} ${record.status}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
    if (status) records = records.filter((record) => record.status.toLocaleLowerCase("pt-BR").includes(status.toLocaleLowerCase("pt-BR")));
    const offset = (page - 1) * pageSize;
    return NextResponse.json({ data: records.slice(offset, offset + pageSize), page, pageSize, total: records.length, mode: "demo" });
  }

  const client = await createSupabaseServerClient();
  if (resource === "safety-events" || resource === "ombudsman") {
    if (!unitId || !z.uuid().safeParse(unitId).success) return NextResponse.json({ error: "Selecione uma UBS para consultar dados restritos." }, { status: 422 });
    const rawDeviceId = request.headers.get("x-device-id");
    const deviceId = rawDeviceId && z.uuid().safeParse(rawDeviceId).success ? rawDeviceId : null;
    const purpose = request.headers.get("x-access-purpose")?.trim() || "Consulta operacional autorizada";
    const { data, error } = await client.rpc("read_sensitive_records", { p_entity_type: definition.table, p_unit_id: unitId, p_limit: pageSize, p_device_id: deviceId, p_purpose: purpose });
    if (error) return NextResponse.json({ error: error.code === "42501" ? "Módulo restrito ou não habilitado." : "Falha ao consultar recurso sensível.", code: error.code }, { status: error.code === "42501" ? 403 : 422 });
    const rows = Array.isArray(data) ? data : [];
    return NextResponse.json({ data: rows, page: 1, pageSize, total: rows.length });
  }
  let query = client.from(definition.table).select("*", { count: "exact" }).range((page - 1) * pageSize, page * pageSize - 1);
  if (unitId) query = query.eq("unit_id", unitId);
  if (status) query = query.eq("status", status);
  if (search && definition.search?.length) query = query.or(definition.search.map((column) => `${column}.ilike.%${search}%`).join(","));
  if (domain && definition.domain) query = query.eq("domain", domain);
  if (responsibleId && definition.responsible && z.uuid().safeParse(responsibleId).success) query = query.eq(definition.responsible, responsibleId);
  if (type && definition.type) query = query.eq(definition.type, type);
  if (dueBefore && definition.due && z.iso.datetime({ offset: true }).safeParse(dueBefore).success) query = query.lte(definition.due, dueBefore);
  if (dueAfter && definition.due && z.iso.datetime({ offset: true }).safeParse(dueAfter).success) query = query.gte(definition.due, dueAfter);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "Falha ao consultar recurso.", code: error.code }, { status: 422 });
  return NextResponse.json({ data, page, pageSize, total: count ?? 0 });
}

export async function POST(request: NextRequest, context: { params: Promise<{ resource: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { resource } = await context.params;
  const schema = createSchemas[resource as keyof typeof createSchemas];
  const definition = resources[resource];
  if (!schema || !definition) return NextResponse.json({ error: "Criação ainda não disponível para este recurso." }, { status: 405 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados de cadastro inválidos.", issues: parsed.error.issues }, { status: 422 });
  const input = parsed.data as Record<string, unknown> & { organizationId: string; unitId: string | null };
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID(), ...input, status: "RASCUNHO", mode: "demo" }, { status: 201 });

  const common = { organization_id: input.organizationId, unit_id: input.unitId, created_by: actor.id };
  let payload: Record<string, unknown>;
  if (resource === "knowledge") payload = { ...common, title: input.title, type: input.type, domain: input.domain, access_level: input.accessLevel, updated_by: actor.id };
  else if (resource === "protocols") payload = { ...common, code: input.code, title: input.title, domain: input.domain, responsible_id: actor.id, updated_by: actor.id };
  else if (resource === "indicators") payload = { ...common, code: input.code, name: input.name, definition: input.definition, unit: input.unit, periodicity: input.periodicity, source: input.source, domain: input.domain, better_direction: input.betterDirection, responsible_id: actor.id, updated_by: actor.id };
  else if (resource === "audit-models") payload = { ...common, name: input.name, audit_type: input.auditType, domain: input.domain, periodicity: input.periodicity, version_number: input.versionNumber, checklist_schema: input.checklistSchema, evidence_rules: [], status: "DRAFT", updated_by: actor.id };
  else if (resource === "audits") payload = { ...common, model_version_id: input.modelVersionId, auditor_id: actor.id, scheduled_at: input.scheduledAt, status: "SCHEDULED", updated_by: actor.id };
  else if (resource === "people") payload = { ...common, name: input.name, category: input.category, role_name: input.roleName, employment_type: input.employmentType, weekly_hours: input.weeklyHours, status: "ACTIVE", updated_by: actor.id };
  else if (resource === "shifts") payload = { ...common, professional_id: input.professionalId, starts_at: input.startsAt, ends_at: input.endsAt, function_name: input.functionName, location: input.location, updated_by: actor.id };
  else if (resource === "assets") payload = { ...common, asset_code: input.assetCode, name: input.name, category: input.category, location: input.location, condition: input.condition, status: "AVAILABLE", updated_by: actor.id };
  else if (resource === "maintenance-orders") payload = { ...common, asset_id: input.assetId, description: input.description, due_at: input.dueAt, status: "OPEN", updated_by: actor.id };
  else if (resource === "inventory") payload = { ...common, code: input.code, name: input.name, category: input.category, minimum_stock: input.minimumStock, unit_of_measure: input.unitOfMeasure, status: "ACTIVE", updated_by: actor.id };
  else if (resource === "stock-batches") payload = { ...common, inventory_item_id: input.inventoryItemId, batch_code: input.batchCode, expires_on: input.expiresOn, quantity: 0, updated_by: actor.id };
  else if (resource === "coverage-requirements") payload = { ...common, category: input.category, weekday: input.weekday, starts_at: input.startsAt, ends_at: input.endsAt, minimum_people: input.minimumPeople, valid_from: input.validFrom, valid_until: input.validUntil, updated_by: actor.id };
  else if (resource === "asset-inventories" || resource === "stock-inventories") payload = { ...common, title: input.title, status: "OPEN", updated_by: actor.id };
  else if (resource === "safety-events") payload = { ...common, event_at: input.eventAt, location: input.location, event_type: input.eventType, description: input.description, harm_classification: input.harmClassification, analysis_responsible_id: input.analysisResponsibleId, status: "REPORTED", updated_by: actor.id };
  else if (resource === "ombudsman") payload = { ...common, channel: input.channel, manifestation_type: input.manifestationType, subject: input.subject, description: input.description, priority: input.priority, responsible_id: input.responsibleId, due_at: input.dueAt, status: "OPEN", updated_by: actor.id };
  else if (resource === "meetings") {
    if (!input.unitId) return NextResponse.json({ error: "Selecione uma UBS para agendar a reunião." }, { status: 422 });
    payload = { ...common, title: input.title, starts_at: input.startsAt, location: input.location, organizer_id: actor.id, updated_by: actor.id };
  } else {
    if (!input.unitId) return NextResponse.json({ error: "Selecione uma UBS para criar o plano." }, { status: 422 });
    payload = { ...common, title: input.title, due_at: input.dueAt, origin_type: "MANUAL", origin_id: crypto.randomUUID(), responsible_id: actor.id, updated_by: actor.id };
  }
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from(definition.table).insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.code === "42501" ? "Sem permissão para criar neste escopo." : "Não foi possível criar o registro.", code: error.code }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json(data, { status: 201 });
}
