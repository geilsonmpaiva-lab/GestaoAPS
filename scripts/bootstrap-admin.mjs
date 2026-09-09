import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnvironment() {
  const contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function argument(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length).trim();
  if (!value) throw new Error(`Argumento obrigatório ausente: --${name}=...`);
  return value;
}

loadLocalEnvironment();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Supabase não configurado em .env.local.");

const email = argument("email").replace("\\@", "@").toLowerCase();
const name = argument("name");
const organizationName = argument("organization");
const unitName = argument("unit");
const cnes = argument("cnes");
const redirectTo = process.env.NEXT_PUBLIC_APP_ORIGIN
  ? `${process.env.NEXT_PUBLIC_APP_ORIGIN}/login`
  : undefined;

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function oneOrCreate(table, filters, payload) {
  let query = client.from(table).select("id").limit(1);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data: existing, error: selectError } = await query.maybeSingle();
  if (selectError) throw selectError;
  if (existing) return { id: existing.id, created: false };
  const { data, error } = await client.from(table).insert(payload).select("id").single();
  if (error) throw error;
  return { id: data.id, created: true };
}

const organization = await oneOrCreate(
  "organizations",
  { name: organizationName },
  { name: organizationName },
);
const unit = await oneOrCreate(
  "units",
  { organization_id: organization.id, cnes },
  { organization_id: organization.id, name: unitName, cnes },
);

let user;
for (let page = 1; page <= 10 && !user; page += 1) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw error;
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (data.users.length < 100) break;
}

let invitationSent = false;
if (!user) {
  const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo,
  });
  if (error) throw error;
  user = data.user;
  invitationSent = true;
}
if (!user) throw new Error("Não foi possível provisionar o usuário.");

const { error: profileError } = await client.from("profiles").upsert({
  id: user.id,
  name,
  email,
  status: user.email_confirmed_at ? "ACTIVE" : "INVITED",
});
if (profileError) throw profileError;

const allOperations = [
  "visualizar", "criar", "editar", "excluir_logicamente", "aprovar",
  "publicar", "executar", "encerrar", "reabrir", "exportar",
];
const { data: membership, error: membershipLookupError } = await client
  .from("memberships")
  .select("id")
  .eq("user_id", user.id)
  .eq("organization_id", organization.id)
  .is("unit_id", null)
  .eq("role", "ADMIN_SISTEMA")
  .limit(1)
  .maybeSingle();
if (membershipLookupError) throw membershipLookupError;

let membershipId = membership?.id;
if (membershipId) {
  const { error } = await client.from("memberships").update({
    domains: ["*"], operations: allOperations, ends_at: null,
  }).eq("id", membershipId);
  if (error) throw error;
} else {
  const { data, error } = await client.from("memberships").insert({
    user_id: user.id,
    organization_id: organization.id,
    unit_id: null,
    role: "ADMIN_SISTEMA",
    domains: ["*"],
    operations: allOperations,
  }).select("id").single();
  if (error) throw error;
  membershipId = data.id;
}

console.log(JSON.stringify({
  ok: true,
  email,
  invitationSent,
  organizationCreated: organization.created,
  unitCreated: unit.created,
  organizationId: organization.id,
  unitId: unit.id,
  membershipId,
}, null, 2));
