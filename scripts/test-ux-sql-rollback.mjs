// Validation only: DDL, fixtures, audit records and outbox always ROLLBACK.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildValidationQuery } from './build-mvp-validation.mjs';

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--token-file') || !args.includes('--ref')) throw new Error('Use --token-file PATH --ref PROJECT_REF');
const ref = option('--ref');
if (!/^[a-z]{20}$/.test(ref)) throw new Error('Invalid project reference');
const token = readFileSync(option('--token-file'), 'utf8').match(/sbp_[a-zA-Z0-9_-]+/)?.[0];
if (!token) throw new Error('Management token not found (never printed).');
const migrations = readdirSync('supabase/migrations').filter(name => /^2026090900(25|26|27|28|29|30|31)_.*\.sql$/.test(name)).sort();
if (migrations.length !== 7) throw new Error('Expected exactly seven UX migrations (025–031).');
const migrationSql = migrations.map(name => readFileSync(resolve('supabase/migrations', name), 'utf8')).join('\n');
if (/^\s*(commit|rollback|begin)\s*;/im.test(migrationSql)) throw new Error('Migration contains a top-level transaction statement.');
for (const testFile of ['mvp_v2.test.sql', 'workspace_people.test.sql','rls.test.sql']) {
  const testSql = readFileSync(resolve('supabase/tests/database', testFile), 'utf8').replace(/^\s*begin\s*;/im, '').replace(/^\s*rollback\s*;/im, '');
  if (/^\s*(commit|rollback)\s*;/im.test(testSql)) throw new Error('Unexpected transaction statement in test.');
  let assertionsExpected=0;
  let query = buildValidationQuery(testFile==='mvp_v2.test.sql'?'mvp':testFile==='rls.test.sql'?'schema':'people').replace("lock_timeout = '5s'","lock_timeout = '2s'");
  query=query.replace(/select (no_plan\(\)|plan\(\d+\));/,match=>`${match} create temp table ux_validation_tap(line text); grant all on ux_validation_tap to authenticated;`);
  query=query.replace(/^select (is|throws_ok|results_eq|lives_ok|ok|has_table|has_function|policies_are|triggers_are|has_trigger|has_column|col_has_check|col_is_pk)\(([\s\S]*?)\);\s*$/gm,(_,fn,args)=>{assertionsExpected++;return `insert into ux_validation_tap(line) select ${fn}(${args});`;});
  const planned=testSql.match(/select plan\((\d+)\)/)?.[1];
  if(planned && Number(planned)!==assertionsExpected)throw new Error('Not every planned assertion was captured.');
  if (!assertionsExpected) throw new Error('No assertions found.');
  query=query.replace(/rollback;\s*$/i,()=>`DO $$ DECLARE failures text; BEGIN select string_agg(line,E'\\n') into failures from ux_validation_tap where line like 'not ok%'; if failures is not null then raise exception '%',failures; end if; if (select count(*) from ux_validation_tap)<>${assertionsExpected} then raise exception 'Assertion count mismatch'; end if; END $$; ROLLBACK; SELECT ${assertionsExpected} as verified_assertions, true as rolled_back;`);
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)});
  const result = await response.json();
  if (!response.ok) { console.error(`${testFile}: SQL validation failed`,JSON.stringify(result)); process.exitCode=1; break; }
  const verified=Array.isArray(result)&&result.some(row=>row.verified_assertions===assertionsExpected&&row.rolled_back===true);
  if(verified)console.log(`${testFile}: ${assertionsExpected} assertions passed; transaction rolled back.`);
  else {console.error('Verification marker not returned; validation NOT established.');process.exitCode=1;}
}
