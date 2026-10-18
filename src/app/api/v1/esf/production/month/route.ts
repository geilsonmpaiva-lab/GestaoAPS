import { NextResponse } from 'next/server';
import { monthlyCommandSchema } from '@/lib/esf/production';
import { requireActor, isDemoMode, createSupabaseServerClient } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { canViewEsf } from '@/lib/server/esf';
import { commandError } from '@/lib/server/command-response';
import { isSameOriginRequest } from '@/lib/server/request-origin';

export async function POST(request: Request) {
  if (!await requireActor()) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const parsed = monthlyCommandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Confira a competência, versão e justificativa (mínimo de 10 caracteres para devolver ou reabrir).' }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  if (workspace.organizationId !== parsed.data.organizationId || workspace.unitId !== parsed.data.unitId || !canViewEsf(workspace)) return NextResponse.json({ error: 'Escopo não autorizado.' }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ mode: 'demo' });
  const { operationId, ...input } = parsed.data;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc('command_esf_production_month', { p_operation_id: operationId, p_input: input });
  return error ? commandError(error) : NextResponse.json(data);
}
