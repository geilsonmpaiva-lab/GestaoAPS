import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient, isDemoMode, requireActor } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { commandError } from '@/lib/server/command-response';
const schema = z.object({ organizationId: z.uuid(), unitId: z.uuid(), teamId: z.uuid(), userId: z.uuid(), operationId: z.uuid(), expectedVersion: z.number().int().min(0), enabled: z.boolean() }).strict();
export async function GET(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const team = z.uuid().safeParse(new URL(request.url).searchParams.get('team'));
  if (!team.success) return NextResponse.json({ error: 'Equipe inválida.' }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  if (!workspace.unitId || !workspace.enabledModules.includes('administracao')) return NextResponse.json({ error: 'Sem acesso administrativo.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ members: [{ userId: '00000000-0000-4000-8000-000000000102', name: 'Executor sintético', assigned: false, version: 0, canAssign: true }], demo: true });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('read_esf_team_access', { p_org: workspace.organizationId, p_unit: workspace.unitId, p_team: team.data });
  return error ? commandError(error) : NextResponse.json({ members: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Vínculo inválido.' }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  if (workspace.organizationId !== parsed.data.organizationId || workspace.unitId !== parsed.data.unitId || !workspace.enabledModules.includes('administracao')) return NextResponse.json({ error: 'Escopo não autorizado.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ mode: 'demo' });
  const { operationId, ...input } = parsed.data;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('assign_esf_team_member', { p_operation_id: operationId, p_input: input });
  return error ? commandError(error) : NextResponse.json(data);
}
