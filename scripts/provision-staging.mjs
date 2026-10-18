import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadStagingConfig } from "./staging-config.mjs";

const { ref, url, serviceKey, env } = loadStagingConfig();
if (env.SGC_STAGING_ADMIN_EMAIL && !env.SGC_STAGING_ADMIN_EMAIL.endsWith("@sgc-ubs.test")) throw new Error("Use uma conta sintética @sgc-ubs.test, sem reutilizar usuários reais.");
const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const accountsPath = resolve(env.SGC_STAGING_ACCOUNTS_FILE ?? ".env.staging.accounts.local");
let credentials;
if (existsSync(accountsPath)) {
  credentials = JSON.parse(readFileSync(accountsPath, "utf8"));
  if (credentials.projectRef !== ref) throw new Error("Arquivo de contas pertence a outro projeto.");
} else {
  credentials = { projectRef: ref, accounts: [
    { email: env.SGC_STAGING_ADMIN_EMAIL ?? "admin@sgc-ubs.test", name: "Administrador Sintético", role: "ADMIN_SISTEMA", unit: null },
    { email: "gerente-a@sgc-ubs.test", name: "Gerente Sintético A", role: "GERENTE_UBS", unit: "0000001" },
    { email: "leitor-b@sgc-ubs.test", name: "Leitor Sintético B", role: "LEITOR", unit: "0000002" },
  ].map(account => ({ ...account, password: `Hml!${randomBytes(24).toString("base64url")}` })) };
  // Generated credentials are a local output artifact, never logged or committed.
  writeFileSync(accountsPath, JSON.stringify(credentials, null, 2), { flag: "wx", mode: 0o600 });
}

async function ensure(table, filters, values) {
  let lookup = client.from(table).select("id");
  for (const [key, value] of Object.entries(filters)) lookup = value === null ? lookup.is(key, null) : lookup.eq(key, value);
  const { data, error } = await lookup.maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  if (data) return data;
  const inserted = await client.from(table).insert(values).select("id").single();
  if (inserted.error) throw new Error(`${table}: ${inserted.error.message}`);
  return inserted.data;
}

const organization = await ensure("organizations", { name: "[HOMOLOGAÇÃO] Município Sintético" }, { name: "[HOMOLOGAÇÃO] Município Sintético" });
if (env.SGC_STAGING_ORGANIZATION_ID && env.SGC_STAGING_ORGANIZATION_ID !== organization.id) throw new Error("Organização sintética divergente.");
if (!env.SGC_STAGING_ORGANIZATION_ID) appendFileSync(process.env.SGC_STAGING_ENV_FILE, `\nSGC_STAGING_ORGANIZATION_ID=${organization.id}\n`);
const units = {};
for (const [cnes, label] of [["0000001", "A"], ["0000002", "B"]]) {
  units[cnes] = await ensure("units", { organization_id: organization.id, cnes }, { organization_id: organization.id, cnes, name: `[HOMOLOGAÇÃO] UBS Sintética ${label}`, address: { synthetic: true, city: "Município Sintético", state: "CE" } });
}
const operations = ["visualizar", "criar", "editar", "excluir_logicamente", "aprovar", "publicar", "executar", "encerrar", "reabrir", "exportar"];
const existing = await client.auth.admin.listUsers({ perPage: 1000 });
if (existing.error) throw new Error("Não foi possível consultar as contas da homologação.");
for (const account of credentials.accounts) {
  let user = existing.data.users.find(candidate => candidate.email === account.email);
  if (!user) {
    const created = await client.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`Falha ao provisionar a conta sintética ${account.role}.`);
    user = created.data.user;
  }
  await ensure("profiles", { id: user.id }, { id: user.id, email: account.email, name: account.name, status: "ACTIVE" });
  const unitId = account.unit ? units[account.unit].id : null;
  await ensure("memberships", { user_id: user.id, organization_id: organization.id, unit_id: unitId, role: account.role }, {
    user_id: user.id, organization_id: organization.id, unit_id: unitId, role: account.role,
    domains: ["*"], operations: account.role === "LEITOR" ? ["visualizar"] : operations,
  });
}
for (const key of ["ux_mvp_v2", "reunioes"]) {
  await ensure("feature_flags", { organization_id: organization.id, unit_id: null, key }, { organization_id: organization.id, unit_id: null, key, enabled: true, reason: "Homologação com dados sintéticos; sem liberação institucional." });
}
console.log(JSON.stringify({ ok: true, projectRef: ref, organizationId: organization.id, units: Object.fromEntries(Object.entries(units).map(([key, unit]) => [key, unit.id])), accountCount: credentials.accounts.length, credentialsFile: accountsPath }));
