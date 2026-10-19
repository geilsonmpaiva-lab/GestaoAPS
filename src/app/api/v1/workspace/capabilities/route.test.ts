import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/server/supabase', () => ({ requireActor: mocks.actor }));
vi.mock('@/lib/server/workspace', () => ({ loadWorkspaceContext: mocks.workspace }));
vi.mock('@/lib/server/aps-workspace', async importOriginal => ({ ...await importOriginal<object>(), loadApsWorkspace: mocks.load }));
vi.mock('server-only', () => ({}));
import { GET } from './route';
describe('effective capability projection', () => {
  beforeEach(() => { mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.workspace.mockResolvedValue({ uxV3: true, organizationId: 'authorized', unitId: 'a' }); mocks.load.mockResolvedValue({ month: '2026-10', errors: [], areas: [{ id: 'area', title: 'Área', teams: [], municipal: false, report: { records: [{ name: 'NOME RESTRITO' }] } }], production: { enabled: true, reason: '', data: { records: [{ name: 'RESTRITO' }], teams: [], canCreate: false } } }); });
  it('reauthenticates and never projects records or snapshots', async () => {
    const response = await GET(new Request('http://localhost/api/v1/workspace/capabilities'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.text();
    expect(body).not.toContain('RESTRITO'); expect(body).not.toContain('records'); expect(body).not.toContain('report');
  });
  it('rejects anonymous access, disabled rollout and forged tenant inputs before reading', async () => {
    mocks.actor.mockResolvedValue(null); expect((await GET(new Request('http://localhost/api'))).status).toBe(401);
    mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.workspace.mockResolvedValue({ uxV3: false });
    expect((await GET(new Request('http://localhost/api'))).status).toBe(403);
    mocks.workspace.mockResolvedValue({ uxV3: true });
    expect((await GET(new Request('http://localhost/api?organizationId=foreign'))).status).toBe(422);
  });
});
