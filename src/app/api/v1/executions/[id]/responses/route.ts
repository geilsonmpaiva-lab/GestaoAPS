import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActor, createSupabaseServerClient, isDemoMode } from "@/lib/server/supabase";
import { commandError } from "@/lib/server/command-response";
const schema = z.object({ operationId: z.uuid(), expectedVersion: z.number().int().positive(), responses: z.array(z.object({ fieldKey: z.string().min(1).max(64), value: z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]), compliant: z.boolean().nullable().optional(), observation: z.string().max(4000).optional() })).min(1).max(100) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Revise as respostas do checklist." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ error: "Use a homologação autenticada para salvar respostas." }, { status: 422 });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("save_execution_responses", { p_execution_id: id, p_expected_version: body.data.expectedVersion, p_operation_id: body.data.operationId, p_responses: body.data.responses });
  return error ? commandError(error) : NextResponse.json(data);
}
