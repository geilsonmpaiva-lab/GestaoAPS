import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadStagingConfig } from "./staging-config.mjs";

const { url, env } = loadStagingConfig();
const credentials = JSON.parse(readFileSync(env.SGC_STAGING_ACCOUNTS_FILE, "utf8"));
const org = env.SGC_STAGING_ORGANIZATION_ID;
assert.ok(org, "Organização sintética obrigatória.");
const clients = {};
for (const account of credentials.accounts) {
  const client = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  assert.equal(login.error, null, `Login sintético ${account.role}`);
  clients[account.role] = client;
}
const admin = clients.ADMIN_SISTEMA;
const manager = clients.GERENTE_UBS;
const reader = clients.LEITOR;
const catalog = await admin.rpc("read_admin_catalog", { p_organization_id: org });
assert.equal(catalog.error, null);
const units = catalog.data.units.filter(unit => ["0000001", "0000002"].includes(unit.cnes));
assert.equal(units.length, 2);
const unitA = units.find(unit => unit.cnes === "0000001");
const unitB = units.find(unit => unit.cnes === "0000002");
for (const [client, expected] of [[manager, unitA.id], [reader, unitB.id]]) {
  const visible = await client.from("units").select("id").eq("organization_id", org);
  assert.equal(visible.error, null);
  assert.deepEqual(visible.data.map(unit => unit.id), [expected]);
}
const forbidden = await manager.from("units").select("id").eq("id", unitB.id);
assert.equal(forbidden.data?.length, 0);
const input = { organizationId: org, unitId: unitA.id, title: `[HOMOLOGAÇÃO] Cadastro persistido ${new Date().toISOString()}`, type: "MANUAL", domain: "gestao" };
const operation = randomUUID();
const created = await admin.rpc("create_mvp_record", { p_resource: "knowledge", p_operation_id: operation, p_input: input });
assert.equal(created.error, null);
const repeated = await admin.rpc("create_mvp_record", { p_resource: "knowledge", p_operation_id: operation, p_input: input });
assert.equal(repeated.data.id, created.data.id);
const persisted = await admin.from("knowledge_items").select("id,title").eq("organization_id", org).eq("id", created.data.id).single();
assert.equal(persisted.data.title, input.title);
const deniedWrite = await reader.rpc("create_mvp_record", { p_resource: "knowledge", p_operation_id: randomUUID(), p_input: { ...input, unitId: unitB.id } });
assert.ok(deniedWrite.error, "Perfil leitor não pode criar registros.");
const audit = await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("entity_id", created.data.id);
assert.equal(audit.error, null);
assert.ok(audit.count > 0, "Cadastro deve produzir auditoria.");
console.log(JSON.stringify({ ok: true, organizationId: org, persistedRecordId: created.data.id, idempotent: true, unitSeparation: true, readerWriteDenied: true, auditRecorded: true }));
await Promise.all(Object.values(clients).map(client => client.auth.signOut({ scope: "local" })));
