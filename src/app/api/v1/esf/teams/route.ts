import { NextResponse } from 'next/server';
import { teamSchema } from '@/lib/esf/production';
import { requireActor, isDemoMode, createSupabaseServerClient } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { loadEsfTeams } from '@/lib/server/esf';
import { commandError } from '@/lib/server/command-response';

export async function GET() {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  try { return NextResponse.json({ teams: await loadEsfTeams(await loadWorkspaceContext()) }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return NextResponse.json({ error: 'Não foi possível consultar as equipes.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const parsed = teamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira a identificação, nome e área da equipe.' }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  if (workspace.organizationId !== parsed.data.organizationId || workspace.unitId !== parsed.data.unitId || !workspace.enabledModules.includes('administracao')) return NextResponse.json({ error: 'Unidade não autorizada.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ id: parsed.data.entityId, mode: 'demo' }, { status: 201 });
  const { operationId, ...input } = parsed.data;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('register_esf_team', { p_operation_id: operationId, p_input: input });
  return error ? commandError(error) : NextResponse.json(data, { status: 201 });
}
