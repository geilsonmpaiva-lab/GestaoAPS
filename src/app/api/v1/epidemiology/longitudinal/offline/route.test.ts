import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), workspace: vi.fn(), enabled: vi.fn(), rpc: vi.fn(), upload: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/server/supabase', () => ({ requireActor: mocks.actor, createSupabaseServerClient: async () => ({ rpc: mocks.rpc, storage: { from: () => ({ createSignedUploadUrl: mocks.upload, download: mocks.download }) } }) }));
vi.mock('@/lib/server/workspace', () => ({ loadWorkspaceContext: mocks.workspace }));
vi.mock('@/lib/server/epidemiology-longitudinal', () => ({ longitudinalEnabled: mocks.enabled }));
import { GET, POST } from './route';
import { GET as DOWNLOAD } from './attachment/route';
const scope = { deviceId: randomUUID(), area: 'hanseniase', month: '2028-10', team: randomUUID() };
const command = { ...scope, team: undefined, action: 'save', teamId: scope.team, caseId: randomUUID(), entityId: randomUUID(), expectedVersion: 1, operationId: randomUUID(), localTimestamp: new Date().toISOString(), synthetic: true, payload: { name: '[SINTÉTICO] Caso' } };
const post = (body: unknown, origin = 'https://sgc.test') => new Request('https://sgc.test/api/v1/epidemiology/longitudinal/offline', { method: 'POST', headers: { origin, 'x-device-id': scope.deviceId }, body: JSON.stringify(body) });
const get = () => new Request('https://sgc.test/api/v1/epidemiology/longitudinal/offline?' + new URLSearchParams(scope));
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.workspace.mockResolvedValue({ organizationId: 'org', unitId: 'unit' }); mocks.enabled.mockReturnValue(true); mocks.rpc.mockResolvedValue({ data: { status: 'confirmed' }, error: null }); });
it('requires authenticated staging and blocks writes from another origin', async () => {
  mocks.actor.mockResolvedValue(null); expect((await GET(get())).status).toBe(401); expect((await POST(post({}))).status).toBe(401);
  mocks.actor.mockResolvedValue({ id: 'actor' }); mocks.enabled.mockReturnValue(false); expect((await GET(get())).status).toBe(403);
  mocks.enabled.mockReturnValue(true); expect((await POST(post({}, 'https://other.test'))).status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('binds prepared scope and rejects context/observed-hash injection', async () => {
  const body = { kind: 'command', ...scope, command, baseline: null };
  expect((await POST(post({ ...body, organizationId: randomUUID() }))).status).toBe(422);
  expect((await POST(post({ ...body, month: '2028-11' }))).status).toBe(422);
  expect((await POST(post({ kind: 'attachment-finalize', ...scope, attachmentId: randomUUID(), observedSha256: 'fake' }))).status).toBe(422); expect(mocks.rpc).not.toHaveBeenCalled();
});
it('projects verified server scope and prevents caching of nominal preparation', async () => { const r = await GET(get()); expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toContain('no-store'); expect(mocks.rpc).toHaveBeenCalledWith('staging_epi_long_offline_v1', { p_request: { kind: 'prepare', ...scope, organizationId: 'org', unitId: 'unit' } }); });
it('returns durable conflicts as 409 instead of claiming confirmation', async () => { mocks.rpc.mockResolvedValue({ data: { status: 'conflict', server: { version: 2 } }, error: null }); const r = await POST(post({ kind: 'command', ...scope, command, baseline: null })); expect(r.status).toBe(409); expect(r.headers.get('cache-control')).toContain('no-store'); });
it('does not issue another upload token for an available attachment', async () => { mocks.rpc.mockResolvedValue({ data: { status: 'AVAILABLE' }, error: null }); const r = await POST(post({ kind: 'attachment-reserve', ...scope, attachmentId: randomUUID(), visitId: randomUUID(), fileName: 'sintetico.pdf', contentType: 'application/pdf', byteSize: 10, sha256: 'a'.repeat(64) })); expect(r.status).toBe(200); expect(mocks.upload).not.toHaveBeenCalled(); });
it('hashes actual private bytes before confirming attachment integrity', async () => {
  const bytes = Buffer.from('%PDF-1.4\nSINTETICO'), sha256 = createHash('sha256').update(bytes).digest('hex');
  mocks.rpc.mockResolvedValueOnce({ data: { object_path: 'opaque', byte_size: bytes.length, sha256, content_type: 'application/pdf' }, error: null }).mockResolvedValueOnce({ data: { status: 'AVAILABLE' }, error: null }); mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  const r = await POST(post({ kind: 'attachment-finalize', ...scope, attachmentId: randomUUID() })); expect(r.status).toBe(200); expect(mocks.rpc.mock.calls[1][1].p_request).toMatchObject({ observedSize: bytes.length, observedSha256: sha256 });
});
it('never finalizes mismatched bytes and verifies integrity again on download', async () => {
  const id = randomUUID(), bytes = Buffer.from('%PDF-1.4\nSINTETICO'); mocks.rpc.mockResolvedValue({ data: { status: 'AVAILABLE', object_path: 'opaque', byte_size: bytes.length, sha256: 'a'.repeat(64), content_type: 'application/pdf' }, error: null }); mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  expect((await POST(post({ kind: 'attachment-finalize', ...scope, attachmentId: id }))).status).toBe(422); expect(mocks.rpc).toHaveBeenCalledTimes(1);
  const url = new Request('https://sgc.test/api/v1/epidemiology/longitudinal/offline/attachment?' + new URLSearchParams({ ...scope, attachmentId: id })); expect((await DOWNLOAD(url)).status).toBe(422);
});
