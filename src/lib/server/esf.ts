import { z } from 'zod';
import { createSupabaseServerClient, isDemoMode } from './supabase';
import type { WorkspaceContext } from './workspace';
import { monthSchema, localEsfDate, type EsfProductionData, type EsfTeam } from '@/lib/esf/production';

export function canViewEsf(workspace: WorkspaceContext) {
  return workspace.enabledModules.includes('formularios-esf') || workspace.enabledModules.includes('administracao');
}
export const productionFiltersSchema = z.object({
  month: monthSchema.default(() => localEsfDate().slice(0, 7)), team: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1), procedure: z.string().max(80).default(''),
});
export async function loadEsfTeams(workspace: WorkspaceContext): Promise<EsfTeam[]> {
  if (!workspace.unitId || !canViewEsf(workspace)) return [];
  if (isDemoMode()) return [{ id: '00000000-0000-4000-8000-000000000101', name: 'Equipe Aurora — demonstração', code: 'DEMO-01', area: 'Área sintética', status: 'ACTIVE' }];
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('read_esf_teams', { p_org: workspace.organizationId, p_unit: workspace.unitId });
  if (error) throw new Error('Não foi possível carregar as equipes. Verifique a migration ESF em homologação.');
  return data as EsfTeam[];
}
export async function loadEsfProduction(workspace: WorkspaceContext, filters: z.infer<typeof productionFiltersSchema>): Promise<EsfProductionData> {
  if (!workspace.unitId || !canViewEsf(workspace)) throw new Error('Selecione uma UBS autorizada.');
  const teams = await loadEsfTeams(workspace);
  const team = filters.team ?? teams[0]?.id;
  if (team && !teams.some(t => t.id === team)) throw new Error('Equipe não autorizada neste contexto.');
  const empty: EsfProductionData = { demo: isDemoMode(), teams, records: [], total: 0, summary: [], annual: [], monthly: null, canCreate: false, canEdit: false, canReview: false, canClose: false, canReopen: false, canExport: false };
  if (!team) return empty;
  if (isDemoMode()) return { ...empty, canCreate: true, canEdit: true, canReview: true, canClose: true, canReopen: true, canExport: true };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('read_esf_production', { p_org: workspace.organizationId, p_unit: workspace.unitId, p_team: team, p_competency: filters.month, p_page: filters.page, p_search: filters.procedure });
  if (error) throw new Error(error.code === '42501' ? 'Produção não habilitada ou equipe sem permissão de consulta.' : 'Não foi possível consultar a produção. Tente novamente.');
  return data as EsfProductionData;
}
