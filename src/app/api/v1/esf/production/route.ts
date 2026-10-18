import { NextResponse } from 'next/server';
import { productionSchema } from '@/lib/esf/production';
import { requireActor, isDemoMode, createSupabaseServerClient } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { canViewEsf, loadEsfProduction, productionFiltersSchema } from '@/lib/server/esf';
import { commandError } from '@/lib/server/command-response';
import { isSameOriginRequest } from '@/lib/server/request-origin';

export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const filters = productionFiltersSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!filters.success) return NextResponse.json({ error: 'Filtros inválidos.' }, { status: 422 });
  try { return NextResponse.json(await loadEsfProduction(await loadWorkspaceContext(), filters.data), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return NextResponse.json({ error: 'Não foi possível consultar a produção autorizada.' }, { status: 403 }); }
}
export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const parsed = productionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Informe equipe, data, procedimento e quantidade inteira entre 0 e 1.000.000.' }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  if (workspace.organizationId !== parsed.data.organizationId || workspace.unitId !== parsed.data.unitId || !canViewEsf(workspace)) return NextResponse.json({ error: 'Escopo não autorizado.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ id: parsed.data.entityId, version: parsed.data.expectedVersion + 1, mode: 'demo' });
  const { operationId, ...input } = parsed.data;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('save_esf_production', { p_operation_id: operationId, p_input: input });
  return error ? commandError(error) : NextResponse.json(data);
}
