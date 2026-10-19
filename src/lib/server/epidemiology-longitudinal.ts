import 'server-only';
import { epidemiologyEnabled } from './epidemiology';
import { createSupabaseServerClient } from './supabase';
import type { WorkspaceContext } from './workspace';
export function longitudinalEnabled(workspace: WorkspaceContext) {
  return epidemiologyEnabled(workspace) && workspace.uxV3 === true;
}
export async function longitudinalRpc(workspace: WorkspaceContext, request: Record<string, unknown>) {
  if (!longitudinalEnabled(workspace)) throw new Error('Entrada longitudinal restrita à homologação sintética.');
  const client = await createSupabaseServerClient();
  return client.rpc('staging_epidemiology_longitudinal_v1', { p_request: { ...request, organizationId: workspace.organizationId, unitId: workspace.unitId } });
}
export async function longitudinalMonthlyRpc(workspace: WorkspaceContext, request: Record<string, unknown>) {
  if (workspace.uxV3 && ['hanseniase', 'tuberculose'].includes(String(request.area))) return longitudinalRpc(workspace, { ...request, action: 'summary', nominal: false });
  const { epidemiologyMonthlyRpc } = await import('./epidemiology');
  return epidemiologyMonthlyRpc(workspace, request);
}
