import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), enabled: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/server/supabase', () => ({ requireActor: mocks.actor }));
vi.mock('@/lib/server/workspace', () => ({ loadWorkspaceContext: mocks.workspace }));
vi.mock('@/lib/server/epidemiology-longitudinal', () => ({ longitudinalEnabled: mocks.enabled, longitudinalRpc: mocks.rpc }));
import { GET, POST } from './route';
const body = () => ({ action: 'save', area: 'hanseniase', month: '2028-01', teamId: randomUUID(), caseId: randomUUID(), entityId: randomUUID(), expectedVersion: 0, operationId: randomUUID(), deviceId: randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true, payload: { name: '[SINTÉTICO] Pessoa' } });
const get = (query = 'area=hanseniase&month=2028-01') => new Request('https://sgc.test/api/v1/epidemiology/longitudinal?' + query);
const post = (input: unknown = body(), origin = 'https://sgc.test') => new Request('https://sgc.test/api/v1/epidemiology/longitudinal', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.workspace.mockResolvedValue({ organizationId: 'org', unitId: 'unit' }); mocks.enabled.mockReturnValue(true); mocks.rpc.mockResolvedValue({ data: { cases: [] }, error: null }); });
it('requires authentication and the synthetic Preview rollout gate', async () => {
  mocks.actor.mockResolvedValue(null); expect((await GET(get())).status).toBe(401); expect((await POST(post())).status).toBe(401);
  mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.enabled.mockReturnValue(false); expect((await GET(get())).status).toBe(403); expect((await POST(post())).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('rejects CSRF and scope injection before RPC', async () => { expect((await POST(post(body(), 'https://other.test'))).status).toBe(403); expect((await POST(post({ ...body(), organizationId: randomUUID() }))).status).toBe(422); expect(mocks.rpc).not.toHaveBeenCalled(); });
it('rejects nominal municipal reports and invalid filters', async () => {
  expect((await GET(get('area=hanseniase&month=2028-01&report=1&scope=municipal&nominal=true'))).status).toBe(422);
  expect((await GET(get('area=hanseniase&month=2028-01&report=2'))).status).toBe(422); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('uses authorized context and prevents caching', async () => { const response = await GET(get()); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store'); expect(mocks.rpc).toHaveBeenCalledWith({ organizationId: 'org', unitId: 'unit' }, expect.objectContaining({ action: 'load' })); });
it('preserves conflict/denial statuses and rejects malformed payloads', async () => {
  expect((await POST(post({ ...body(), payload: { name: 'Real' } }))).status).toBe(422);
  for (const [code, status] of [['42501', 403], ['PT409', 409], ['22023', 422]] as const) { mocks.rpc.mockResolvedValue({ error: { code } }); expect((await POST(post())).status).toBe(status); }
});
