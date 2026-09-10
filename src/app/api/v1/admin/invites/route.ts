import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { inviteSchema, mayDelegate } from "@/lib/domain/admin-registration";
import { loadAdminCatalog } from "@/lib/server/admin-registration";
import { loadWorkspaceContext } from "@/lib/server/workspace";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";
export async function POST(request: Request) {
  const actor = await requireActor();
  if (!actor) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const body = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Confira nome, e-mail, unidade, perfil e permissões." }, { status: 422 });
  const workspace = await loadWorkspaceContext();
  if (workspace.organizationId !== body.data.organizationId) return NextResponse.json({ error: "Organização não autorizada." }, { status: 403 });
  const { catalog } = await loadAdminCatalog(workspace);
  const input = body.data;
  if (!catalog || (input.unitId && !catalog.units.some(u => u.id === input.unitId && u.status === "ACTIVE")) || !catalog.grants.some(g => mayDelegate(g, input.unitId, input.role, input.domains, input.operations))) return NextResponse.json({ error: "Você não pode conceder este escopo, perfil ou permissões." }, { status: 403 });
  if (isDemoMode()) return NextResponse.json({ id: crypto.randomUUID(), mode: "demo" }, { status: 201 });
  const caller = await createSupabaseServerClient();
  const args = { p_organization_id: input.organizationId, p_unit_id: input.unitId, p_role: input.role, p_domains: input.domains, p_operations: input.operations };
  // Validate in PostgreSQL BEFORE the privileged Auth call, and again when provisioning.
  const { error: authorizationError } = await caller.rpc("authorize_admin_invite", args);
  if (authorizationError) return commandError(authorizationError);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Serviço interno de convites não configurado." }, { status: 503 });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_ORIGIN ?? new URL(request.url).origin}/login`;
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, { redirectTo, data: { name: input.name } });
  if (inviteError || !invitation.user) return NextResponse.json({ error: "Não foi possível enviar o convite. Verifique se o e-mail já possui conta e se o serviço de envio está configurado." }, { status: 422 });
  const { data: membershipId, error } = await caller.rpc("provision_invited_membership", { ...args, p_user_id: invitation.user.id });
  if (error) return NextResponse.json({ error: "O convite foi enviado, mas o vínculo não foi confirmado. Não reenvie: solicite ao administrador a verificação do cadastro.", partial: true }, { status: 409 });
  return NextResponse.json({ id: invitation.user.id, membershipId }, { status: 201 });
}
