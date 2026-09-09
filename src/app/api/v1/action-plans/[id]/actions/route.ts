import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema = z.object({ what: z.string().trim().min(3).max(500), why: z.string().trim().max(2_000).optional(), where: z.string().trim().max(240).optional(), whenAt: z.iso.datetime({ offset: true }).nullable().optional(), whoId: z.uuid().nullable().optional(), how: z.string().trim().max(4_000).optional(), howMuch: z.number().nonnegative().nullable().optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "Ação 5W2H inválida.", issues: body.success ? undefined : body.error.issues }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID(), actionPlanId: id, ...body.data, status: "NAO_INICIADO", percentage: 0, version: 1, mode: "demo" }, { status: 201 });
  const client = await createSupabaseServerClient();
  const { data: plan, error: planError } = await client.from("action_plans").select("organization_id,unit_id").eq("id", id).single();
  if (planError || !plan) return NextResponse.json({ error: "Plano não encontrado." }, { status: 404 });
  const { data, error } = await client.from("actions").insert({ organization_id: plan.organization_id, unit_id: plan.unit_id, action_plan_id: id, what: body.data.what, why: body.data.why, where_text: body.data.where, when_at: body.data.whenAt, who_id: body.data.whoId, how: body.data.how, how_much: body.data.howMuch, created_by: actor.id, updated_by: actor.id }).select("*").single();
  if (error) return NextResponse.json({ error: "Não foi possível criar a ação.", code: error.code }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json(data, { status: 201 });
}
