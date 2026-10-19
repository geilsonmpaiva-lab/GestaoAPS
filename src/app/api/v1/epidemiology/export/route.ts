import { NextResponse } from 'next/server';
import { epiReportFilters, type EpiMonthReport } from '@/lib/epidemiology-monthly';
import { epidemiologyEnabled, epidemiologyMonthlyRpc } from '@/lib/server/epidemiology';
import { epidemiologyWorkbook } from '@/lib/server/epidemiology-export';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { commandError } from '@/lib/server/command-response';
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const workspace = await loadWorkspaceContext();
  if (!epidemiologyEnabled(workspace)) return NextResponse.json({ error: 'Área não habilitada.' }, { status: 403 });
  const filters = epiReportFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters.success) return NextResponse.json({ error: 'Recorte inválido.' }, { status: 422 });
  const { data, error } = await epidemiologyMonthlyRpc(workspace, { ...filters.data, action: 'report' });
  if (error) { const r = commandError(error); r.headers.set('Cache-Control', 'private, no-store'); return r; }
  const buffer = await epidemiologyWorkbook(data as EpiMonthReport);
  return new Response(new Uint8Array(buffer), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="vigilancia-${filters.data.area}-${filters.data.month}.xlsx"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
