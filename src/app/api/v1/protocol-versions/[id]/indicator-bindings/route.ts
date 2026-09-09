import { NextResponse } from "next/server";
import { z } from "zod";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({ operationId: z.uuid(), expectedVersion: z.number().int().positive(), indicatorId: z.uuid(), formulaVersionId: z.uuid(), unitId: z.uuid().nullable() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Vínculo entre protocolo e indicador inválido." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID(), protocolVersionId: id, indicatorId: body.data.indicatorId, formulaVersionId: body.data.formulaVersionId, status: "ACTIVE", mode: "demo" }, { status: 201 });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("bind_protocol_indicator", { p_protocol_version_id: id, p_expected_version: body.data.expectedVersion, p_indicator_id: body.data.indicatorId, p_formula_version_id: body.data.formulaVersionId, p_unit_id: body.data.unitId, p_operation_id: body.data.operationId });
  return error ? commandError(error) : NextResponse.json(data, { status: 201 });
}
