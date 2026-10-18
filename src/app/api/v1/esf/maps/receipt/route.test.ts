import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), enabled: vi.fn(), rpc: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/server/supabase', () => ({ requireActor: mocks.actor, createSupabaseServerClient: async () => ({ storage: { from: () => ({ upload: mocks.upload }) } }) }));
vi.mock('@/lib/server/workspace', () => ({ loadWorkspaceContext: mocks.workspace }));
vi.mock('@/lib/server/esf-maps', () => ({ syntheticMapsEnabled: mocks.enabled, esfMapRpc: mocks.rpc }));
import { POST, GET } from './route';
const input = () => {
  const body = new FormData(); for (const key of ['teamId', 'entityId', 'fileId']) body.set(key, randomUUID()); body.set('expectedVersion', '1'); body.set('synthetic', 'true');
  body.set('file', new File(['%PDF-1.4\n[SINTÉTICO] comprovante fictício'], 'sintetico.pdf', { type: 'application/pdf' })); return body;
};
const request = (body = input(), origin = 'https://sgc.test') => new Request('https://sgc.test/api/v1/esf/maps/receipt', { method: 'POST', headers: { origin }, body });
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.workspace.mockResolvedValue({ organizationId: 'synthetic', unitId: 'A' }); mocks.enabled.mockReturnValue(true); mocks.upload.mockResolvedValue({ data: {}, error: null }); mocks.rpc.mockImplementation(async (_workspace, req) => ({ data: req.action === 'read' ? { version: 1, status: 'OPEN' } : { id: req.fileId, sha256: req.sha256, byte_size: req.byteSize }, error: null })); });
it('requires authentication and synthetic staging for receipt endpoints', async () => { mocks.actor.mockResolvedValue(null); expect((await POST(request())).status).toBe(401); expect((await GET(new Request('https://sgc.test/api'))).status).toBe(401); mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.enabled.mockReturnValue(false); expect((await POST(request())).status).toBe(403); expect(mocks.upload).not.toHaveBeenCalled(); });
it('requires a same-origin browser upload', async () => { expect((await POST(request(input(), 'https://foreign.test'))).status).toBe(403); expect(mocks.upload).not.toHaveBeenCalled(); });
it('rejects mismatched MIME/signature and oversized files', async () => { const body = input(); body.set('file', new File(['not a PDF'], 'file.pdf', { type: 'application/pdf' })); expect((await POST(request(body))).status).toBe(422); body.set('file', new File([new Uint8Array(2097153)], 'file.pdf', { type: 'application/pdf' })); expect((await POST(request(body))).status).toBe(422); expect(mocks.upload).not.toHaveBeenCalled(); });
it('checks scope/version before uploading and hashes bytes without leaking original filename', async () => {
  const body = input(); const response = await POST(request(body)); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
  expect(mocks.upload).toHaveBeenCalledWith(`synthetic/A/${body.get('entityId')}/${body.get('fileId')}`, expect.any(Buffer), { contentType: 'application/pdf', upsert: false });
  expect(mocks.rpc).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ action: 'file-register', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
});
it('blocks closed or stale maps without writing storage', async () => { mocks.rpc.mockResolvedValue({ data: { version: 2, status: 'CLOSED' }, error: null }); expect((await POST(request())).status).toBe(409); expect(mocks.upload).not.toHaveBeenCalled(); });
