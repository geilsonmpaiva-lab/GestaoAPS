import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), upload: vi.fn() }));
vi.mock('./work', () => ({ verifyVault: mocks.verify, offlineFetch: (url: string, init?: RequestInit) => fetch(url, init) }));
vi.mock('@/lib/client/supabase', () => ({ createSupabaseBrowserClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) } }) }));
import { addLongFile, initialLongDraft, loadLongOffline, longPrefix, queueLongJob, resolveLongJob, synchronizeLongOffline, type LongSnapshot, type LongJob } from './longitudinal';
import { longOfflineRequest, validLongFile } from './longitudinal-contracts';
import type { WorkspaceContext } from '@/lib/server/workspace';
import type { OfflineVault } from './vault';
const w = { userId: randomUUID(), organizationId: '362db1a9-bfdd-4334-9436-46b1c0117eab', unitId: randomUUID(), uxV3: true } as WorkspaceContext;
function fixture() {
  const team = randomUUID(), caseId = randomUUID(), entityId = randomUUID();
  const s = { id: longPrefix(w) + 'snapshot:test', scope: { userId: w.userId, organizationId: w.organizationId, unitId: w.unitId!, team, area: 'hanseniase', month: '2028-10', classification: 'RESTRICTED' }, caseId, entityId, preparedAt: new Date().toISOString(), attachments: [], monthly: { version: 0, total: 1, pending: 1 }, data: { teams: [{ id: team, name: 'Equipe', permissions: { view: true, save: true, close: true } }], selected: { id: caseId, team_id: team, initial: { name: '[SINTÉTICO] Caso' } }, visit: { id: entityId, case_id: caseId, competency: '2028-10', version: 1, status: 'DRAFT', payload: { name: '[SINTÉTICO] Caso', notificationDate: '2028-10-01', followUpDate: '2028-10-02', examinedContacts: 0 }, headers: {} } } } as unknown as LongSnapshot;
  const records = new Map<string, unknown>([[s.id, s]]);
  const v = { deviceId: randomUUID(), assertIdentity: vi.fn(), assertAuthorized: vi.fn(), invalidateAuthorization: vi.fn(), putRecord: vi.fn(async (key: string, value: unknown) => { records.set(key, structuredClone(value)); }), getRecord: vi.fn(async (key: string) => records.get(key) ?? null), listRecords: vi.fn(async (prefix: string) => [...records].filter(([k]) => k.startsWith(prefix)).map(([id, value]) => ({ id, value }))) } as unknown as OfflineVault;
  return { s, v, records };
}
beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); mocks.verify.mockReset(); mocks.upload.mockReset(); mocks.upload.mockResolvedValue({ error: null }); vi.stubGlobal('navigator', {}); vi.stubGlobal('window', { dispatchEvent: vi.fn() }); });
describe('longitudinal encrypted work adapters', () => {
  it('does not confuse encrypted draft records with prepared snapshots', async () => { const { s, v, records } = fixture(); records.set(s.id + ':draft', initialLongDraft(s)); expect((await loadLongOffline(v, w)).snapshots).toEqual([s]); });
  it('queues a version-bound command without any network or effective state transition', async () => {
    const { s, v } = fixture(); const network = vi.fn(); vi.stubGlobal('fetch', network); const draft = initialLongDraft(s); draft.values.examinedContacts = '3';
    const job = await queueLongJob(v, w, s, draft, 'save'); expect(job.status).toBe('pending'); expect(job.request.command.expectedVersion).toBe(1); expect(job.request.command.payload.examinedContacts).toBe(3); expect(job.request.baseline).toEqual(s.data.visit); expect(network).not.toHaveBeenCalled();
    await expect(queueLongJob(v, w, s, draft, 'submit')).rejects.toThrow('pendente');
  });
  it('never upgrades an old draft version silently', async () => { const { s, v } = fixture(); const draft = initialLongDraft(s); s.data.visit!.version = 4; const job = await queueLongJob(v, w, s, draft, 'save'); expect(job.request.command.expectedVersion).toBe(1); });
  it('rejects another UBS, tenant overrides and envelope/body scope mismatches', async () => {
    const { s, v } = fixture(); await expect(queueLongJob(v, { ...w, unitId: randomUUID() }, s, initialLongDraft(s), 'save')).rejects.toThrow('outra');
    const job = await queueLongJob(v, w, s, initialLongDraft(s), 'save'); expect(longOfflineRequest.safeParse({ ...job.request, organizationId: randomUUID() }).success).toBe(false); expect(longOfflineRequest.safeParse({ ...job.request, month: '2028-11' }).success).toBe(false);
  });
  it('keeps exact operation/body after a lost response and repairs the snapshot only after confirmation', async () => {
    const { s, v } = fixture(); const job = await queueLongJob(v, w, s, initialLongDraft(s), 'save'); const requests: string[] = []; let lost = true;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => { if (!init?.body) return Response.json({ ...s, data: { ...s.data, visit: { ...s.data.visit, version: 2 } } }); requests.push(String(init.body)); if (lost) { lost = false; throw new TypeError('network'); } return Response.json({ status: 'confirmed', result: { ...s.data.visit, version: 2 } }); }));
    await expect(synchronizeLongOffline(v, w)).rejects.toThrow('network'); expect((await loadLongOffline(v, w)).jobs[0].status).toBe('pending');
    await synchronizeLongOffline(v, w); expect(requests).toHaveLength(2); expect(requests[0]).toBe(requests[1]); const saved = (await loadLongOffline(v, w)).jobs[0]; expect(saved.id).toBe(job.id); expect(saved.status).toBe('confirmed'); expect(saved.needsRefresh).toBe(false);
  });
  it('preserves both versions on 409 and blocks automatic retry', async () => {
    const { s, v } = fixture(); await queueLongJob(v, w, s, initialLongDraft(s), 'save'); const fetcher = vi.fn(async () => Response.json({ status: 'conflict', conflictId: randomUUID(), server: { version: 3, payload: { name: '[SINTÉTICO] Outra versão' } } }, { status: 409 })); vi.stubGlobal('fetch', fetcher);
    await synchronizeLongOffline(v, w); await synchronizeLongOffline(v, w); expect(fetcher).toHaveBeenCalledTimes(1); const job = (await loadLongOffline(v, w)).jobs[0]; expect(job.status).toBe('conflict'); expect(job.request.command.payload.name).toBe('[SINTÉTICO] Caso'); expect(job.result?.server).toMatchObject({ version: 3 });
  });
  it('does not accept success without a durable receipt or discard a definitive rejection', async () => {
    const { s, v } = fixture(); await queueLongJob(v, w, s, initialLongDraft(s), 'save'); vi.stubGlobal('fetch', vi.fn(async () => Response.json({ mode: 'demo' })));
    await synchronizeLongOffline(v, w); expect((await loadLongOffline(v, w)).jobs[0].status).toBe('failed');
  });
  it('revocation quarantines the vault before any confirmation', async () => {
    const { s, v } = fixture(); await queueLongJob(v, w, s, initialLongDraft(s), 'save'); vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Revogado' }, { status: 403 })));
    await expect(synchronizeLongOffline(v, w)).rejects.toThrow('revogado'); expect(v.invalidateAuthorization).toHaveBeenCalledOnce(); expect((await loadLongOffline(v, w)).jobs[0].status).toBe('pending');
  });
  it('retains attachment bytes and reservation id across interrupted upload', async () => {
    const { s, v } = fixture(); const file = await addLongFile(v, w, s, new File(['%PDF-1.4\nSINTETICO'], 'comprovante.pdf', { type: 'application/pdf' })); const reservations: string[] = [];
    mocks.upload.mockResolvedValueOnce({ error: { message: 'interrupted' } }).mockResolvedValue({ error: null });
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => { const req = JSON.parse(String(init?.body)); if (req.kind === 'attachment-reserve') { reservations.push(req.attachmentId); return Response.json({ status: 'PENDING', object_path: 'opaque', token: 'ephemeral' }); } return Response.json({ status: 'AVAILABLE' }); }));
    await expect(synchronizeLongOffline(v, w)).rejects.toThrow('interrompido'); let saved = (await loadLongOffline(v, w)).files[0]; expect(saved.bytes).toBe(file.bytes); expect(saved.status).toBe('pending');
    await synchronizeLongOffline(v, w); saved = (await loadLongOffline(v, w)).files[0]; expect(reservations).toEqual([file.id, file.id]); expect(saved.status).toBe('confirmed'); expect(saved.sha256).toBe(file.sha256);
  });
  it('rejects fake formats without replacing earlier encrypted attachments', async () => {
    const { s, v } = fixture(); await expect(addLongFile(v, w, s, new File(['not PDF'], 'fake.pdf', { type: 'application/pdf' }))).rejects.toThrow('conteúdo'); expect((await loadLongOffline(v, w)).files).toHaveLength(0);
    expect(validLongFile(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png')).toBe(true);
  });
  it('resolves explicitly and retains the original command', async () => {
    const { s, v, records } = fixture(); const job = await queueLongJob(v, w, s, initialLongDraft(s), 'save'); const conflict: LongJob = { ...job, status: 'conflict', result: { conflictId: randomUUID(), server: { version: 2 } } }; records.set(longPrefix(w) + 'job:' + job.id, conflict);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.body ? Response.json({ status: 'resolved', decision: 'KEEP_SERVER' }) : Response.json({ ...s, data: { ...s.data, visit: { ...s.data.visit, version: 2 } } })));
    await resolveLongJob(v, w, conflict, 'KEEP_SERVER', 'Conferência sintética das versões'); const saved = (await loadLongOffline(v, w)).jobs[0]; expect(saved.status).toBe('confirmed'); expect(saved.request).toEqual(job.request); expect(saved.resolution?.decision).toBe('KEEP_SERVER');
  });
});
