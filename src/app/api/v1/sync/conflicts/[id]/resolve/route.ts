import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const resolutionSchema = z.object({ strategy: z.enum(["KEEP_SERVER", "KEEP_CLIENT", "MERGED"]), payload: z.record(z.string(), z.unknown()).optional(), justification: z.string().min(10).max(1000) });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const parsed = resolutionSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Resolução inválida." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id, status: "resolved", resolvedAt: new Date().toISOString() });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("resolve_sync_conflict", { p_conflict_id: id, p_resolution: parsed.data });
  if (error) return NextResponse.json({ error: "Não foi possível resolver o conflito.", code: error.code }, { status: 422 });
  return NextResponse.json(data);
}
