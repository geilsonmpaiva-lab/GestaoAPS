import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActor, createSupabaseServerClient, isDemoMode } from "@/lib/server/supabase";
import { commandError } from "@/lib/server/command-response";
const schema = z.object({ operationId: z.uuid(), name: z.string().trim().min(3).max(240), fields: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), label: z.string().trim().min(2).max(500), type: z.enum(["text", "number", "boolean"]), required: z.boolean() })).min(1).max(100) }).refine(value => new Set(value.fields.map(field => field.key)).size === value.fields.length);
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Revise os campos do checklist; cada identificador deve ser único." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ error: "Use a homologação autenticada para salvar um checklist." }, { status: 422 });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("save_protocol_form", { p_version_id: id, p_operation_id: body.data.operationId, p_name: body.data.name, p_fields: body.data.fields });
  return error ? commandError(error) : NextResponse.json(data, { status: 201 });
}
