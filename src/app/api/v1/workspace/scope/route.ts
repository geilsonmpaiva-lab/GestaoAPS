import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { loadWorkspaceContext, scopeCookie } from "@/lib/server/workspace";
import { requireActor } from "@/lib/server/supabase";

const schema = z.object({ organizationId: z.uuid(), unitId: z.uuid().nullable() });
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next's local server may reconstruct 127.0.0.1 requests as localhost.
  // Validate against the actual HTTP Host as well, preserving scheme and port.
  let sameOrigin = !origin || origin === url.origin;
  if (origin && !sameOrigin) {
    try {
      const parsed = new URL(origin);
      sameOrigin = parsed.origin === origin && parsed.protocol === url.protocol && parsed.host === request.headers.get("host");
    } catch { sameOrigin = false; }
  }
  if (!sameOrigin) return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  if (!await requireActor()) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Selecione uma unidade válida." }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  if (!workspace.scopes.some((item) => item.organizationId === body.data.organizationId && item.unitId === body.data.unitId)) return NextResponse.json({ error: "Escopo não autorizado." }, { status: 403 });
  (await cookies()).set(scopeCookie, JSON.stringify(body.data), { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return NextResponse.json({ ...body.data });
}
