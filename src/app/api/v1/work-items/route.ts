import { NextResponse } from 'next/server';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { apsFilters, apsWorkPage, loadApsWorkspace } from '@/lib/server/aps-workspace';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const workspace = await loadWorkspaceContext();
  if (!workspace.uxV3) return NextResponse.json({ error: 'Experiência não habilitada.' }, { status: 403, headers });
  const filters = apsFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters.success) return NextResponse.json({ error: 'Filtros inválidos.' }, { status: 422, headers });
  const data = await loadApsWorkspace(workspace, filters.data);
  return NextResponse.json({ month: data.month, updatedAt: data.updatedAt, ...apsWorkPage(data, filters.data), errors: [...data.errors, ...data.areas.filter(a => a.error).map(a => `${a.title}: ${a.error}`)] }, { headers });
}
