import { createHash } from 'node:crypto';
import { longOfflineQuery, longOfflineRequest, validLongFile } from '@/lib/offline/longitudinal-contracts';
import { longitudinalEnabled } from '@/lib/server/epidemiology-longitudinal';
import { requireActor, createSupabaseServerClient } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { isSameOriginRequest } from '@/lib/server/request-origin';
import { commandError } from '@/lib/server/command-response';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await requireActor()) return Response.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const w = await loadWorkspaceContext(); if (!longitudinalEnabled(w)) return Response.json({ error: 'Homologação não habilitada.' }, { status: 403, headers });
  const input = longOfflineQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!input.success) return Response.json({ error: 'Recorte inválido.' }, { status: 422, headers });
  const client = await createSupabaseServerClient(); const result = await client.rpc('staging_epi_long_offline_v1', { p_request: { ...input.data, kind: 'prepare', organizationId: w.organizationId, unitId: w.unitId } });
  if (result.error) { const r = commandError(result.error); r.headers.set('Cache-Control', 'private, no-store'); return r; } return Response.json(result.data, { headers });
}
export async function POST(request: Request) {
  if (!await requireActor()) return Response.json({ error: 'Não autenticado.' }, { status: 401, headers });
  if (!isSameOriginRequest(request)) return Response.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  const w = await loadWorkspaceContext(); if (!longitudinalEnabled(w)) return Response.json({ error: 'Homologação não habilitada.' }, { status: 403, headers });
  let raw; try { const text = await request.text(); if (new TextEncoder().encode(text).length > 60000) throw new Error(); raw = JSON.parse(text); } catch { return Response.json({ error: 'Operação inválida.' }, { status: 422, headers }); }
  const parsed = longOfflineRequest.safeParse(raw); if (!parsed.success || request.headers.get('x-device-id') !== parsed.data.deviceId) return Response.json({ error: 'Envelope ou dispositivo inválido.' }, { status: 422, headers });
  const input: Record<string, unknown> = { ...parsed.data, organizationId: w.organizationId, unitId: w.unitId }; const client = await createSupabaseServerClient();
  if (parsed.data.kind === 'attachment-finalize') {
    const lookup = await client.rpc('staging_epi_long_offline_v1', { p_request: { ...input, kind: 'attachment-read' } });
    if (lookup.error) { const response = commandError(lookup.error); response.headers.set('Cache-Control', 'private, no-store'); return response; }
    const row = lookup.data; const download = await client.storage.from('epi-longitudinal-synthetic').download(row.object_path);
    if (download.error || !download.data) return Response.json({ error: 'Upload incompleto. Cópia cifrada preservada.' }, { status: 409, headers });
    const bytes = Buffer.from(await download.data.arrayBuffer());
    input.observedSize = bytes.length; input.observedSha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== Number(row.byte_size) || input.observedSha256 !== row.sha256 || !validLongFile(bytes, row.content_type)) return Response.json({ error: 'Integridade divergente. Anexo não confirmado.' }, { status: 422, headers });
  }
  const result = await client.rpc('staging_epi_long_offline_v1', { p_request: input });
  if (result.error) { const r = commandError(result.error); r.headers.set('Cache-Control', 'private, no-store'); return r; }
  if (parsed.data.kind === 'attachment-reserve' && result.data.status !== 'AVAILABLE') {
    const upload = await client.storage.from('epi-longitudinal-synthetic').createSignedUploadUrl(result.data.object_path);
    if (upload.error) return Response.json({ error: 'Reserva preservada; tente obter a autorização de envio novamente.' }, { status: 503, headers });
    return Response.json({ ...result.data, token: upload.data.token }, { headers });
  }
  return Response.json(result.data, { status: result.data.status === 'conflict' ? 409 : 200, headers });
}
