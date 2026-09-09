import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = z.object({ operationId: z.uuid(), expectedVersion: z.number().int().positive() }).safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Comando de publicação inválido." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id, status: "PUBLICADO", version: body.data.expectedVersion, publishedAt: new Date().toISOString(), mode: "demo" });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("publish_protocol_version", { p_version_id: id, p_expected_version: body.data.expectedVersion, p_operation_id: body.data.operationId });
  if (error) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "42501" ? 403 : error.code === "40001" ? 409 : 422 });
  return NextResponse.json(data);
}
