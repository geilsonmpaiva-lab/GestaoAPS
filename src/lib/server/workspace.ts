import type { ModuleDefinition, ModuleRecord } from "@/lib/modules";
import { modules } from "@/lib/modules";
import { createSupabaseServerClient, isDemoMode } from "@/lib/server/supabase";
import { cookies } from "next/headers";
import { modulePagination, scopePermissions, selectAuthorizedScope } from "@/lib/domain/workspace-policy";

export type WorkspaceScope = { organizationId: string; organizationName: string; unitId: string | null; unitName: string };
export const scopeCookie = "sgc-workspace-scope";

export type WorkspaceContext = {
  uxV2: boolean;
  enabledModules: string[];
  userId: string;
  scopes: WorkspaceScope[];
  permissions: { domain: string; operations: string[] }[];
  unitName: string;
  organizationName: string;
  userName: string;
  userInitials: string;
  environmentLabel: string;
  organizationId: string;
  unitId: string | null;
};

const demoContext: WorkspaceContext = {
  uxV2: true,
  enabledModules: ["conhecimento", "protocolos", "indicadores", "melhoria", "reunioes", "administracao", "formularios-esf"],
  userId: "00000000-0000-4000-8000-000000000001",
  scopes: [],
  permissions: [{ domain: "*", operations: ["*"] }],
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
  page?: string;
  due?: string;
  sort?: string;
};

const moduleSearchColumns: Record<string, string[]> = {
  conhecimento: ["title", "domain", "type"], protocolos: ["title", "code", "domain"],
  indicadores: ["name", "code", "domain"], melhoria: ["code", "description", "classification"],
  reunioes: ["title", "location", "status"], qualidade: ["status"], pessoas: ["name", "category", "role_name"],
  patrimonio: ["name", "asset_code", "category", "location"], estoque: ["name", "code", "category"],
  administracao: ["name", "cnes"]
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
  const title = text(row.title || row.name || row.what || row.subject || row.description || row.code || row.id);
  const details = [row.code, row.domain, row.category, row.event_type, row.audit_type, row.location]
    .map(text).filter(Boolean).join(" · ");
  const progress = typeof row.percentage === "number" ? row.percentage : undefined;
  return { id: text(row.id), version: typeof row.version === "number" ? row.version : 1, title, meta: details || `Atualizado em ${new Date(text(row.updated_at || row.created_at || Date.now())).toLocaleDateString("pt-BR")}`, status: labelStatus(row.status), tone: toneFor(row.status), progress };
}

const resourceNames: Record<string, string> = { knowledge_items: "knowledge", protocols: "protocols", indicators: "indicators", measurements: "measurements", executions: "executions", nonconformities: "nonconformities", action_plans: "action-plans", actions: "actions", meetings: "meetings", units: "units" };
const statusLabels: Record<string, string> = { DRAFT: "Rascunho", RASCUNHO: "Rascunho", IN_REVIEW: "Em revisão", EM_REVISAO: "Em revisão", APPROVED: "Aprovado", APROVADO: "Aprovado", PUBLISHED: "Publicado", PUBLICADO: "Publicado", OPEN: "Aberto", IN_PROGRESS: "Em andamento", COMPLETED: "Concluído", CLOSED: "Encerrado", CANCELLED: "Cancelado", ACTIVE: "Ativo", SCHEDULED: "Agendado", MINUTES_PENDING: "Ata pendente", SEM_DADO: "Sem dado", FORA_META: "Fora da meta", DENTRO_META: "Dentro da meta", ATENCAO: "Atenção", NAO_INICIADO: "Não iniciado", EM_ANDAMENTO: "Em andamento", CONCLUIDO: "Concluído", BLOQUEADO: "Bloqueado", CANCELADO: "Cancelado", EFFECTIVENESS_PENDING: "Eficácia pendente", IN_ANALYSIS: "Em análise", IN_TREATMENT: "Em tratamento" };

