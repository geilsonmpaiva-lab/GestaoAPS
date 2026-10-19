import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), demo: vi.fn() }));
vi.mock('./supabase', () => ({ isDemoMode: mocks.demo, createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
import { loadEsfProduction, productionFiltersSchema, productionViewSchema } from './esf';
import type { WorkspaceContext } from './workspace';

const org = '00000000-0000-4000-8000-000000000010', unit = '00000000-0000-4000-8000-000000000011', team = '00000000-0000-4000-8000-000000000012';
const workspace = { organizationId: org, unitId: unit, enabledModules: ['formularios-esf'], uxV3: true } as WorkspaceContext;
const filters = productionFiltersSchema.parse({ month: '2026-10', team });
const flag = (key: string, enabled: boolean, unitId: string | null = null, organizationId = org) => ({ key, enabled, unit_id: unitId, organization_id: organizationId });
function setup(flags = [flag('esf.producao', true)], productionError: { code: string } | null = null) {
  mocks.rpc.mockImplementation(async (name: string) => name === 'read_workspace_metadata' ? { data: { flags }, error: null } : name === 'read_esf_teams' ? { data: [{ id: team, name: 'Equipe sintética', status: 'ACTIVE' }], error: null } : { data: { records: [], canCreate: false, canEdit: false }, error: productionError });
}
describe('disponibilidade da produção V3', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.demo.mockReturnValue(false); setup(); });
  it('separa as views validadas dos filtros da consulta', () => {
    expect(productionViewSchema.parse(undefined)).toBe('records');
    for (const view of ['new', 'records', 'monthly', 'annual']) expect(productionViewSchema.safeParse(view).success).toBe(true);
    expect(productionViewSchema.safeParse('arbitrary').success).toBe(false);
    expect(productionViewSchema.safeParse(['records', 'new']).success).toBe(false);
  });
  it('explica módulo ausente sem consultar registros nem conceder acesso', async () => {
    setup([]);
    await expect(loadEsfProduction(workspace, filters)).rejects.toMatchObject({ reason: 'disabled' });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['read_workspace_metadata']);
  });
  it('respeita a desabilitação específica da UBS sobre habilitação municipal', async () => {
    setup([flag('esf.producao', true), flag('esf.producao', false, unit)]);
    await expect(loadEsfProduction(workspace, filters)).rejects.toMatchObject({ reason: 'disabled' });
  });
  it('não aproveita habilitações de outra organização ou UBS', async () => {
    setup([flag('esf.producao', true, null, 'outra-organizacao'), flag('esf.producao', true, 'outra-ubs')]);
    await expect(loadEsfProduction(workspace, filters)).rejects.toMatchObject({ reason: 'disabled' });
  });
  it('distingue falha de consulta de um módulo desabilitado', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '08006' } });
    await expect(loadEsfProduction(workspace, filters)).rejects.toMatchObject({ reason: 'unavailable' });
  });
  it('preserva a recusa de permissão mesmo quando o módulo está ativo', async () => {
    setup([flag('esf.producao', true)], { code: '42501' });
    await expect(loadEsfProduction(workspace, filters)).rejects.toMatchObject({ reason: 'access' });
  });
  it('informa catálogo pendente sem transformar flags em permissão de escrita', async () => {
    const data = await loadEsfProduction(workspace, filters);
    expect(data).toMatchObject({ catalogApproved: false, canCreate: false, canEdit: false });
    expect(mocks.rpc).toHaveBeenCalledWith('read_esf_production', expect.objectContaining({ p_org: org, p_unit: unit, p_team: team }));
  });
  it('mantém a consulta V2 sem introduzir dependência de metadados', async () => {
    await loadEsfProduction({ ...workspace, uxV3: false }, filters);
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(['read_esf_teams', 'read_esf_production']);
  });
  it('ignora equipes inativas e usa a primeira que autoriza leitura no contexto implícito', async () => {
    const other = '00000000-0000-4000-8000-000000000013';
    mocks.rpc.mockImplementation(async (name: string, args?: { p_team?: string }) => name === 'read_workspace_metadata' ? { data: { flags: [flag('esf.producao', true)] }, error: null } : name === 'read_esf_teams' ? { data: [{ id: 'inactive', status: 'INACTIVE' }, { id: team, status: 'ACTIVE' }, { id: other, status: 'ACTIVE' }], error: null } : args?.p_team === team ? { data: null, error: { code: '42501' } } : { data: { records: [], canCreate: false }, error: null });
    const result = await loadEsfProduction(workspace, productionFiltersSchema.parse({ month: '2026-10' }));
    expect(result.teams.map(item => item.id)).toEqual([other, team]);
    expect(mocks.rpc.mock.calls.filter(call => call[0] === 'read_esf_production').map(call => call[1].p_team)).toEqual([team, other]);
  });
  it('não troca a equipe explicitamente selecionada quando a leitura é negada', async () => {
    setup([flag('esf.producao', true)], { code: '42501' });
    await expect(loadEsfProduction(workspace, filters)).rejects.toMatchObject({ reason: 'access' });
    expect(mocks.rpc.mock.calls.filter(call => call[0] === 'read_esf_production')).toHaveLength(1);
  });
  it('não interpreta erro de consulta como ausência de dados ou falta de permissão', async () => {
    setup([flag('esf.producao', true)], { code: '08006' });
    await expect(loadEsfProduction(workspace, productionFiltersSchema.parse({ month: '2026-10' }))).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
