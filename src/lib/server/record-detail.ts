import "server-only";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode } from "@/lib/server/supabase";
import { loadModuleDefinitionV2, type WorkspaceContext } from "@/lib/server/workspace";

export type DetailRow = Record<string, unknown> & { id: string };
export type DetailData = { resource: string; module: string; record: DetailRow; related: Record<string, DetailRow[]>; choices: Record<string, DetailRow[]> };
export const detailResources: Record<string, { table: string; module: string; soft?: boolean }> = {
  knowledge: { table: "knowledge_items", module: "conhecimento", soft: true },
  "knowledge-versions": { table: "knowledge_versions", module: "conhecimento" },
  protocols: { table: "protocols", module: "protocolos", soft: true },
  "protocol-versions": { table: "protocol_versions", module: "protocolos" },
  executions: { table: "executions", module: "protocolos", soft: true },
  indicators: { table: "indicators", module: "indicadores", soft: true },
  measurements: { table: "measurements", module: "indicadores" },
  nonconformities: { table: "nonconformities", module: "melhoria", soft: true },
  "action-plans": { table: "action_plans", module: "melhoria", soft: true },
  actions: { table: "actions", module: "melhoria", soft: true },
  meetings: { table: "meetings", module: "reunioes", soft: true },
  referrals: { table: "referrals", module: "reunioes" },
};

export async function loadRecordDetail(resource: string, id: string, workspace: WorkspaceContext): Promise<DetailData | null> {
  const definition = detailResources[resource];
  if (!definition || !z.uuid().safeParse(id).success || !workspace.enabledModules.includes(definition.module)) return null;
  if (isDemoMode()) {
    const views: Record<string, string> = { executions: "executions", measurements: "measurements", "action-plans": "plans", actions: "actions" };
    const list = await loadModuleDefinitionV2(definition.module, workspace, { view: views[resource] });
    const parentResource = resource === "protocol-versions" ? "protocols" : resource === "knowledge-versions" ? "knowledge" : resource;
    const item = list?.records.find(record => record.id === id && record.resource === parentResource);
    if (!item) return null;
    const row: DetailRow = { id, title: item.title, name: item.title, description: item.meta, organization_id: workspace.organizationId, unit_id: workspace.unitId, status: item.rawStatus, version: 1, version_number: 1 };
    const related: Record<string, DetailRow[]> = {};
    if (resource === "protocols") related["protocol-versions"] = [{ ...row, protocol_id: id }];
    if (resource === "knowledge") related["knowledge-versions"] = [{ ...row, knowledge_item_id: id }];
    if (resource === "protocol-versions") row.protocol_id = id;
    if (resource === "knowledge-versions") row.knowledge_item_id = id;
    return { resource, module: definition.module, record: row, related, choices: { people: [{ id: workspace.userId, name: workspace.userName }] } };
  }
  const client = await createSupabaseServerClient();
  let effectiveUnit = workspace.unitId;
  const scoped = (table: string) => {
    const query = client.from(table).select("*").eq("organization_id", workspace.organizationId);
    return effectiveUnit ? query.or(`unit_id.is.null,unit_id.eq.${effectiveUnit}`) : query;
  };
  let query = scoped(definition.table).eq("id", id);
  if (definition.soft) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Não foi possível carregar o registro autorizado.");
  if (!data) return null;
  const record = data as DetailRow;
  effectiveUnit = typeof record.unit_id === "string" ? record.unit_id : workspace.unitId;
  const related: Record<string, DetailRow[]> = {};
  const choices: Record<string, DetailRow[]> = {};
  async function rows(table: string, column?: string, value?: unknown): Promise<DetailRow[]> {
    let q = scoped(table).limit(100);
    if (["knowledge_items", "protocols", "executions", "indicators", "nonconformities", "action_plans", "actions", "meetings"].includes(table)) q = q.is("deleted_at", null);
    if (column) q = q.eq(column, value);
    const result = await q;
    if (result.error) throw new Error("Não foi possível carregar os vínculos deste registro.");
    return (result.data ?? []) as DetailRow[];
  }
  const tasks: PromiseLike<void>[] = [];
  const relation = (name: string, table: string, column: string, value: unknown = id) => tasks.push(rows(table, column, value).then(result => { related[name] = result; }));
  if (resource === "knowledge") relation("knowledge-versions", "knowledge_versions", "knowledge_item_id");
  if (resource === "protocols") relation("protocol-versions", "protocol_versions", "protocol_id");
  if (resource === "protocol-versions") {
    relation("forms", "form_versions", "protocol_version_id"); relation("executions", "executions", "protocol_version_id"); relation("bindings", "protocol_indicator_bindings", "protocol_version_id");
  }
  if (resource === "executions") {
    relation("forms", "form_versions", "protocol_version_id", record.protocol_version_id);
    relation("responses", "execution_responses", "execution_id");
    relation("bindings", "protocol_indicator_bindings", "protocol_version_id", record.protocol_version_id);
    relation("measurements", "measurements", "origin_id");
  }
  if (resource === "indicators") { relation("formulas", "indicator_formula_versions", "indicator_id"); relation("targets", "targets", "indicator_id"); relation("measurements", "measurements", "indicator_id"); }
  if (resource === "measurements") { relation("analyses", "critical_analyses", "measurement_id"); relation("nonconformities", "nonconformities", "origin_id"); }
  if (resource === "nonconformities") relation("action-plans", "action_plans", "origin_id");
  if (resource === "action-plans") { relation("actions", "actions", "action_plan_id"); relation("effectiveness", "effectiveness_checks", "action_plan_id"); }
  if (resource === "actions") relation("comments", "action_comments", "action_id");
  if (resource === "meetings") { relation("agenda", "meeting_agenda_items", "meeting_id"); relation("participants", "meeting_participants", "meeting_id"); relation("referrals", "referrals", "meeting_id"); }
  relation("evidence", "evidence_links", "entity_id");
  for (const [name, table] of Object.entries({ indicators: "indicators", formulas: "indicator_formula_versions", knowledge: "knowledge_versions" })) {
    if (["protocol-versions", "executions", "protocols"].includes(resource)) tasks.push(rows(table).then(result => { choices[name] = result; }));
  }
  tasks.push(client.rpc("read_workspace_people", { p_organization_id: workspace.organizationId, p_unit_id: effectiveUnit }).then(result => {
    if (result.error) throw new Error("Não foi possível consultar os responsáveis autorizados.");
    choices.people = (result.data ?? []) as DetailRow[];
  }));
  await Promise.all(tasks);
  // Parent names are read with the same organization/UBS filters and RLS as the detail.
  // Never fetch an unrestricted parent merely to improve a label.
  const versions = [...(choices.knowledge ?? []), ...(related['knowledge-versions'] ?? [])];
  const parentIds = [...new Set(versions.map(row => row.knowledge_item_id).filter((id): id is string => typeof id === 'string'))];
  if (parentIds.length) {
    const result = await scoped('knowledge_items').select('id,title').in('id', parentIds).is('deleted_at', null);
    if (result.error) throw new Error('Não foi possível identificar as referências autorizadas.');
    for (const version of versions) {
      const parent = result.data?.find(item => item.id === version.knowledge_item_id);
      if (parent) version.reference_title = parent.title;
    }
  }
  const attachmentIds = (related.evidence ?? []).map(row => String(row.attachment_id));
  if (attachmentIds.length) {
    const result = await scoped("attachments").in("id", attachmentIds);
    if (result.error) throw new Error("Não foi possível consultar as evidências autorizadas.");
    related.attachments = (result.data ?? []) as DetailRow[];
  }
  return { resource, module: definition.module, record, related, choices };
}
