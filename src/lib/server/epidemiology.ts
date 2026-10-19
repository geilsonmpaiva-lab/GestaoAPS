import 'server-only';
import { epiOrganization } from '@/lib/epidemiology';
import { createSupabaseServerClient } from './supabase';
import type { WorkspaceContext } from './workspace';

export function epidemiologyStageEnabled(workspace: WorkspaceContext) {
  return process.env.SGC_ENVIRONMENT === 'staging' && process.env.VERCEL_ENV !== 'production' && workspace.organizationId === epiOrganization;
}
export function epidemiologyEnabled(workspace: WorkspaceContext) {
  return epidemiologyStageEnabled(workspace) && !!workspace.unitId;
}
export async function epidemiologyRpc(workspace: WorkspaceContext, request: Record<string, unknown>) {
  if (!epidemiologyEnabled(workspace)) throw new Error('Área restrita à homologação sintética.');
  const client = await createSupabaseServerClient();
  return client.rpc('staging_epidemiology_v1', { p_request: { ...request, organizationId: workspace.organizationId, unitId: workspace.unitId } });
}
