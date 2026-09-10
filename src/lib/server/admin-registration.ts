import type { AdminCatalog } from "@/lib/domain/admin-registration";
import { createSupabaseServerClient, isDemoMode } from "./supabase";
import type { WorkspaceContext } from "./workspace";

export async function loadAdminCatalog(workspace: WorkspaceContext): Promise<{ catalog?: AdminCatalog; error?: string }> {
  if (!workspace.enabledModules.includes("administracao")) return { error: "Você não tem acesso aos cadastros administrativos." };
  if (isDemoMode()) return { catalog: {
    demo: true, canCreateUnits: true,
    grants: [{ unitId: null, role: "ADMIN_SISTEMA", domains: ["*"], operations: ["visualizar", "criar"] }],
    units: [{ id: workspace.unitId!, name: workspace.unitName, cnes: "0000000", status: "ACTIVE" }],
    users: [{ id: workspace.userId, name: workspace.userName, email: "ana.lima@demo.sgc.local", status: "ACTIVE", unitId: workspace.unitId, role: "GERENTE_UBS" }],
  } };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("read_admin_catalog", { p_organization_id: workspace.organizationId });
  if (error) return { error: error.code === "42501" ? "Seu perfil não permite consultar os cadastros administrativos." : "Não foi possível carregar os cadastros. Verifique a configuração do banco e tente novamente." };
  return { catalog: data as AdminCatalog };
}
