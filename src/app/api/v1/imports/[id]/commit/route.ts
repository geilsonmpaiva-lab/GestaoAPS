import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Prévia inválida." }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id, status: "COMMITTED", importedRows: 1, mode: "demo" });

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("commit_import_job", { p_job_id: id });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 422;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json(data);
}
