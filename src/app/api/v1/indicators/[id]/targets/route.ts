import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({
  organizationId: z.uuid(), unitId: z.uuid(), startsOn: z.iso.date(), endsOn: z.iso.date(),
  comparison: z.enum(["GTE","LTE","BETWEEN","EQ"]), targetValue: z.number().finite().nullable().optional(), minimumValue: z.number().finite().nullable().optional(), maximumValue: z.number().finite().nullable().optional(),
  attentionRule: z.record(z.string(), z.number().finite()).nullable().optional()
}).superRefine((value, context) => {
  if (value.endsOn<value.startsOn) context.addIssue({ code: "custom", message: "A vigência final deve ser posterior à inicial." });
  if (["GTE","LTE","EQ"].includes(value.comparison) && value.targetValue == null) context.addIssue({ code: "custom", message: "Informe o valor da meta." });
  if (value.comparison==="BETWEEN" && (value.minimumValue == null || value.maximumValue == null || value.minimumValue>value.maximumValue)) context.addIssue({ code: "custom", message: "Informe um intervalo válido." });
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Meta inválida.", issues: body.success ? undefined : body.error.issues }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID(), indicatorId: id, ...body.data, mode: "demo" }, { status: 201 });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("targets").insert({ organization_id: body.data.organizationId, unit_id: body.data.unitId, indicator_id: id, starts_on: body.data.startsOn, ends_on: body.data.endsOn, comparison: body.data.comparison, target_value: body.data.targetValue, minimum_value: body.data.minimumValue, maximum_value: body.data.maximumValue, attention_rule: body.data.attentionRule, created_by: actor.id, updated_by: actor.id }).select("*").single();
  if (error) return NextResponse.json({ error: error.code === "23P01" ? "Já existe uma meta vigente nesse período." : "Não foi possível cadastrar a meta.", code: error.code }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json(data, { status: 201 });
}
