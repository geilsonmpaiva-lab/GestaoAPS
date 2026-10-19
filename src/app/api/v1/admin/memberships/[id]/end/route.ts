import { NextResponse } from "next/server";
import { z } from "zod";
import { endMembershipSchema } from "@/lib/domain/admin-registration";
import { accessLifecycleEnabled } from "@/lib/server/admin-registration";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";
import { loadWorkspaceContext } from "@/lib/server/workspace";
import { commandError } from "@/lib/server/command-response";

type Context = { params: Promise<{ id: string }> };
const headers = { "cache-control": "private, no-store" };
async function authorize(context: Context) {
  const actor = await requireActor();
  if (!actor) return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401, headers }) };
  const workspace = await loadWorkspaceContext();
  if (isDemoMode() || !accessLifecycleEnabled(workspace) || !workspace.enabledModules.includes("administracao")) {
    return { response: NextResponse.json({ error: "Encerramento disponível somente na homologação sintética autorizada." }, { status: 403, headers }) };
  }
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return { response: NextResponse.json({ error: "Vínculo inválido." }, { status: 422, headers }) };
  return { workspace, id };
}
async function execute(input: Record<string, unknown>) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("staging_end_membership_v1", { p_request: input });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) return NextResponse.json({ error: "O encerramento de vínculos ainda não está disponível neste ambiente." }, { status: 503, headers });
    const response = commandError(error); response.headers.set("cache-control", "private, no-store"); return response;
  }
  return NextResponse.json(data, { headers });
}
export async function GET(_request: Request, context: Context) {
  const access = await authorize(context);
  if (access.response) return access.response;
  return execute({ action: "preview", organizationId: access.workspace!.organizationId, membershipId: access.id });
}
export async function POST(request: Request, context: Context) {
  const access = await authorize(context);
  if (access.response) return access.response;
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origem não permitida." }, { status: 403, headers });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 4000) return NextResponse.json({ error: "Comando muito extenso." }, { status: 413, headers });
  let raw: unknown; try { raw = JSON.parse(text); } catch { raw = null; }
  const input = endMembershipSchema.safeParse(raw);
  if (!input.success) return NextResponse.json({ error: "Confira a prévia do vínculo e informe uma justificativa com pelo menos 10 caracteres." }, { status: 422, headers });
  return execute({ ...input.data, action: "end", organizationId: access.workspace!.organizationId, membershipId: access.id });
}
