import { specificAccessSchema, type AdminCatalog, type SpecificAccessResult } from "@/lib/domain/admin-registration";
import { createSupabaseServerClient, isDemoMode } from "./supabase";
import type { WorkspaceContext } from "./workspace";

export function accessLifecycleEnabled(workspace: WorkspaceContext) {
  return !!workspace.uxV3 && process.env.SGC_ENVIRONMENT === "staging" && process.env.VERCEL_ENV !== "production"
    && workspace.organizationId === "362db1a9-bfdd-4334-9436-46b1c0117eab";
}

export async function loadSpecificAdminAccess(workspace: WorkspaceContext, userId: string): Promise<SpecificAccessResult> {
  if (isDemoMode() || !accessLifecycleEnabled(workspace) || !workspace.enabledModules.includes("administracao")) {
    return { error: "A consulta das permissões específicas está disponível somente na homologação sintética autorizada.", status: 403 };
  }
  try {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.rpc("staging_read_aps_access_v1", { p_request: { organizationId: workspace.organizationId, userId } });
    if (error) return { error: error.code === "42501" ? "Você não tem autoridade para consultar os acessos desta pessoa neste recorte." : "Não foi possível consultar equipes e permissões específicas. Nenhuma permissão foi estimada pelo perfil.", status: error.code === "42501" ? 403 : 503 };
    const result = specificAccessSchema.safeParse(data);
    if (!result.success || result.data.userId !== userId) return { error: "A resposta de equipes e permissões não pôde ser confirmada. Tente consultar novamente.", status: 503 };
    return { access: result.data };
  } catch {
    return { error: "Falha de conexão ao consultar equipes e permissões. Tente novamente.", status: 503 };
  }
}

export async function loadAdminCatalog(workspace: WorkspaceContext): Promise<{ catalog?: AdminCatalog; error?: string }> {
  if (!workspace.enabledModules.includes("administracao")) return { error: "Você não tem acesso aos cadastros administrativos." };
  if (isDemoMode()) return { catalog: {
    demo: true, canCreateUnits: true, membershipDetails: "available",
    grants: [{ unitId: null, role: "ADMIN_SISTEMA", domains: ["*"], operations: ["visualizar", "criar"] }],
    units: [{ id: workspace.unitId!, name: workspace.unitName, cnes: "0000000", status: "ACTIVE" }],
    users: [{ id: workspace.userId, userId: workspace.userId, name: workspace.userName, email: "ana.lima@demo.sgc.local", status: "ACTIVE", unitId: workspace.unitId, role: "GERENTE_UBS", domains: ["protocolos", "esf.producao"], operations: ["visualizar", "criar", "executar"], startsAt: "2026-01-01T00:00:00Z", endsAt: null }],
  } };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("read_admin_catalog", { p_organization_id: workspace.organizationId });
  if (error) return { error: error.code === "42501" ? "Seu perfil não permite consultar os cadastros administrativos." : "Não foi possível carregar os cadastros. Verifique a configuração do banco e tente novamente." };
  const catalog = { ...(data as AdminCatalog), ...(workspace.uxV3 ? { accessLifecycleEnabled: accessLifecycleEnabled(workspace) } : {}) };
  if (!workspace.uxV3 || !catalog.users.length) return { catalog };
  // The catalog RPC determines which memberships this administrator may inspect.
  // Enrichment uses the caller's JWT/RLS and only those IDs, not a privileged client.
  const details = new Map<string, { user_id: string; unit_id: string | null; role: string; domains: string[]; operations: string[]; starts_at: string; ends_at: string | null }>();
  try {
    for (let start = 0; start < catalog.users.length; start += 100) {
      const ids = catalog.users.slice(start, start + 100).map(user => user.id);
      const result = await client.from("memberships")
        .select("id,user_id,unit_id,role,domains,operations,starts_at,ends_at")
        .eq("organization_id", workspace.organizationId).in("id", ids);
      if (result.error) return { catalog: { ...catalog, membershipDetails: "unavailable" } };
      for (const row of result.data ?? []) if (ids.includes(row.id)) details.set(row.id, row);
    }
  } catch {
    return { catalog: { ...catalog, membershipDetails: "unavailable" } };
  }
  let enriched = 0;
  const users = catalog.users.map(user => {
    const detail = details.get(user.id);
    if (!detail || detail.role !== user.role || detail.unit_id !== user.unitId) return user;
    enriched++;
    return { ...user, userId: detail.user_id, domains: detail.domains, operations: detail.operations, startsAt: detail.starts_at, endsAt: detail.ends_at };
  });
  return { catalog: { ...catalog, users, membershipDetails: enriched === users.length ? "available" : enriched ? "partial" : "unavailable" } };
}
