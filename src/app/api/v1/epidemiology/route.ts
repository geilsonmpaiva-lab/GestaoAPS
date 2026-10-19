import { NextResponse } from 'next/server';
import { epiCommand, epiFilters } from '@/lib/epidemiology';
import { epidemiologyEnabled, epidemiologyRpc } from '@/lib/server/epidemiology';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { isSameOriginRequest } from '@/lib/server/request-origin';
import { commandError } from '@/lib/server/command-response';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const workspace = await loadWorkspaceContext();
  if (!epidemiologyEnabled(workspace)) return NextResponse.json({ error: 'Área não habilitada neste ambiente.' }, { status: 403, headers });
  const filters = epiFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters.success) return NextResponse.json({ error: 'Revise área, competência e filtros.' }, { status: 422, headers });
  const { data, error } = await epidemiologyRpc(workspace, { action: 'load', ...filters.data });
  if (error) return NextResponse.json({ error: 'Não foi possível consultar os dados autorizados.' }, { status: error.code === '42501' ? 403 : 422, headers });
  return NextResponse.json(data, { headers });
}
export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  const workspace = await loadWorkspaceContext();
  if (!epidemiologyEnabled(workspace)) return NextResponse.json({ error: 'Área não habilitada neste ambiente.' }, { status: 403, headers });
  if (Number(request.headers.get('content-length')) > 16000) return NextResponse.json({ error: 'Registro excede o limite.' }, { status: 413, headers });
  let input;
  try { const body = await request.text(); if (body.length > 16000) throw new Error(); input = epiCommand.parse(JSON.parse(body)); }
  catch { return NextResponse.json({ error: 'Revise os campos. Use somente dados sintéticos identificados.' }, { status: 422, headers }); }
  const { data, error } = await epidemiologyRpc(workspace, input);
  if (error) { const response = commandError(error); response.headers.set('Cache-Control', 'private, no-store'); return response; }
  return NextResponse.json(data, { headers });
}
