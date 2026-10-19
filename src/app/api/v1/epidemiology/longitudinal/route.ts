import { NextResponse } from 'next/server';
import { longCommand, longFilters, longReportFilters } from '@/lib/epidemiology-longitudinal';
import { longitudinalEnabled, longitudinalRpc } from '@/lib/server/epidemiology-longitudinal';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { isSameOriginRequest } from '@/lib/server/request-origin';
import { commandError } from '@/lib/server/command-response';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const workspace = await loadWorkspaceContext();
  if (!longitudinalEnabled(workspace)) return NextResponse.json({ error: 'Área não habilitada.' }, { status: 403, headers });
  const { report, ...query } = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = report === '1' ? longReportFilters.safeParse(query) : longFilters.safeParse(query);
  if (!parsed.success || report !== undefined && report !== '1') return NextResponse.json({ error: 'Recorte inválido.' }, { status: 422, headers });
  const result = await longitudinalRpc(workspace, { ...parsed.data, action: report ? 'report' : 'load' });
  if (result.error) { const response = commandError(result.error); response.headers.set('Cache-Control', 'private, no-store'); return response; }
  return NextResponse.json(result.data, { headers });
}
export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  const workspace = await loadWorkspaceContext();
  if (!longitudinalEnabled(workspace)) return NextResponse.json({ error: 'Área não habilitada.' }, { status: 403, headers });
  let input;
  try { const body = await request.text(); if (body.length > 26000) throw new Error(); input = longCommand.parse(JSON.parse(body)); }
  catch { return NextResponse.json({ error: 'Revise os campos, datas e identificação sintética.' }, { status: 422, headers }); }
  const result = await longitudinalRpc(workspace, input);
  if (result.error) { const response = commandError(result.error); response.headers.set('Cache-Control', 'private, no-store'); return response; }
  return NextResponse.json(result.data, { headers });
}
