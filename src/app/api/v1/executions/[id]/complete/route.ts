import { NextResponse } from "next/server";
import { z } from "zod";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({ operationId: z.uuid(), expectedVersion: z.number().int().positive(), result: z.record(z.string(), z.unknown()).optional(), indicatorInputs: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), z.number().finite()).optional(), compliance: z.string().max(80).optional(), notes: z.string().max(10_000).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Comando de conclusão inválido." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id, status: "COMPLETED", version: body.data.expectedVersion + 1, measurement: body.data.indicatorInputs ? { id: crypto.randomUUID(), value: 92, status: "ATENCAO" } : null, mode: "demo" });
  const client = await createSupabaseServerClient();
  const { operationId, expectedVersion, ...payload } = body.data;
  const { data, error } = await client.rpc("complete_execution", { p_execution_id: id, p_expected_version: expectedVersion, p_operation_id: operationId, p_payload: payload });
  return error ? commandError(error) : NextResponse.json(data);
}
