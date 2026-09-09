import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const registrationSchema = z.object({
  deviceId: z.uuid(),
  label: z.string().trim().min(1).max(120),
  platform: z.string().trim().min(1).max(240)
});

export async function POST(request: Request) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Identificação do dispositivo inválida.", issues: parsed.error.issues }, { status: 422 });
  if (isDemoMode()) return NextResponse.json({ id: parsed.data.deviceId, verifiedAt: new Date().toISOString(), mode: "demo" });

  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("register_device", {
    p_device_id: parsed.data.deviceId,
    p_label: parsed.data.label,
    p_platform: parsed.data.platform
  });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "Dispositivo ou vínculo não autorizado." : "Falha ao registrar dispositivo.", code: error.code }, { status: error.code === "42501" ? 403 : 422 });
  return NextResponse.json(data);
}
