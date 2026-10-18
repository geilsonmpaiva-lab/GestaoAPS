import 'server-only';
import { z } from 'zod';
import { createSupabaseServerClient } from './supabase';
import type { WorkspaceContext } from './workspace';
import { syntheticOrganization, mapDefinition, type EsfMap } from '@/lib/esf/maps';
import type { EsfTeam } from '@/lib/esf/production';

export function syntheticMapsEnabled(workspace: WorkspaceContext) {
  return process.env.SGC_ENVIRONMENT === 'staging' && process.env.VERCEL_ENV !== 'production' && workspace.organizationId === syntheticOrganization && !!workspace.unitId;
}
export async function esfMapRpc(workspace: WorkspaceContext, request: Record<string, unknown>) {
  if (!syntheticMapsEnabled(workspace) || !mapDefinition(String(request.templateId))) throw new Error('Mapas disponíveis apenas na homologação sintética autorizada.');
  const client = await createSupabaseServerClient();
  return client.rpc('staging_esf_maps_v1', { p_request: { ...request, organizationId: workspace.organizationId, unitId: workspace.unitId } });
}
export type MapListData = { teams: EsfTeam[]; teamId: string; maps: EsfMap[]; current: EsfMap | null; canWrite: boolean };
export async function loadEsfMaps(workspace: WorkspaceContext, form: string, team?: string, id?: string): Promise<MapListData> {
  if (team && !z.uuid().safeParse(team).success || id && !z.uuid().safeParse(id).success) throw new Error('Identificador inválido.');
  const teamsResult = await esfMapRpc(workspace, { action: 'teams', templateId: form });
  if (teamsResult.error) throw new Error('Não foi possível consultar equipes autorizadas.');
  const teams = (teamsResult.data ?? []) as EsfTeam[];
  const teamId = team ?? teams[0]?.id ?? '';
  if (!teamId) return { teams, teamId, maps: [], current: null, canWrite: false };
  if (!teams.some(t => t.id === teamId)) throw new Error('Equipe não autorizada.');
  const list = await esfMapRpc(workspace, { action: 'list', templateId: form, teamId });
  if (list.error) throw new Error('Não foi possível consultar mapas autorizados.');
  let current: EsfMap | null = null;
  if (id) {
    const result = await esfMapRpc(workspace, { action: 'read', templateId: form, teamId, entityId: id });
    if (result.error) throw new Error('Mapa não encontrado ou não autorizado.');
    current = result.data as EsfMap;
  }
  return { teams, teamId, maps: list.data.maps, canWrite: list.data.canWrite, current };
}
