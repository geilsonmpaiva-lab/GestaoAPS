import { NextRequest, NextResponse } from "next/server";
import { syncBatchSchema, type OperationResult } from "@/lib/domain/contracts";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = syncBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Lote de sincronização inválido.", issues: parsed.error.issues }, { status: 422 });

  if (isDemoMode()) {
    const results: OperationResult[] = parsed.data.operations.map((operation) => ({ operationId: operation.operationId, status: "accepted", serverVersion: operation.expectedVersion + 1 }));
    return NextResponse.json({ cursor: new Date().toISOString(), results });
  }

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("apply_sync_batch", { p_batch: parsed.data });
  if (error) {
    const conflict = error.code === "40001" || error.code === "P0001";
    return NextResponse.json({ error: conflict ? "Conflito de versão." : "Falha ao sincronizar.", code: error.code }, { status: conflict ? 409 : 422 });
  }
  const hasConflict = typeof data === "object" && data !== null && "results" in data && Array.isArray(data.results) && data.results.some((item: unknown) => typeof item === "object" && item !== null && "status" in item && item.status === "conflict");
  return NextResponse.json(data, { status: hasConflict ? 409 : 200 });
}
