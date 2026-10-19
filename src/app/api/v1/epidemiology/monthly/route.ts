import { NextResponse } from 'next/server';
import { epiMonthCommand, epiReportFilters } from '@/lib/epidemiology-monthly';
import { epidemiologyEnabled, epidemiologyMonthlyRpc } from '@/lib/server/epidemiology';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { isSameOriginRequest } from '@/lib/server/request-origin';
import { commandError } from '@/lib/server/command-response';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const workspace = await loadWorkspaceContext();
  if (!epidemiologyEnabled(workspace)) return NextResponse.json({ error: 'Área não habilitada.' }, { status: 403, headers });
  const query = epiReportFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return NextResponse.json({ error: 'Revise o recorte mensal.' }, { status: 422, headers });
  const { data, error } = await epidemiologyMonthlyRpc(workspace, { ...query.data, action: 'load' });
  if (error) { const r = commandError(error); r.headers.set('Cache-Control', 'private, no-store'); return r; }
  return NextResponse.json(data, { headers });
}
export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  const workspace = await loadWorkspaceContext();
  if (!epidemiologyEnabled(workspace)) return NextResponse.json({ error: 'Área não habilitada.' }, { status: 403, headers });
  let input;
  try { const body = await request.text(); if (body.length > 4000) throw new Error(); input = epiMonthCommand.parse(JSON.parse(body)); }
  catch { return NextResponse.json({ error: 'Revise o fechamento e a justificativa.' }, { status: 422, headers }); }
  const { data, error } = await epidemiologyMonthlyRpc(workspace, input);
  if (error) { const response = commandError(error); response.headers.set('Cache-Control', 'private, no-store'); return response; }
  return NextResponse.json(data, { headers });
}
