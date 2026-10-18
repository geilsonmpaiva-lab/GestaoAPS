import { createHash } from 'node:crypto';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { requireActor, createSupabaseServerClient } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { esfMapRpc, syntheticMapsEnabled } from '@/lib/server/esf-maps';
import { commandError } from '@/lib/server/command-response';
import { isSameOriginRequest } from '@/lib/server/request-origin';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const scope = z.object({ teamId: z.uuid(), entityId: z.uuid(), fileId: z.uuid() });
const bucket = 'esf-synthetic-receipts';
const limit = 2 * 1024 * 1024;
function validSignature(bytes: Buffer, type: string) {
  return type === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : type === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  if (!isSameOriginRequest(request, true)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  if (Number(request.headers.get('content-length')) > limit + 10000) return NextResponse.json({ error: 'Comprovante excede 2 MB.' }, { status: 413, headers });
  const workspace = await loadWorkspaceContext();
  if (!syntheticMapsEnabled(workspace)) return NextResponse.json({ error: 'Homologação não habilitada.' }, { status: 403, headers });
  const form = await request.formData().catch(() => null);
  const parsed = scope.extend({ expectedVersion: z.coerce.number().int().positive(), synthetic: z.literal('true') }).safeParse(form && Object.fromEntries(['teamId', 'entityId', 'fileId', 'expectedVersion', 'synthetic'].map(k => [k, form.get(k)])));
  const file = form?.get('file');
  if (!parsed.success || !(file instanceof File) || !file.size || file.size > limit || !['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) return NextResponse.json({ error: 'Envie somente comprovante sintético PDF, PNG ou JPEG de até 2 MB.' }, { status: 422, headers });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validSignature(bytes, file.type)) return NextResponse.json({ error: 'Formato do arquivo inválido.' }, { status: 422, headers });
  const input = { ...parsed.data, templateId: 'insulinas' };
  const check = await esfMapRpc(workspace, { ...input, action: 'read' });
  if (check.error) return commandError(check.error);
  if (check.data.status !== 'OPEN' || check.data.version !== input.expectedVersion) return NextResponse.json({ error: 'Atualize a versão do mapa antes de anexar.' }, { status: 409, headers });
  const client = await createSupabaseServerClient();
  const path = `${workspace.organizationId}/${workspace.unitId}/${input.entityId}/${input.fileId}`;
  const hash = createHash('sha256').update(bytes).digest('hex');
  const upload = await client.storage.from(bucket).upload(path, bytes, { contentType: file.type, upsert: false });
  if (upload.error) {
    // A repeated upload is accepted only when its confirmed bytes match exactly.
    const previous = await client.storage.from(bucket).download(path);
    if (previous.error || !previous.data || createHash('sha256').update(Buffer.from(await previous.data.arrayBuffer())).digest('hex') !== hash) return NextResponse.json({ error: 'Upload não confirmado. Arquivo e identificador preservados para nova tentativa.' }, { status: 409, headers });
  }
  const result = await esfMapRpc(workspace, { ...input, action: 'file-register', sha256: hash, byteSize: bytes.length, contentType: file.type });
  if (result.error) return commandError(result.error);
  return NextResponse.json({ id: result.data.id, sha256: result.data.sha256, byteSize: result.data.byte_size }, { headers });
}
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const workspace = await loadWorkspaceContext();
  const parsed = scope.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!syntheticMapsEnabled(workspace) || !parsed.success) return NextResponse.json({ error: 'Comprovante não autorizado.' }, { status: 403, headers });
  const result = await esfMapRpc(workspace, { ...parsed.data, templateId: 'insulinas', action: 'file-read' });
  if (result.error) return commandError(result.error);
  const client = await createSupabaseServerClient();
  const download = await client.storage.from(bucket).download(result.data.object_path);
  if (download.error || !download.data) return NextResponse.json({ error: 'Comprovante indisponível.' }, { status: 404, headers });
  const bytes = Buffer.from(await download.data.arrayBuffer());
  if (bytes.length !== result.data.byte_size || createHash('sha256').update(bytes).digest('hex') !== result.data.sha256) return NextResponse.json({ error: 'Integridade do arquivo não confirmada.' }, { status: 409, headers });
  const extension = result.data.content_type === 'application/pdf' ? 'pdf' : result.data.content_type === 'image/png' ? 'png' : 'jpg';
  return new Response(bytes, { headers: { ...headers, 'Content-Type': result.data.content_type, 'Content-Disposition': `attachment; filename="comprovante-sintetico.${extension}"` } });
}
