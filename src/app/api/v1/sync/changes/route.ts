import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (isDemoMode()) return NextResponse.json({ cursor: new Date().toISOString(), changes: [], tombstones: [], previousCursor: cursor });

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("sync_changes_since", { p_cursor: cursor });
  if (error) return NextResponse.json({ error: "Falha ao consultar alterações.", code: error.code }, { status: 422 });
  return NextResponse.json(data);
}
