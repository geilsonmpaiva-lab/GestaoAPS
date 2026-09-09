import type { ModuleDefinition, ModuleRecord } from "@/lib/modules";
import { modules } from "@/lib/modules";
import { createSupabaseServerClient, isDemoMode } from "@/lib/server/supabase";

export type WorkspaceContext = {
  unitName: string;
  organizationName: string;
  userName: string;
  userInitials: string;
  environmentLabel: string;
  organizationId: string;
  unitId: string | null;
};

const demoContext: WorkspaceContext = {
  unitName: "UBS Jardim Aurora",
  organizationName: "Secretaria Municipal de Saúde",
  userName: "Ana Lima",
  userInitials: "AL",
  environmentLabel: "Ambiente de demonstração",
  organizationId: "00000000-0000-4000-8000-000000000010",
  unitId: "00000000-0000-4000-8000-000000000011"
};

const moduleTables: Record<string, string> = {
  conhecimento: "knowledge_items",
  protocolos: "protocols",
  indicadores: "indicators",
  melhoria: "nonconformities",
  reunioes: "meetings",
  qualidade: "audit_executions",
  pessoas: "professionals",
  patrimonio: "assets",
  estoque: "inventory_items",
  seguranca: "safety_events",
  ouvidoria: "ombudsman_cases",
  administracao: "units"
};

export type ModuleFilters = {
  search?: string;
  status?: string;
  domain?: string;
  responsibleId?: string;
  view?: string;
};

const moduleSearchColumns: Record<string, string[]> = {
  conhecimento: ["title", "domain", "type"], protocolos: ["title", "code", "domain"],
  indicadores: ["name", "code", "domain"], melhoria: ["code", "description", "classification"],
  reunioes: ["title", "location", "status"], qualidade: ["status"], pessoas: ["name", "category", "role_name"],
  patrimonio: ["name", "asset_code", "category", "location"], estoque: ["name", "code", "category"],
  administracao: ["name", "cnes_code"]
};

