import { NextResponse } from "next/server";
import { unitSchema } from "@/lib/domain/admin-registration";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";
import { loadWorkspaceContext } from "@/lib/server/workspace";

export async function POST(request: Request) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const parsed = unitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Confira o nome, o CNES e o endereço da unidade." }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  if (workspace.organizationId !== parsed.data.organizationId || !workspace.enabledModules.includes("administracao")) return NextResponse.json({ error: "Organização não autorizada." }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ id: parsed.data.operationId, mode: "demo" }, { status: 201 });
  const client = await createSupabaseServerClient();
  const { operationId, ...input } = parsed.data;
  const { data, error } = await client.rpc("register_admin_unit", { p_operation_id: operationId, p_input: input });
  return error ? commandError(error) : NextResponse.json(data, { status: 201 });
}
