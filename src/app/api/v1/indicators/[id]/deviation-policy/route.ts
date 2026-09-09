import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({ organizationId: z.uuid(), unitId: z.uuid().nullable(), autoOpenNonconformity: z.boolean(), classification: z.enum(["MINOR","MAJOR","CRITICAL"]), defaultResponsibleId: z.uuid().nullable().optional(), dueDays: z.number().int().min(1).max(365), planTitle: z.string().trim().min(3).max(240) });

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Política de desvio inválida.", issues: body.success ? undefined : body.error.issues }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID(), indicatorId: id, ...body.data, mode: "demo" });
  const client = await createSupabaseServerClient();
  const row = { organization_id: body.data.organizationId, unit_id: body.data.unitId, indicator_id: id, auto_open_nonconformity: body.data.autoOpenNonconformity, classification: body.data.classification, default_responsible_id: body.data.defaultResponsibleId, due_days: body.data.dueDays, plan_title: body.data.planTitle, created_by: actor.id, updated_by: actor.id };
  const { data, error } = await client.from("indicator_deviation_policies").upsert(row, { onConflict: "organization_id,unit_id,indicator_id" }).select("*").single();
  if (error) return NextResponse.json({ error: "Não foi possível salvar a política de desvio.", code: error.code }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json(data);
}
