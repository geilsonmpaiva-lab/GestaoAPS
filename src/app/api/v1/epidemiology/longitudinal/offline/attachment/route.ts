import { createHash } from 'node:crypto';
import { longFileQuery, validLongFile } from '@/lib/offline/longitudinal-contracts';
import { longitudinalEnabled } from '@/lib/server/epidemiology-longitudinal';
import { requireActor, createSupabaseServerClient } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { commandError } from '@/lib/server/command-response';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!await requireActor()) return Response.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const w = await loadWorkspaceContext(); if (!longitudinalEnabled(w)) return Response.json({ error: 'Homologação não habilitada.' }, { status: 403, headers });
  const input = longFileQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!input.success) return Response.json({ error: 'Recorte inválido.' }, { status: 422, headers });
  const client = await createSupabaseServerClient(); const result = await client.rpc('staging_epi_long_offline_v1', { p_request: { ...input.data, kind: 'attachment-read', organizationId: w.organizationId, unitId: w.unitId } });
  if (result.error) { const response = commandError(result.error); response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('X-Content-Type-Options', 'nosniff'); return response; }
  const row = result.data; if (row.status !== 'AVAILABLE') return Response.json({ error: 'Anexo ainda não confirmado.' }, { status: 409, headers });
  const file = await client.storage.from('epi-longitudinal-synthetic').download(row.object_path); if (file.error || !file.data) return Response.json({ error: 'Arquivo indisponível.' }, { status: 503, headers });
  const bytes = Buffer.from(await file.data.arrayBuffer());
  if (bytes.length !== Number(row.byte_size) || createHash('sha256').update(bytes).digest('hex') !== row.sha256 || !validLongFile(bytes, row.content_type)) return Response.json({ error: 'Integridade divergente. Download bloqueado.' }, { status: 422, headers });
  return new Response(bytes, { headers: { ...headers, 'Content-Type': row.content_type, 'Content-Disposition': 'attachment; filename="comprovante-sintetico"' } });
}
