// Builds a single rollback-only SQL request. No network calls or secret access.
// Import buildValidationQuery() from a separately authorized validation runner.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrations = [
  "202609090025_ux_mvp_v2.sql",
  "202609090026_mvp_forms_and_responses.sql",
  "202609090027_idempotent_mvp_creation.sql",
  "202609090028_sync_replay_integrity.sql",
  "202609090029_device_scope.sql",
  "202609090030_workspace_people.sql",
  "202609090031_command_crypto_resolution.sql",
];
const suites = { mvp: "mvp_v2.test.sql", people: "workspace_people.test.sql", schema: "rls.test.sql" };

export function buildValidationQuery(suite = "mvp", { includeMigrations = true } = {}) {
  if (!Object.hasOwn(suites, suite)) throw new Error("Unknown suite. Choose mvp, people or schema.");
  const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
  const test = read(`supabase/tests/database/${suites[suite]}`)
    .replace(/^begin;\s*$/mi, "")
    .replace(/^rollback;\s*$/mi, "");
  return [
    "begin;",
    "set local statement_timeout = '45s';",
    "set local lock_timeout = '5s';",
    "set local search_path = public, extensions;",
    "create extension if not exists pgtap with schema extensions;",
    ...(includeMigrations ? migrations.map(name => read(`supabase/migrations/${name}`)) : []),
    test,
    "rollback;",
  ].join("\n\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--print")) {
  const suite = process.argv.find(argument => argument.startsWith("--suite="))?.slice(8) ?? "mvp";
  process.stdout.write(buildValidationQuery(suite, { includeMigrations: !process.argv.includes("--already-migrated") }));
}
