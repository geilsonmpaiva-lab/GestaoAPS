import { NextResponse } from "next/server";
import { z } from "zod";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({ operationId: z.uuid(), expectedVersion: z.number().int().positive(), title: z.string().trim().min(3).max(200), description: z.string().trim().min(3).max(10_000), classification: z.enum(["MINOR", "MAJOR", "CRITICAL"]).default("MAJOR"), responsibleId: z.uuid().nullable().optional(), dueAt: z.iso.datetime({ offset: true }).nullable().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Dados do plano inválidos.", issues: body.success ? undefined : body.error.issues }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ measurementId: id, nonconformityId: crypto.randomUUID(), actionPlanId: crypto.randomUUID(), status: "OPEN", mode: "demo" });
  const client = await createSupabaseServerClient();
  const { operationId, expectedVersion, ...payload } = body.data;
  const { data, error } = await client.rpc("open_measurement_plan", { p_measurement_id: id, p_expected_version: expectedVersion, p_operation_id: operationId, p_payload: payload });
  return error ? commandError(error) : NextResponse.json(data);
}
