import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), catalog: vi.fn(), rpc: vi.fn(), demo: vi.fn(), resolve: vi.fn(), find: vi.fn(), page: vi.fn(), municipalities: vi.fn() }));
vi.mock('@/lib/server/supabase', () => ({ requireActor: mocks.actor, isDemoMode: mocks.demo, createSupabaseServerClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/server/workspace', () => ({ loadWorkspaceContext: mocks.workspace }));
vi.mock('@/lib/server/admin-registration', () => ({ loadAdminCatalog: mocks.catalog }));
vi.mock('@/lib/server/cnes', () => ({ CNES_SOURCE: 'https://apidadosabertos.saude.gov.br', CnesUnavailable: class extends Error {}, resolveCnesMunicipality: mocks.resolve, findActiveCnesUnits: mocks.find, fetchCnesPage: mocks.page, fetchCnesMunicipalities: mocks.municipalities }));
import { GET, POST } from './route';
const organizationId = '00000000-0000-4000-8000-000000000010';
const input = { organizationId, operationId: '00000000-0000-4000-8000-000000000099', uf: 'CE', municipality: '230020', type: '2', selection: ['0808792'] };
const units = [{ cnes: '0808792', name: 'UBS fonte', address: {} }];
const request = (body: unknown = input, origin = 'https://sgc.test') => new Request('https://sgc.test/api/v1/admin/cnes', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
describe('CNES import API', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.workspace.mockResolvedValue({ organizationId }); mocks.catalog.mockResolvedValue({ catalog: { canCreateUnits: true, units: [] } }); mocks.demo.mockReturnValue(false); mocks.rpc.mockResolvedValue({ data: null, error: null }); mocks.resolve.mockResolvedValue({ code: '230020', uf: 'CE', name: 'ACARAU' }); mocks.find.mockResolvedValue(units); });
  it('requires authentication before external access', async () => { mocks.actor.mockResolvedValue(null); expect((await POST(request())).status).toBe(401); expect(mocks.resolve).not.toHaveBeenCalled(); });
  it('requires organization-level permission before search', async () => { mocks.catalog.mockResolvedValue({ catalog: { canCreateUnits: false } }); expect((await GET(new Request('https://sgc.test/api/v1/admin/cnes?action=municipalities&uf=CE'))).status).toBe(403); expect(mocks.municipalities).not.toHaveBeenCalled(); });
  it('rejects foreign organization, cross-origin and invalid selection', async () => {
    expect((await POST(request({ ...input, organizationId: '00000000-0000-4000-8000-000000000020' }))).status).toBe(403);
    expect((await POST(request(input, 'https://other.test'))).status).toBe(403);
    expect((await POST(request({ ...input, selection: [] }))).status).toBe(422); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('returns original authorized retry before querying the provider', async () => { const result = { created: units, skipped: [] }; mocks.rpc.mockResolvedValue({ data: result, error: null }); expect(await (await POST(request())).json()).toEqual(result); expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.rpc).toHaveBeenCalledTimes(1); });
  it('revalidates public data before the transactional write', async () => { await POST(request()); expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'import_cnes_units', expect.objectContaining({ p_rows: null, p_operation_id: input.operationId })); expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'import_cnes_units', expect.objectContaining({ p_rows: units, p_selection: input.selection })); });
  it('does not write if source revalidation fails', async () => { mocks.find.mockRejectedValue(new Error('upstream details')); const response = await POST(request()); expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain('upstream details'); expect(mocks.rpc).toHaveBeenCalledTimes(1); });
  it('does not bypass a database denial on an idempotent retry', async () => { mocks.rpc.mockResolvedValue({ error: { code: '42501', message: 'Sem acesso' } }); expect((await POST(request())).status).toBe(403); expect(mocks.resolve).not.toHaveBeenCalled(); });
  it('marks demos and skips existing CNES without a database write', async () => { mocks.demo.mockReturnValue(true); mocks.catalog.mockResolvedValue({ catalog: { canCreateUnits: true, units: [{ id: 'existing', cnes: '0808792', name: 'Nome local preservado' }] } }); const body = await (await POST(request())).json(); expect(body).toEqual({ mode: 'demo', created: [], skipped: [{ id: 'existing', cnes: '0808792', name: 'Nome local preservado' }] }); expect(mocks.rpc).not.toHaveBeenCalled(); });
});