export async function loadModuleDefinitionV2(slug: string, workspace: WorkspaceContext, filters: ModuleFilters): Promise<ModuleDefinition | null> {
  const definition = modules[slug];
  if (!definition) return null;
  const { pageSize, page, from, to } = modulePagination(filters.page);
  if (!workspace.enabledModules.includes(slug)) return { ...definition, status: "gated", records: [], metrics: [], pageInfo: { page: 1, pageSize, total: 0 } };
  let table = moduleTables[slug];
  if (slug === "protocolos" && ["executions", "completed-executions"].includes(filters.view ?? "")) table = "executions";
  if (slug === "indicadores" && ["measurements", "outside"].includes(filters.view ?? "")) table = "measurements";
  if (slug === "melhoria" && filters.view === "plans") table = "action_plans";
  if (slug === "melhoria" && ["actions", "overdue-actions"].includes(filters.view ?? "")) table = "actions";
  const resource = resourceNames[table];
  if (isDemoMode()) {
    const demoStatus = table === "meetings" ? "SCHEDULED" : table === "executions" ? "IN_PROGRESS" : table === "measurements" ? "FORA_META" : ["actions", "action_plans"].includes(table) ? "NAO_INICIADO" : table === "protocols" ? "RASCUNHO" : table === "nonconformities" ? "OPEN" : table === "indicators" ? "ACTIVE" : "DRAFT";
    const resourceNumber = Math.max(0, Object.keys(resourceNames).indexOf(table)) + 1;
    const records = definition.records.map((item, index) => {
      const id = item.id ?? `00000000-0000-4000-8000-${String(resourceNumber * 1000 + index + 1).padStart(12, "0")}`;
      return { ...item, id, resource, rawStatus: demoStatus, status: statusLabels[demoStatus] ?? demoStatus, tone: toneFor(demoStatus), href: resource && resource !== "units" ? `/registros/${resource}/${id}` : undefined };
    }).filter((item) => (!filters.search || `${item.title} ${item.meta}`.toLowerCase().includes(filters.search.toLowerCase())) && (!filters.status || item.rawStatus === filters.status) && (!filters.domain || item.meta.toLowerCase().includes(filters.domain.toLowerCase())) && (!filters.responsibleId || filters.responsibleId === "me" || filters.responsibleId === workspace.userId));
    return { ...definition, records: records.slice((page - 1) * pageSize, page * pageSize), pageInfo: { page, pageSize, total: records.length } };
  }
  if (["seguranca", "ouvidoria"].includes(slug)) return loadModuleDefinition(slug, workspace.organizationId, workspace.unitId, filters);
  const client = await createSupabaseServerClient();
  let query = client.from(table).select("*", { count: "exact" }).eq("organization_id", workspace.organizationId);
  if (workspace.unitId) query = query.eq(table === "units" ? "id" : "unit_id", workspace.unitId);
  if (table !== "measurements") query = query.is("deleted_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.view === "outside") query = query.eq("status", "FORA_META");
  if (filters.view === "completed-executions") query = query.eq("status", "COMPLETED");
  if (filters.domain && ["knowledge_items", "protocols", "indicators"].includes(table)) query = query.eq("domain", filters.domain);
  const responsibleColumn = table === "actions" ? "who_id" : table === "meetings" ? "organizer_id" : table === "executions" ? "executor_id" : "responsible_id";
  if (filters.responsibleId && !["measurements", "units"].includes(table)) query = query.eq(responsibleColumn, filters.responsibleId === "me" ? workspace.userId : filters.responsibleId);
  const dueColumn = table === "actions" ? "when_at" : table === "meetings" ? "starts_at" : ["action_plans", "nonconformities"].includes(table) ? "due_at" : undefined;
  if ((filters.due === "overdue" || filters.view === "overdue-actions") && dueColumn) query = query.lt(dueColumn, new Date().toISOString()).not("status", "in", "(CONCLUIDO,CANCELADO,COMPLETED,CLOSED,CANCELLED)");
  if (filters.due === "upcoming" && dueColumn) query = query.gte(dueColumn, new Date().toISOString());
  const searchColumns = table === "actions" ? ["what", "why"] : table === "action_plans" ? ["title"] : table === moduleTables[slug] ? moduleSearchColumns[slug] ?? [] : [];
  const search = safeSearch(filters.search ?? "");
  if (search && searchColumns.length) query = query.or(searchColumns.map((column) => `${column}.ilike.%${search}%`).join(","));
  const titleColumn = table === "actions" ? "what" : ["indicators", "units"].includes(table) ? "name" : table === "nonconformities" ? "description" : "title";
  if (filters.sort === "due_asc" && dueColumn) query = query.order(dueColumn, { ascending: true, nullsFirst: false });
  else if (filters.sort === "title_asc" && !["measurements", "executions"].includes(table)) query = query.order(titleColumn);
  else query = query.order("updated_at", { ascending: false });
  const result = await query.order("id").range(from, to);
  if (result.error) throw new Error(`Não foi possível carregar ${definition.title}. Tente novamente.`);
  const rows = (result.data ?? []) as Record<string, unknown>[];
  if (table === "measurements" && rows.length) {
    const indicators = await client.from("indicators").select("id,name,code").in("id", rows.map((row) => text(row.indicator_id)));
    if (indicators.error) throw new Error("Não foi possível consultar os indicadores vinculados.");
    for (const row of rows) { const indicator = indicators.data?.find((item) => item.id === row.indicator_id); row.title = indicator?.name ?? "Medição"; row.code = [indicator?.code, text(row.competency), row.value == null ? "Sem dado" : `Resultado: ${row.value}`].filter(Boolean).join(" · "); }
  }
  if (table === "executions" && rows.length) {
    const versions = await client.from("protocol_versions").select("id,protocol_id,version_number").in("id", rows.map((row) => text(row.protocol_version_id)));
    if (versions.error) throw new Error("Não foi possível consultar a versão executada.");
    const protocols = versions.data?.length ? await client.from("protocols").select("id,title,code").in("id", versions.data.map((item) => item.protocol_id)) : { data: [], error: null };
    if (protocols.error) throw new Error("Não foi possível consultar o protocolo executado.");
    for (const row of rows) { const version = versions.data?.find((item) => item.id === row.protocol_version_id); const protocol = protocols.data?.find((item) => item.id === version?.protocol_id); row.title = protocol?.title ?? "Execução de protocolo"; row.code = [protocol?.code, version ? `Versão ${version.version_number}` : null].filter(Boolean).join(" · "); }
  }
  const responsibleIds = [...new Set(rows.map((row) => text(row[responsibleColumn])).filter(Boolean))];
  const profileResult = responsibleIds.length ? await client.from("profiles").select("id,name").in("id", responsibleIds) : { data: [], error: null };
  if (profileResult.error) throw new Error("Não foi possível consultar os responsáveis.");
  const records = rows.map((row) => ({ ...rowToRecord(row), resource, rawStatus: text(row.status), status: statusLabels[text(row.status)] ?? labelStatus(row.status), href: resource ? `/registros/${resource}/${row.id}` : undefined, responsibleId: text(row[responsibleColumn]) || undefined, responsibleName: profileResult.data?.find((profile) => profile.id === row[responsibleColumn])?.name, dueAt: dueColumn ? text(row[dueColumn]) || undefined : undefined }));
  return { ...definition, status: "active", records, metrics: [{ label: "Registros encontrados", value: String(result.count ?? 0), note: "No escopo e filtros selecionados" }], pageInfo: { page, pageSize, total: result.count ?? 0 } };
}

export async function loadWorkspaceContext(): Promise<WorkspaceContext> {
  if (isDemoMode()) return { ...demoContext, uxV2: process.env.SGC_UX_V2 !== "false", scopes: [{ organizationId: demoContext.organizationId, organizationName: demoContext.organizationName, unitId: demoContext.unitId, unitName: demoContext.unitName }] };
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sessão não autenticada.");
  const [profileResult, membershipsResult] = await Promise.all([
    client.from("profiles").select("name,status").eq("id", auth.user.id).maybeSingle(),
    client.from("memberships").select("organization_id,unit_id,role,domains,operations").eq("user_id", auth.user.id).lte("starts_at", new Date().toISOString()).or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`).order("starts_at")
  ]);
  if (profileResult.error || membershipsResult.error) throw new Error("Não foi possível consultar seus vínculos.");
  const profile = profileResult.data;
  if (profile?.status !== "ACTIVE") throw new Error("Perfil sem acesso ativo.");
  const memberships = membershipsResult.data ?? [];
  if (!memberships.length) throw new Error("Nenhum vínculo ativo encontrado.");
  const metadataResult = await client.rpc("read_workspace_metadata");
  if (metadataResult.error) throw new Error("Não foi possível consultar as unidades autorizadas.");
  const metadata = metadataResult.data as { organizations: { id: string; name: string }[]; units: { id: string; name: string; organization_id: string }[]; flags: { key: string; enabled: boolean; unit_id: string | null; organization_id: string }[] };
  const scopes: WorkspaceScope[] = [];
  for (const organization of metadata.organizations) {
    const memberScopes = memberships.filter((item) => item.organization_id === organization.id);
    if (memberScopes.some((item) => item.unit_id === null)) scopes.push({ organizationId: organization.id, organizationName: organization.name, unitId: null, unitName: "Visão da organização" });
    for (const unit of metadata.units) {
      if (unit.organization_id === organization.id && memberScopes.some((item) => item.unit_id === null || item.unit_id === unit.id)) scopes.push({ organizationId: organization.id, organizationName: organization.name, unitId: unit.id, unitName: unit.name });
    }
  }
  if (!scopes.length) throw new Error("Nenhum escopo autorizado disponível.");
  const scope = selectAuthorizedScope(scopes, (await cookies()).get(scopeCookie)?.value)!;
  const permissions = scopePermissions(memberships, scope);
  const flags = metadata.flags.filter((item) => item.organization_id === scope.organizationId && (item.unit_id === null || item.unit_id === scope.unitId));
  function flagEnabled(key: string) { return (flags.find((item) => item.key === key && item.unit_id === scope.unitId) ?? flags.find((item) => item.key === key && item.unit_id === null))?.enabled === true; }
  const core = ["conhecimento", "protocolos", "indicadores", "melhoria", "administracao"];
  const moduleDomain: Record<string, string> = { seguranca: "seguranca", ouvidoria: "ouvidoria", melhoria: "melhoria" };
  const canRead = (slug: string) => permissions.some((item) => (item.domain === "*" || item.domain === (moduleDomain[slug] ?? slug)) && (item.operations.includes("*") || item.operations.includes("visualizar")));
  const enabledModules = Object.keys(modules).filter((slug) => canRead(slug) && (core.includes(slug) || flagEnabled(slug === "seguranca" ? "safety_events" : slug === "ouvidoria" ? "ombudsman" : slug) || flagEnabled(`module.${slug}`)));
  if (flagEnabled('esf.producao') && canRead('esf.producao')) enabledModules.push('formularios-esf');
  const userName = text(profile?.name) || auth.user.email || "Usuário";
  return {
    ...scope,
    uxV2: flagEnabled("ux_mvp_v2") || (process.env.VERCEL_ENV === "preview" && process.env.SGC_UX_V2 === "true"),
    enabledModules,
    userId: auth.user.id,
    scopes,
    permissions,
    userName,
    userInitials: initials(userName),
    environmentLabel: "Ambiente integrado",
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

export async function loadDashboardV2(workspace: WorkspaceContext) {
  const updatedAt = new Date().toISOString();
  if (isDemoMode()) return { demo: true, updatedAt, outside: 0, overdue: 0, nonconformities: 0, executions: 0, completed: 0, notifications: [] as Array<{ id: string; title: string; severity: string; due_at: string | null; href: string | null }> };
  const client = await createSupabaseServerClient();
  const scopedCount = (table: string) => {
    let query = client.from(table).select("id", { count: "exact", head: true }).eq("organization_id", workspace.organizationId);
    if (workspace.unitId) query = query.eq("unit_id", workspace.unitId);
    if (table !== "measurements") query = query.is("deleted_at", null);
    return query;
  };
  const loadNotifications = async () => {
    const results = await Promise.all(["CRITICAL", "ATTENTION", "INFORMATION"].map((severity) => {
      let query = client.from("notifications").select("id,title,severity,due_at,source_type,source_id").eq("organization_id", workspace.organizationId).eq("user_id", workspace.userId).is("resolved_at", null).eq("severity", severity);
      if (workspace.unitId) query = query.eq("unit_id", workspace.unitId);
      return query.order("due_at", { ascending: true, nullsFirst: false }).order("id").limit(8);
    }));
    return { error: results.find((result) => result.error)?.error ?? null, data: results.flatMap((result) => result.data ?? []).slice(0, 8) };
  };
  const [outside, overdue, nonconformities, executions, completed, notifications] = await Promise.all([
    scopedCount("measurements").eq("status", "FORA_META"),
    scopedCount("actions").lt("when_at", updatedAt).not("status", "in", "(CONCLUIDO,CANCELADO)"),
    scopedCount("nonconformities").not("status", "in", "(CLOSED,CANCELLED)"),
    scopedCount("executions"),
    scopedCount("executions").eq("status", "COMPLETED"),
    loadNotifications()
  ]);
  if ([outside, overdue, nonconformities, executions, completed, notifications].some((result) => result.error)) throw new Error("Não foi possível atualizar o painel. Tente novamente para consultar os dados atuais.");
  return { demo: false, updatedAt, outside: outside.count ?? 0, overdue: overdue.count ?? 0, nonconformities: nonconformities.count ?? 0, executions: executions.count ?? 0, completed: completed.count ?? 0, notifications: (notifications.data ?? []).map((item) => ({ ...item, href: resourceNames[item.source_type] ? `/registros/${resourceNames[item.source_type]}/${item.source_id}` : null })) };
}
