import { test } from "node:test";
import assert from "node:assert/strict";
import { assertStagingConfig } from "../scripts/staging-config.mjs";

const ref = "abcdefghijklmnopqrst";
const config = { SGC_ENVIRONMENT: "staging", SGC_STAGING_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, SGC_DEMO_MODE: "false", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-publishable", SUPABASE_SERVICE_ROLE_KEY: "synthetic-secret" };
test("shared staging requires explicit authorization mode", () => {
  const shared = { ...config, SGC_STAGING_PROJECT_REF: "javgqqgyealviyhqwhgx", NEXT_PUBLIC_SUPABASE_URL: "https://javgqqgyealviyhqwhgx.supabase.co" };
  assert.throws(() => assertStagingConfig(shared), /shared-synthetic/);
  assert.equal(assertStagingConfig({ ...shared, SGC_STAGING_DATABASE_MODE: "shared-synthetic" }).ref, "javgqqgyealviyhqwhgx");
});
test("staging operations reject mismatched URLs, keys and demonstration mode", () => {
  assert.throws(() => assertStagingConfig({ ...config, NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }), /URL/);
  assert.throws(() => assertStagingConfig({ ...config, SUPABASE_SERVICE_ROLE_KEY: `header.${Buffer.from(JSON.stringify({ ref: "javgqqgyealviyhqwhgx" })).toString("base64url")}.signature` }), /outro projeto/);
  assert.throws(() => assertStagingConfig({ ...config, SGC_DEMO_MODE: "true" }), /false/);
});
test("staging operations require configuration and return only the explicitly selected target", () => {
  assert.throws(() => assertStagingConfig({}), /explicitamente/);
  assert.equal(assertStagingConfig(config).ref, ref);
});
