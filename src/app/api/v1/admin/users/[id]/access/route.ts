import { NextResponse } from "next/server";
import { z } from "zod";
import { loadSpecificAdminAccess } from "@/lib/server/admin-registration";
import { requireActor } from "@/lib/server/supabase";
import { loadWorkspaceContext } from "@/lib/server/workspace";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "cache-control": "private, no-store" };
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401, headers });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Pessoa inválida." }, { status: 422, headers });
  const result = await loadSpecificAdminAccess(await loadWorkspaceContext(), id);
  return result.access ? NextResponse.json(result.access, { headers }) : NextResponse.json({ error: result.error }, { status: result.status ?? 503, headers });
}