function safeSearch(value: string) {
  return value.trim().slice(0, 100).replace(/[,%()]/g, " ").replace(/\s+/g, " ");
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR") || "US";
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function labelStatus(value: unknown) {
  const status = text(value) || "ATIVO";
  return status.toLocaleLowerCase("pt-BR").replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

function toneFor(statusValue: unknown): ModuleRecord["tone"] {
  const status = text(statusValue).toLocaleUpperCase("pt-BR");
  if (/CLOSED|COMPLETED|CONCLUID|PUBLISHED|PUBLICADO|ACTIVE|ATIVO|AVAILABLE|DENTRO/.test(status)) return "green";
  if (/OVERDUE|CRITICAL|FORA|CANCEL|SUSPENS|FAILED|RUPTURE|INDISPON/.test(status)) return "red";
  if (/PENDING|REVIEW|REVISAO|ATENCAO|BLOCK|VENC/.test(status)) return "amber";
  if (/OPEN|IN_PROGRESS|ANDAMENTO|SCHEDULED|PROGRAM/.test(status)) return "blue";
  return "gray";
}

function rowToRecord(row: Record<string, unknown>): ModuleRecord {
  const title = text(row.title || row.name || row.subject || row.description || row.code || row.id);
  const details = [row.code, row.domain, row.category, row.event_type, row.audit_type, row.location]
    .map(text).filter(Boolean).join(" · ");
  const progress = typeof row.percentage === "number" ? row.percentage : undefined;
  return { id: text(row.id), version: typeof row.version === "number" ? row.version : 1, title, meta: details || `Atualizado em ${new Date(text(row.updated_at || row.created_at || Date.now())).toLocaleDateString("pt-BR")}`, status: labelStatus(row.status), tone: toneFor(row.status), progress };
}

export async function loadWorkspaceContext(): Promise<WorkspaceContext> {
  if (isDemoMode()) return demoContext;
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { ...demoContext, environmentLabel: "Sessão não autenticada" };
  const [{ data: profile }, { data: membership }] = await Promise.all([
    client.from("profiles").select("name").eq("id", auth.user.id).maybeSingle(),
    client.from("memberships").select("organization_id,unit_id,role").eq("user_id", auth.user.id).lte("starts_at", new Date().toISOString()).or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`).order("starts_at").limit(1).maybeSingle()
  ]);
  const [{ data: organization }, { data: unit }] = await Promise.all([
    membership?.organization_id ? client.from("organizations").select("name").eq("id", membership.organization_id).maybeSingle() : Promise.resolve({ data: null }),
    membership?.unit_id ? client.from("units").select("name").eq("id", membership.unit_id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  const userName = text(profile?.name) || auth.user.email || "Usuário";
  return {
    unitName: text(unit?.name) || "Visão da organização",
    organizationName: text(organization?.name) || "Organização",
    userName,
    userInitials: initials(userName),
    environmentLabel: "Ambiente integrado",
    organizationId: membership?.organization_id ?? "00000000-0000-0000-0000-000000000000",
    unitId: membership?.unit_id ?? null
  };
}

export async function loadModuleDefinition(slug: string, organizationId?: string, unitId?: string | null, filters: ModuleFilters = {}): Promise<ModuleDefinition | null> {
  let definition = modules[slug];
  if (!definition) return null;
  if (isDemoMode()) return definition;
  let table = moduleTables[slug];
  if (!table) return definition;
  const client = await createSupabaseServerClient();
  const featureControlled = ["reunioes", "qualidade", "pessoas", "patrimonio", "estoque", "seguranca", "ouvidoria"].includes(slug);
  if (featureControlled && organizationId) {
    const featureKey = slug === "seguranca" ? "safety_events" : slug === "ouvidoria" ? "ombudsman" : slug;
    let flagQuery = client.from("feature_flags").select("enabled").eq("organization_id", organizationId).in("key", [featureKey, slug, `module.${slug}`]).eq("enabled", true);
    flagQuery = unitId ? flagQuery.or(`unit_id.is.null,unit_id.eq.${unitId}`) : flagQuery.is("unit_id", null);
    const { data: enabledFlags } = await flagQuery.limit(1);
    definition = { ...definition, status: enabledFlags?.length ? "pilot" : "gated" };
  }
  if (slug === "indicadores" && filters.view === "outside") table = "measurements";
  if (slug === "melhoria" && filters.view === "overdue-actions") table = "actions";
  if (slug === "protocolos" && filters.view === "completed-executions") table = "executions";
  const sensitive = slug === "seguranca" || slug === "ouvidoria";
  if (sensitive && !unitId) return { ...definition, records: [], metrics: definition.metrics };
  let query = sensitive
    ? client.rpc("read_sensitive_records", { p_entity_type: table, p_unit_id: unitId, p_limit: 50, p_device_id: null, p_purpose: "Visualização do módulo operacional" })
    : client.from(table).select("*", { count: "exact" }).limit(50);
  if (!sensitive) {
    if (unitId) query = query.eq("unit_id", unitId);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.domain && !["measurements", "actions", "audit_executions", "professionals", "assets", "inventory_items", "units"].includes(table)) query = query.eq("domain", filters.domain);
    if (filters.responsibleId && ["knowledge_items", "protocols", "indicators", "nonconformities"].includes(table)) query = query.eq("responsible_id", filters.responsibleId);
    if (table === "measurements" && filters.view === "outside") query = query.eq("status", "FORA_META");
    if (table === "actions" && filters.view === "overdue-actions") query = query.lt("when_at", new Date().toISOString()).not("status", "in", "(CONCLUIDO,CANCELADO)");
    if (table === "executions" && filters.view === "completed-executions") query = query.eq("status", "COMPLETED");
    const search = filters.search ? safeSearch(filters.search) : "";
    const searchColumns = moduleSearchColumns[slug] ?? [];
    if (search && searchColumns.length && table === moduleTables[slug]) query = query.or(searchColumns.map((column) => `${column}.ilike.%${search}%`).join(","));
    query = query.order("updated_at", { ascending: false, nullsFirst: false });
  }
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar ${definition.title}: ${error.code}`);
  const records = (Array.isArray(data) ? data : []).map((row) => rowToRecord(row as Record<string, unknown>));
  return {
    ...definition,
    metrics: [
      { label: "Registros autorizados", value: String(records.length), note: "Primeiros 50 resultados" },
      { label: "Atualizados", value: String(records.filter((record) => record.tone === "green" || record.tone === "blue").length), note: "No recorte carregado" },
      { label: "Exigem atenção", value: String(records.filter((record) => record.tone === "red" || record.tone === "amber").length), note: "No recorte carregado" }
    ],
    records
  };
}

export async function loadDashboardCounts() {
  if (isDemoMode()) return null;
  const client = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const [outside, overdue, nonconformities, executions, completed, notifications] = await Promise.all([
    client.from("measurements").select("id", { count: "exact", head: true }).eq("status", "FORA_META"),
    client.from("actions").select("id", { count: "exact", head: true }).lt("when_at", now).not("status", "in", "(CONCLUIDO,CANCELADO)"),
    client.from("nonconformities").select("id", { count: "exact", head: true }).not("status", "in", "(CLOSED,CANCELLED)"),
    client.from("executions").select("id", { count: "exact", head: true }),
    client.from("executions").select("id", { count: "exact", head: true }).eq("status", "COMPLETED"),
    client.from("notifications").select("id,title,severity,due_at,kind").is("resolved_at", null).order("created_at", { ascending: false }).limit(4)
  ]);
  const total = executions.count ?? 0;
  return {
    outside: outside.count ?? 0,
    overdue: overdue.count ?? 0,
    nonconformities: nonconformities.count ?? 0,
    protocolRate: total ? Math.round(((completed.count ?? 0) / total) * 100) : 0,
    notifications: notifications.data ?? []
  };
}
