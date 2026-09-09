import { NextResponse } from "next/server";
import { z } from "zod";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({ operationId: z.uuid(), expectedVersion: z.number().int().positive(), effective: z.boolean(), notes: z.string().trim().min(3).max(10_000), evidenceAttachmentId: z.uuid().nullable().optional() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params; const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Verificação de eficácia inválida." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID(), actionPlanId: id, effective: body.data.effective, status: body.data.effective ? "CLOSED" : "REOPENED", mode: "demo" });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("record_plan_effectiveness", { p_action_plan_id: id, p_expected_version: body.data.expectedVersion, p_operation_id: body.data.operationId, p_effective: body.data.effective, p_notes: body.data.notes, p_evidence_attachment_id: body.data.evidenceAttachmentId ?? null });
  return error ? commandError(error) : NextResponse.json(data);
}
