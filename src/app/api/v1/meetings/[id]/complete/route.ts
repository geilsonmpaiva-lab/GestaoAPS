import { NextResponse } from "next/server";
import { z } from "zod";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({ operationId: z.uuid(), expectedVersion: z.number().int().positive(), minutes: z.string().trim().min(10).max(50_000) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Comando de encerramento inválido." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id, status: "COMPLETED", version: body.data.expectedVersion + 1, mode: "demo" });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("complete_meeting", { p_meeting_id: id, p_expected_version: body.data.expectedVersion, p_operation_id: body.data.operationId, p_minutes: body.data.minutes });
  return error ? commandError(error) : NextResponse.json(data);
}
