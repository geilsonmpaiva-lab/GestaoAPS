import { NextRequest, NextResponse } from "next/server";
import { modules } from "@/lib/modules";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const unitId = request.nextUrl.searchParams.get("unitId");
  if (isDemoMode()) return NextResponse.json({ cursor: new Date().toISOString(), unitId, modules, featureFlags: { safety: false, ombudsman: false, peopleSensitive: false } });

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("sync_bootstrap", { p_unit_id: unitId });
  if (error) return NextResponse.json({ error: "Não foi possível preparar os dados offline.", code: error.code }, { status: 422 });
  return NextResponse.json(data);
}
