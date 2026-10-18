import { NextResponse } from 'next/server';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { esfMapRpc, loadEsfMaps, syntheticMapsEnabled } from '@/lib/server/esf-maps';
import { validateMap } from '@/lib/esf/maps';
import { commandError } from '@/lib/server/command-response';
import { isSameOriginRequest } from '@/lib/server/request-origin';

const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const workspace = await loadWorkspaceContext();
  if (!syntheticMapsEnabled(workspace)) return NextResponse.json({ error: 'Homologação sintética não habilitada.' }, { status: 403, headers });
  const query = new URL(request.url).searchParams;
  try { return NextResponse.json(await loadEsfMaps(workspace, query.get('form') ?? '', query.get('team') ?? undefined, query.get('map') ?? undefined), { headers }); }
  catch { return NextResponse.json({ error: 'Mapa ou equipe não autorizado. Confira os filtros.' }, { status: 403, headers }); }
}
export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  if (Number(request.headers.get('content-length')) > 500000) return NextResponse.json({ error: 'Mapa excede o limite.' }, { status: 413, headers });
  const workspace = await loadWorkspaceContext();
  if (!syntheticMapsEnabled(workspace)) return NextResponse.json({ error: 'Homologação sintética não habilitada.' }, { status: 403, headers });
  let input;
  try { input = validateMap(await request.json()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error && !('issues' in error) ? error.message : 'Revise os tipos, quantidades e campos do mapa.' }, { status: 422, headers }); }
  const { data, error } = await esfMapRpc(workspace, input);
  if (error) return commandError(error);
  return NextResponse.json(data, { headers });
}
