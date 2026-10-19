import { z } from 'zod';
import { createSupabaseServerClient, isDemoMode } from './supabase';
import type { WorkspaceContext } from './workspace';
import { monthSchema, localEsfDate, type EsfProductionData, type EsfTeam } from '@/lib/esf/production';

export class ProductionUnavailableError extends Error {
  constructor(public readonly reason: 'scope' | 'disabled' | 'access' | 'unavailable', message: string) {
    super(message); this.name = 'ProductionUnavailableError';
  }
}
export type EsfProductionViewData = EsfProductionData & { catalogApproved?: boolean };
export const productionViewSchema = z.enum(['new', 'records', 'monthly', 'annual']).default('records');
const featureFlagsSchema = z.object({ flags: z.array(z.object({ key: z.string(), enabled: z.boolean(), unit_id: z.string().nullable(), organization_id: z.string() })) });

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
  if (error) throw new ProductionUnavailableError(error.code === '42501' ? 'access' : 'unavailable', error.code === '42501' ? 'Seu acesso não permite consultar as equipes. Solicite o vínculo à gestão responsável.' : 'Não foi possível carregar as equipes. Tente novamente.');
  return data as EsfTeam[];
}
export async function loadEsfProduction(workspace: WorkspaceContext, filters: z.infer<typeof productionFiltersSchema>): Promise<EsfProductionViewData> {
  if (!workspace.unitId) throw new ProductionUnavailableError('scope', 'Selecione uma UBS autorizada no cabeçalho para consultar a produção das equipes.');
  let catalogApproved: boolean | undefined;
  if (workspace.uxV3 && !isDemoMode()) {
    const client = await createSupabaseServerClient();
    const metadata = await client.rpc('read_workspace_metadata');
    const parsed = featureFlagsSchema.safeParse(metadata.data);
    if (metadata.error || !parsed.success) throw new ProductionUnavailableError('unavailable', 'Não foi possível conferir a disponibilidade da produção. Tente novamente.');
    const flags = parsed.data.flags.filter(f => f.organization_id === workspace.organizationId && (f.unit_id === null || f.unit_id === workspace.unitId));
    const enabled = (key: string) => (flags.find(f => f.key === key && f.unit_id === workspace.unitId) ?? flags.find(f => f.key === key && f.unit_id === null))?.enabled === true;
    if (!enabled('esf.producao')) throw new ProductionUnavailableError('disabled', 'A produção diária ainda não foi habilitada para esta UBS. A gestão responsável precisa liberar o módulo antes dos lançamentos.');
    catalogApproved = enabled('esf.producao.catalog_approved');
  }
  if (!canViewEsf(workspace)) throw new ProductionUnavailableError('access', 'Seu acesso não permite consultar a produção desta UBS. Solicite à gestão responsável o vínculo com a equipe e a permissão de consulta.');
  const teams = (await loadEsfTeams(workspace)).filter(team => team.status === 'ACTIVE');
  const team = filters.team ?? teams[0]?.id;
  if (team && !teams.some(t => t.id === team)) throw new ProductionUnavailableError('access', 'A equipe selecionada não está disponível no seu acesso. Selecione outra equipe ou solicite o vínculo à gestão responsável.');
  const empty: EsfProductionViewData = { demo: isDemoMode(), teams, records: [], total: 0, summary: [], annual: [], monthly: null, canCreate: false, canEdit: false, canReview: false, canClose: false, canReopen: false, canExport: false, ...(catalogApproved === undefined ? {} : { catalogApproved }) };
  if (!team) return empty;
  if (isDemoMode()) return { ...empty, canCreate: true, canEdit: true, canReview: true, canClose: true, canReopen: true, canExport: true };
  const client = await createSupabaseServerClient();
  const candidates = filters.team ? teams.filter(item => item.id === filters.team) : teams;
  for (const candidate of candidates) {
    const { data, error } = await client.rpc('read_esf_production', { p_org: workspace.organizationId, p_unit: workspace.unitId, p_team: candidate.id, p_competency: filters.month, p_page: filters.page, p_search: filters.procedure });
    if (error?.code === '42501' && !filters.team) continue;
    if (error || !data) throw new ProductionUnavailableError(error?.code === '42501' ? 'access' : 'unavailable', error?.code === '42501' ? 'Seu acesso não permite consultar a produção desta equipe. Solicite o vínculo e a permissão de consulta à gestão responsável.' : 'Não foi possível consultar a produção. Tente novamente.');
    return { ...data as EsfProductionData, teams: [candidate, ...teams.filter(item => item.id !== candidate.id)], ...(catalogApproved === undefined ? {} : { catalogApproved }) };
  }
  throw new ProductionUnavailableError('access', 'Nenhuma equipe ativa autorizou a consulta de produção neste contexto. Solicite o vínculo e a permissão de consulta à gestão responsável.');
}
