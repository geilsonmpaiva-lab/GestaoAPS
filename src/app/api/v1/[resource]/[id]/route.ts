import { NextResponse } from "next/server";
import { requireActor } from "@/lib/server/supabase";
import { loadWorkspaceContext } from "@/lib/server/workspace";
import { detailResources, loadRecordDetail } from "@/lib/server/record-detail";

export async function GET(_request: Request, context: { params: Promise<{ resource: string; id: string }> }) {
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { resource, id } = await context.params;
  const workspace = await loadWorkspaceContext();
  const definition = detailResources[resource];
  if (!definition || !workspace.uxV2 || !workspace.enabledModules.includes(definition.module)) return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  try {
    const detail = await loadRecordDetail(resource, id, workspace);
    return detail ? NextResponse.json(detail, { headers: { "cache-control": "private, no-store" } }) : NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar o registro. Tente novamente." }, { status: 503 });
  }
}
