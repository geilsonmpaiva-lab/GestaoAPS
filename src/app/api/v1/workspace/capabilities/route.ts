import { NextResponse } from 'next/server';
import { requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { apsFilters, loadApsWorkspace } from '@/lib/server/aps-workspace';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers });
  const workspace = await loadWorkspaceContext();
  if (!workspace.uxV3) return NextResponse.json({ error: 'Experiência não habilitada.' }, { status: 403, headers });
  const filters = apsFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters.success) return NextResponse.json({ error: 'Filtros inválidos.' }, { status: 422, headers });
  const data = await loadApsWorkspace(workspace, filters.data);
  // Excludes records, nominal fields and the underlying monthly snapshots.
  return NextResponse.json({ organizationId: workspace.organizationId, unitId: workspace.unitId, month: data.month, areas: data.areas.map(({ id, title, teams, municipal, error }) => ({ id, title, teams, municipal, error })), production: { enabled: data.production.enabled, reason: data.production.reason, teams: data.production.data?.teams ?? [], create: data.production.data?.canCreate ?? false, review: data.production.data?.canReview ?? false, close: data.production.data?.canClose ?? false }, errors: data.errors }, { headers });
}
