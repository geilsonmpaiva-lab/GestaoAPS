import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), rpc: vi.fn(), list: vi.fn(), enabled: vi.fn() }));
vi.mock('@/lib/server/supabase', () => ({ requireActor: mocks.actor }));
vi.mock('@/lib/server/workspace', () => ({ loadWorkspaceContext: mocks.workspace }));
vi.mock('@/lib/server/esf-maps', () => ({ esfMapRpc: mocks.rpc, loadEsfMaps: mocks.list, syntheticMapsEnabled: mocks.enabled }));
import { GET, POST } from './route';
const body = () => ({ operationId: randomUUID(), entityId: randomUUID(), expectedVersion: 0, deviceId: randomUUID(), localTimestamp: new Date().toISOString(), templateId: 'materiais', competency: '2028-01', teamId: randomUUID(), action: 'save', synthetic: true, payload: { headers: {}, sections: { records: [{ id: randomUUID(), values: { itemId: '[SINTÉTICO] Item', entry: 0 } }] } } });
const request = (data: unknown = body(), origin = 'https://sgc.test') => new Request('https://sgc.test/api/v1/esf/maps', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(data) });
describe('synthetic ESF maps API', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.workspace.mockResolvedValue({ organizationId: 'synthetic', unitId: 'A' }); mocks.enabled.mockReturnValue(true); mocks.rpc.mockResolvedValue({ data: { version: 1 }, error: null }); mocks.list.mockResolvedValue({ maps: [] }); });
  it('requires authentication for reads and writes', async () => { mocks.actor.mockResolvedValue(null); expect((await POST(request())).status).toBe(401); expect((await GET(new Request('https://sgc.test/api/v1/esf/maps'))).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it('rejects cross-origin writes', async () => { expect((await POST(request(body(), 'https://other.test'))).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it('blocks writes outside synthetic staging', async () => { mocks.enabled.mockReturnValue(false); expect((await POST(request())).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled(); });
  it('passes validated idempotent envelope and makes responses non-cacheable', async () => { const input = body(); const response = await POST(request(input)); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store'); expect(mocks.rpc).toHaveBeenCalledWith({ organizationId: 'synthetic', unitId: 'A' }, expect.objectContaining(input)); });
  it('does not accept organization override or forged calculated fields', async () => { expect((await POST(request({ ...body(), organizationId: randomUUID() }))).status).toBe(422); const data = body(); data.payload.sections.records[0].values = { itemId: 'Item', entry: 0, currentBalance: 999 } as never; expect((await POST(request(data))).status).toBe(422); });
  it('preserves database denials, conflicts and not found', async () => { for (const [code, status] of [['42501', 403], ['PT409', 409], ['P0002', 404]] as const) { mocks.rpc.mockResolvedValue({ error: { code } }); expect((await POST(request())).status).toBe(status); } });
});
