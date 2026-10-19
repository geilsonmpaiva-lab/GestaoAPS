'use client';
import { OfflineVault } from './vault';
import { offlineFetch, verifyVault } from './work';
import { createSupabaseBrowserClient } from '@/lib/client/supabase';
import { longCommand, type LongData, type LongArea, type LongReport } from '@/lib/epidemiology-longitudinal';
import { longOfflineRequest, validLongFile, type LongOfflineRequest } from './longitudinal-contracts';
import type { WorkspaceContext } from '@/lib/server/workspace';
const endpoint = '/api/v1/epidemiology/longitudinal/offline';
export type LongScope = { userId: string; organizationId: string; unitId: string; team: string; area: LongArea; month: string; classification: 'RESTRICTED' };
export type LongFile = { id: string; snapshotId: string; fileName: string; contentType: string; byteSize: number; sha256: string; bytes: string; status: 'pending' | 'confirmed'; error?: string };
export type LongSnapshot = { id: string; scope: LongScope; caseId: string; entityId: string; data: LongData; monthly: LongReport['teams'][number]; preparedAt: string; attachments: { id: string; file_name: string; status: string }[] };
export type LongDraft = { values: Record<string, string>; headers: Record<string, string>; reason: string; noActivity: boolean; updatedAt: string; baseVersion: number; monthVersion: number; baseline: Record<string, unknown> | null; monthBaseline: Record<string, unknown> };
export type LongJob = { id: string; snapshotId: string; caseId: string; createdAt: string; request: Extract<LongOfflineRequest, { kind: 'command' }>; status: 'pending' | 'confirmed' | 'conflict' | 'failed' | 'cancelled'; error?: string; result?: Record<string, unknown>; definitiveFailure?: boolean; needsRefresh?: boolean; resolution?: Extract<LongOfflineRequest, { kind: 'resolve' }>; attempts?: unknown[] };
export function longPrefix(w: Pick<WorkspaceContext, 'userId' | 'organizationId' | 'unitId'>) { return `longitudinal:${w.userId}:${w.organizationId}:${w.unitId ?? 'org'}:RESTRICTED:`; }
function allowed(w: WorkspaceContext) { if (!w.uxV3 || w.organizationId !== '362db1a9-bfdd-4334-9436-46b1c0117eab' || !w.unitId) throw new Error('Offline longitudinal disponível somente no contexto sintético preparado.'); }
function matches(s: LongSnapshot, w: WorkspaceContext) { allowed(w); if (s.scope.userId !== w.userId || s.scope.organizationId !== w.organizationId || s.scope.unitId !== w.unitId || s.scope.classification !== 'RESTRICTED') throw new Error('Registro de outra conta ou UBS.'); }
function requestScope(s: LongSnapshot, v: OfflineVault) { return { deviceId: v.deviceId, area: s.scope.area, month: s.scope.month, team: s.scope.team }; }
export function initialLongDraft(s: LongSnapshot): LongDraft {
  const identity = ['name', 'caseReference', 'notificationDate', 'notificationNumber', 'residenceCity', 'sinan', 'classification', 'contacts'];
  const payload = s.data.visit?.payload ?? Object.fromEntries(Object.entries(s.data.selected?.initial ?? {}).filter(([k]) => identity.includes(k)));
  return { values: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])), headers: s.data.visit?.headers ?? {}, reason: '', noActivity: false, updatedAt: new Date().toISOString(), baseVersion: s.data.visit?.version ?? 0, monthVersion: s.monthly.version, baseline: s.data.visit ?? null, monthBaseline: s.monthly };
}
export async function loadLongOffline(v: OfflineVault, w: WorkspaceContext) {
  allowed(w); await v.assertIdentity(w.userId, w.organizationId); const prefix = longPrefix(w);
  return { snapshots: (await v.listRecords<LongSnapshot>(prefix + 'snapshot:')).filter(r => !r.id.endsWith(':draft')).map(r => r.value), jobs: (await v.listRecords<LongJob>(prefix + 'job:')).map(r => r.value), files: (await v.listRecords<LongFile>(prefix + 'file:')).map(r => r.value) };
}
export async function prepareLongOffline(v: OfflineVault, w: WorkspaceContext, query: { area: LongArea; month: string; team: string; case?: string }) {
  allowed(w); await verifyVault(v, w);
  const r = await offlineFetch(endpoint + '?' + new URLSearchParams({ ...query, deviceId: v.deviceId }));
  if (!r.ok) throw new Error('Não foi possível preparar esse recorte. Confira a conexão e o acesso nominal.');
  const prepared = await r.json(); const caseId = prepared.data.selected?.id ?? crypto.randomUUID();
  const id = `${longPrefix(w)}snapshot:${query.area}:${query.team}:${query.month}:${caseId}`;
  const rows = await loadLongOffline(v, w);
  if (rows.jobs.some(j => j.snapshotId === id && !['confirmed', 'cancelled'].includes(j.status))) throw new Error('Há uma operação pendente para este recorte. Sincronize ou resolva antes de preparar outra versão.');
  const old = await v.getRecord<LongSnapshot>(id), draft = await v.getRecord<LongDraft>(id + ':draft');
  if (old && draft && (JSON.stringify(draft.values) !== JSON.stringify(initialLongDraft(old).values) || JSON.stringify(draft.headers) !== JSON.stringify(initialLongDraft(old).headers))) throw new Error('Existe um rascunho local. Recupere-o na área offline antes de atualizar o snapshot.');
  const snapshot: LongSnapshot = { ...prepared, id, caseId, entityId: prepared.data.visit?.id ?? crypto.randomUUID(), scope: { userId: w.userId, organizationId: w.organizationId, unitId: w.unitId!, ...query, classification: 'RESTRICTED' } };
  await v.putRecord('workspace', w); await v.putRecord(id, snapshot);
  for (const conflict of prepared.conflicts ?? []) {
    const key = longPrefix(w) + 'job:' + conflict.operation_id;
    if (!await v.getRecord(key)) await v.putRecord<LongJob>(key, { id: conflict.operation_id, snapshotId: id, caseId: conflict.case_id, createdAt: conflict.created_at, request: { kind: 'command', deviceId: conflict.client.deviceId, area: conflict.area, month: conflict.competency, team: conflict.team_id, command: conflict.client, baseline: conflict.baseline }, status: 'conflict', result: { status: 'conflict', conflictId: conflict.id, client: conflict.client, baseline: conflict.baseline, server: conflict.server } });
  }
  return snapshot;
}
export async function saveLongDraft(v: OfflineVault, w: WorkspaceContext, s: LongSnapshot, draft: LongDraft) {
  matches(s, w); await v.assertIdentity(w.userId, w.organizationId); await v.putRecord(s.id + ':draft', { ...draft, updatedAt: new Date().toISOString() });
}
export async function queueLongJob(v: OfflineVault, w: WorkspaceContext, s: LongSnapshot, draft: LongDraft, action: string) {
  matches(s, w); await v.assertIdentity(w.userId, w.organizationId); const rows = await loadLongOffline(v, w);
  if (rows.jobs.some(j => !['confirmed', 'cancelled'].includes(j.status) && (j.caseId === s.caseId || action.startsWith('month-') && j.request.area === s.scope.area && j.request.team === s.scope.team && j.request.month === s.scope.month))) throw new Error('Há uma operação pendente ou em conflito. Confirme-a antes de preparar outra sobre o mesmo caso/fechamento.');
  const integers = ['contacts', 'examinedContacts'];
  if (!Number.isInteger(draft.baseVersion) || !Number.isInteger(draft.monthVersion)) throw new Error('Rascunho antigo sem versão preparada. Preserve a cópia e prepare novamente online.');
  const command = longCommand.parse({ action, area: s.scope.area, month: s.scope.month, teamId: s.scope.team, caseId: s.caseId, entityId: s.entityId, operationId: crypto.randomUUID(), deviceId: v.deviceId, localTimestamp: new Date().toISOString(), synthetic: true, expectedVersion: action.startsWith('month-') ? draft.monthVersion : draft.baseVersion, payload: Object.fromEntries(Object.entries(draft.values).filter(([, value]) => value !== '').map(([key, value]) => [key, integers.includes(key) ? Number(value) : value])), headers: Object.fromEntries(Object.entries(draft.headers).filter(([, value]) => value !== '')), reason: draft.reason, noActivity: draft.noActivity });
  const request = longOfflineRequest.parse({ kind: 'command', ...requestScope(s, v), command, baseline: action.startsWith('month-') ? draft.monthBaseline : draft.baseline }) as LongJob['request'];
  const job: LongJob = { id: command.operationId, snapshotId: s.id, caseId: s.caseId, request, createdAt: new Date().toISOString(), status: 'pending' };
  await saveLongDraft(v, w, s, draft); await v.putRecord(longPrefix(w) + 'job:' + job.id, job); return job;
}
const encode = (bytes: Uint8Array) => { let value = ''; for (let i = 0; i < bytes.length; i += 16384) value += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(value); };
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function digest(bytes: Uint8Array) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map(v => v.toString(16).padStart(2, '0')).join(''); }
export async function addLongFile(v: OfflineVault, w: WorkspaceContext, s: LongSnapshot, file: File) {
  matches(s, w); await v.assertIdentity(w.userId, w.organizationId);
  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) || file.size < 1 || file.size > 26214400 || file.name.length > 240) throw new Error('Use PDF, PNG ou JPEG entre 1 byte e 25 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validLongFile(bytes, file.type)) throw new Error('O conteúdo não corresponde ao formato informado. A cópia anterior foi preservada.');
  const item: LongFile = { id: crypto.randomUUID(), snapshotId: s.id, fileName: file.name, contentType: file.type, byteSize: file.size, bytes: encode(bytes), sha256: await digest(bytes), status: 'pending' };
  await v.putRecord(longPrefix(w) + 'file:' + item.id, item); return item;
}
async function post(v: OfflineVault, body: LongOfflineRequest) {
  const r = await offlineFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device-id': v.deviceId }, body: JSON.stringify(body) });
  if (r.status === 401 || r.status === 403) { await v.invalidateAuthorization(); throw new Error('Acesso revogado ou dispositivo não autorizado. Cópias cifradas preservadas em quarentena.'); }
  const result = await r.json(); return { r, result };
}
async function refreshSnapshot(v: OfflineVault, w: WorkspaceContext, s: LongSnapshot, includeCase = true, applied?: LongJob['request']['command']) {
  const r = await offlineFetch(endpoint + '?' + new URLSearchParams({ ...requestScope(s, v), ...(includeCase ? { case: s.caseId } : {}) }));
  if (r.status === 401 || r.status === 403) { await v.invalidateAuthorization(); throw new Error('Acesso revogado. Cópias preservadas.'); }
  if (!r.ok) throw new Error('Envio confirmado, mas o snapshot não pôde ser atualizado. Reconecte antes de preparar outro comando.');
  const value = await r.json(); const next = { ...s, ...value }; const old = await v.getRecord<LongDraft>(s.id + ':draft');
  const normalized = (values: Record<string, unknown>) => JSON.stringify(Object.entries(values).filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)]).sort(([a], [b]) => a.localeCompare(b)));
  const editedAfterPreparation = applied && old && (normalized(old.values) !== normalized(applied.payload) || normalized(old.headers) !== normalized(applied.headers));
  await v.putRecord(s.id, next); if (!editedAfterPreparation) await v.putRecord(s.id + ':draft', initialLongDraft(next)); return next as LongSnapshot;
}
export async function synchronizeLongOffline(v: OfflineVault, w: WorkspaceContext) {
  allowed(w); await verifyVault(v, w); const prefix = longPrefix(w);
  const run = async () => {
    let rows = await loadLongOffline(v, w);
    // Repair a response-lost snapshot refresh without replaying a different body.
    for (const s of rows.snapshots) {
      const latest = rows.jobs.filter(j => j.snapshotId === s.id && j.status === 'confirmed' && j.needsRefresh).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (latest) { await refreshSnapshot(v, w, s, !latest.request.command.action.startsWith('month-') || !!s.data.selected, latest.request.command); await v.putRecord(prefix + 'job:' + latest.id, { ...latest, needsRefresh: false }); }
    }
    const sendJobs = async (saving: boolean) => {
      rows = await loadLongOffline(v, w);
      for (const job of rows.jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (['confirmed', 'conflict', 'cancelled'].includes(job.status) || (job.request.command.action === 'save') !== saving) continue;
        const s = rows.snapshots.find(s => s.id === job.snapshotId); if (!s) throw new Error('Snapshot ausente. Operação preservada.'); matches(s, w);
        if (rows.jobs.some(j => j.caseId === job.caseId && j.status === 'conflict')) continue;
        try {
          const { r, result } = await post(v, job.request);
          const status = r.status === 409 && result.status === 'conflict' ? 'conflict' : r.ok && result.status === 'confirmed' ? 'confirmed' : 'failed';
          const saved = { ...job, status, result, needsRefresh: status === 'confirmed', definitiveFailure: r.status >= 400 && r.status < 500 && r.status !== 409, error: status === 'confirmed' ? undefined : result.error ?? 'Versões e envelope preservados.' };
          await v.putRecord(prefix + 'job:' + job.id, saved);
          if (status === 'confirmed') { await refreshSnapshot(v, w, s, !job.request.command.action.startsWith('month-') || !!s.data.selected, job.request.command); await v.putRecord(prefix + 'job:' + job.id, { ...saved, needsRefresh: false }); }
          if (r.status >= 500) throw new Error('Servidor indisponível. Envelope preservado para repetição idempotente.');
        } catch (error) { await v.assertAuthorized(); throw error; }
      }
    };
    await sendJobs(true); rows = await loadLongOffline(v, w);
    for (const file of rows.files.filter(f => f.status === 'pending')) {
      const s = rows.snapshots.find(s => s.id === file.snapshotId); if (!s?.data.visit || rows.jobs.some(j => j.caseId === s.caseId && j.status === 'conflict')) continue;
      matches(s, w);
      try {
        const { r, result } = await post(v, { kind: 'attachment-reserve', ...requestScope(s, v), attachmentId: file.id, visitId: s.entityId, fileName: file.fileName, contentType: file.contentType as 'application/pdf', byteSize: file.byteSize, sha256: file.sha256 });
        if (!r.ok) throw new Error(result.error ?? 'Não foi possível reservar o anexo.');
        if (result.status !== 'AVAILABLE') {
          const upload = await createSupabaseBrowserClient().storage.from('epi-longitudinal-synthetic').uploadToSignedUrl(result.object_path, result.token, new Blob([decode(file.bytes)], { type: file.contentType }));
          if (upload.error && !/already exists|duplicate/i.test(upload.error.message)) throw new Error('Envio interrompido. Cópia cifrada preservada; repita para retomar.');
          const final = await post(v, { kind: 'attachment-finalize', ...requestScope(s, v), attachmentId: file.id }); if (!final.r.ok || final.result.status !== 'AVAILABLE') throw new Error(final.result.error ?? 'Integridade ainda não confirmada.');
        }
        await v.putRecord(prefix + 'file:' + file.id, { ...file, status: 'confirmed', error: undefined });
      } catch (e) { await v.assertAuthorized(); await v.putRecord(prefix + 'file:' + file.id, { ...file, error: e instanceof Error ? e.message : 'Falha. Cópia preservada.' }); throw e; }
    }
    await sendJobs(false);
  };
  if (navigator.locks) await navigator.locks.request('sgc-longitudinal-sync:' + prefix, run); else await run();
  window.dispatchEvent(new Event('sgc-longitudinal-sync'));
}
export async function resolveLongJob(v: OfflineVault, w: WorkspaceContext, job: LongJob, decision: 'KEEP_SERVER' | 'RETRY', justification: string) {
  await verifyVault(v, w); const rows = await loadLongOffline(v, w), s = rows.snapshots.find(s => s.id === job.snapshotId); if (!s || job.status !== 'conflict') throw new Error('Conflito não encontrado.'); matches(s, w);
  const server = job.result?.server as { version?: number } | null;
  const resolution = job.resolution ?? longOfflineRequest.parse({ kind: 'resolve', ...requestScope(s, v), conflictId: job.result?.conflictId, operationId: crypto.randomUUID(), expectedServerVersion: server?.version ?? 0, decision, justification }) as LongJob['resolution'];
  await v.putRecord(longPrefix(w) + 'job:' + job.id, { ...job, resolution });
  const { r, result } = await post(v, resolution!);
  if (r.status === 409 && result.status === 'conflict') { await v.putRecord(longPrefix(w) + 'job:' + job.id, { ...job, result, resolution: undefined, attempts: [...job.attempts ?? [], { resolution, result: job.result }] }); throw new Error('O servidor mudou novamente. Compare as versões antes de decidir.'); }
  if (!r.ok || result.status !== 'resolved') throw new Error(result.error ?? 'Resolução não confirmada. Tentativa preservada.');
  const saved = { ...job, status: 'confirmed' as const, resolution, needsRefresh: true, attempts: [...job.attempts ?? [], result], error: 'Decisão confirmada e auditada. Conteúdo original preservado.' };
  await v.putRecord(longPrefix(w) + 'job:' + job.id, saved); await refreshSnapshot(v, w, s, !job.request.command.action.startsWith('month-') || !!s.data.selected); await v.putRecord(longPrefix(w) + 'job:' + job.id, { ...saved, needsRefresh: false });
}
export async function cacheLongFile(v: OfflineVault, w: WorkspaceContext, s: LongSnapshot, attachmentId: string) {
  matches(s, w); await verifyVault(v, w);
  const r = await offlineFetch(endpoint + '/attachment?' + new URLSearchParams({ ...requestScope(s, v), attachmentId })); if (!r.ok) throw new Error('Anexo indisponível ou não autorizado.');
  const bytes = new Uint8Array(await r.arrayBuffer()); if (!bytes.length || bytes.length > 26214400) throw new Error('Tamanho inválido.');
  const file: LongFile = { id: attachmentId, snapshotId: s.id, fileName: s.attachments.find(a => a.id === attachmentId)?.file_name ?? 'Comprovante sintético', contentType: r.headers.get('content-type') ?? 'application/pdf', byteSize: bytes.length, bytes: encode(bytes), sha256: await digest(bytes), status: 'confirmed' };
  await v.putRecord(longPrefix(w) + 'file:' + file.id, file);
}
export async function downloadLongFile(v: OfflineVault, w: WorkspaceContext, file: LongFile) {
  await v.assertIdentity(w.userId, w.organizationId); const bytes = decode(file.bytes); if (await digest(bytes) !== file.sha256) throw new Error('Cópia local com integridade divergente.');
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType })); const a = document.createElement('a'); a.href = url; a.download = file.fileName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
