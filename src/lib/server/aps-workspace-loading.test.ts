import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), teams: vi.fn(), epi: vi.fn(), monthly: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./supabase', () => ({ isDemoMode: () => false, createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('./esf', () => ({ loadEsfTeams: mocks.teams, loadEsfProduction: vi.fn() }));
vi.mock('./epidemiology', () => ({ epidemiologyRpc: mocks.epi, epidemiologyMonthlyRpc: mocks.monthly }));
import { apsFilters, loadApsWorkspace } from './aps-workspace';
import type { WorkspaceContext } from './workspace';
const workspace: WorkspaceContext = { uxV2: true, uxV3: true, organizationId: 'org', organizationName: 'Org', unitId: 'a', unitName: 'A', userId: 'actor', userName: 'Actor', userInitials: 'AC', environmentLabel: 'Test', enabledModules: ['formularios-esf'], permissions: [], scopes: [] };
const team = (id: string, status = 'ACTIVE') => ({ id, name: `Equipe ${id}`, status, code: id, area: '' });
const filters = apsFilters.parse({ month: '2026-10' });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.teams.mockResolvedValue([team('inactive', 'INACTIVE'), team('denied'), team('allowed')]);
  mocks.rpc.mockImplementation(async (name: string, input: { p_team?: string }) => {
    if (name === 'read_workspace_metadata') return { data: { flags: [{ key: 'esf.producao', organization_id: 'org', unit_id: null, enabled: true }] }, error: null };
    if (input.p_team === 'denied') return { data: null, error: { code: '42501' } };
    return { data: { teams: [team('allowed')], records: [], total: 51, monthly: null }, error: null };
  });
});
describe('APS source completeness and authorization', () => {
  it('skips inactive or inaccessible directory entries and reads the authorized team', async () => {
    const result = await loadApsWorkspace(workspace, filters);
    expect(result.production.teamId).toBe('allowed');
    expect(result.production.data?.total).toBe(51);
    expect(result.production.deliveries).toHaveLength(1);
    expect(mocks.rpc.mock.calls.filter(c => c[1]?.p_team === 'inactive')).toHaveLength(0);
    expect(result.production.data?.teams.map(t => t.id)).toEqual(['allowed']);
  });
  it('shows incomplete coverage when a source fails instead of silently omitting a team', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'read_workspace_metadata' ? { data: { flags: [{ key: 'esf.producao', organization_id: 'org', unit_id: null, enabled: true }] } } : { error: { code: 'XX000' } });
    const result = await loadApsWorkspace(workspace, filters);
    expect(result.errors).toHaveLength(2);
    expect(result.production.data).toBeNull();
  });
  it('discovers the union of municipal areas rather than relying on the first unit', async () => {
    mocks.epi.mockImplementation(async (scope: WorkspaceContext) => ({ data: scope.unitId === 'b' ? ['dengue'] : [], error: null }));
    mocks.monthly.mockResolvedValue({ data: { teams: [] }, error: null });
    const result = await loadApsWorkspace({ ...workspace, unitId: null, enabledModules: ['vigilancia'], scopes: [{ organizationId: 'org', organizationName: 'Org', unitId: 'a', unitName: 'A' }, { organizationId: 'org', organizationName: 'Org', unitId: 'b', unitName: 'B' }] }, filters);
    expect(result.availableAreas.map(a => a.id)).toEqual(['dengue']);
    expect(mocks.monthly).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'b' }), expect.objectContaining({ scope: 'municipal', area: 'dengue' }));
  });
  it('does not turn organization membership into municipal access when the RPC rejects it', async () => {
    mocks.epi.mockResolvedValue({ data: ['dengue'], error: null }); mocks.monthly.mockResolvedValue({ error: { code: '42501' } });
    const result = await loadApsWorkspace({ ...workspace, unitId: null, enabledModules: ['vigilancia'], scopes: [{ organizationId: 'org', organizationName: 'Org', unitId: 'a', unitName: 'A' }] }, filters);
    expect(result.areas[0].report).toBeNull(); expect(result.areas[0].municipal).toBe(false); expect(result.areas[0].error).toContain('não autorizada');
  });
});
