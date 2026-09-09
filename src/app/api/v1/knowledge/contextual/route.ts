import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { modules } from "@/lib/modules";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  domain: z.string().trim().max(80).optional(),
  type: z.string().trim().max(80).optional(),
  unitId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10)
});

function safeTerm(value?: string) {
  return (value ?? "").replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Filtros contextuais inválidos.", issues: parsed.error.issues }, { status: 422 });
  const { domain, type, unitId, limit } = parsed.data;
  const q = safeTerm(parsed.data.q);

  if (isDemoMode()) {
    const data = modules.conhecimento.records
      .filter((record) => !q || `${record.title} ${record.meta}`.toLocaleLowerCase("pt-BR").includes(q.toLocaleLowerCase("pt-BR")))
      .slice(0, limit);
    return NextResponse.json({ data, total: data.length, mode: "demo" });
  }

  const client = await createSupabaseServerClient();
  let query = client.from("knowledge_items")
    .select("id,title,type,domain,subdomain,tags,access_level,status,version,updated_at", { count: "exact" })
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .limit(limit)
    .order("updated_at", { ascending: false });
  if (unitId) query = query.or(`unit_id.is.null,unit_id.eq.${unitId}`);
  if (domain) query = query.eq("domain", domain);
  if (type) query = query.eq("type", type);
  if (q) query = query.or(`title.ilike.%${q}%,domain.ilike.%${q}%,subdomain.ilike.%${q}%`);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: "Não foi possível consultar o conhecimento contextual.", code: error.code }, { status: 422 });
  return NextResponse.json({ data, total: count ?? data.length });
}
