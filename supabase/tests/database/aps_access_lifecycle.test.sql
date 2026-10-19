-- New synthetic fixtures only; every mutation is rolled back.
begin;
select no_plan();
insert into auth.users(id,email) values
 ('95000000-0000-4000-8000-000000000001','access-admin@example.invalid'),
 ('95000000-0000-4000-8000-000000000002','access-manager@example.invalid'),
 ('95000000-0000-4000-8000-000000000003','access-reader@example.invalid'),
 ('95000000-0000-4000-8000-000000000004','access-target@example.invalid'),
 ('95000000-0000-4000-8000-000000000005','access-admin-peer@example.invalid'),
 ('95000000-0000-4000-8000-000000000006','access-future@example.invalid'),
 ('95000000-0000-4000-8000-000000000007','access-expired@example.invalid');
update public.profiles set status='ACTIVE' where id::text like '95000000%';
insert into public.organizations(id,name) values('362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] Acessos SQL') on conflict do nothing;
insert into public.units(id,organization_id,name) values
 ('95000000-0000-4000-8000-000000000011','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS A'),
 ('95000000-0000-4000-8000-000000000012','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS B');
insert into public.memberships(id,user_id,organization_id,unit_id,role,domains,operations) values
 ('95000000-0000-4000-8000-000000000101','95000000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab',null,'ADMIN_SISTEMA',array['*'],array['visualizar']),
 ('95000000-0000-4000-8000-000000000102','95000000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab','95000000-0000-4000-8000-000000000011','GERENTE_UBS',array['administracao','protocolos'],array['visualizar','criar','editar']),
 ('95000000-0000-4000-8000-000000000103','95000000-0000-4000-8000-000000000003','362db1a9-bfdd-4334-9436-46b1c0117eab','95000000-0000-4000-8000-000000000011','LEITOR',array['administracao'],array['visualizar']),
 ('95000000-0000-4000-8000-000000000104','95000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab','95000000-0000-4000-8000-000000000011','EXECUTOR',array['protocolos'],array['visualizar','editar']),
 ('95000000-0000-4000-8000-000000000105','95000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab','95000000-0000-4000-8000-000000000012','LEITOR',array['protocolos'],array['visualizar']),
 ('95000000-0000-4000-8000-000000000106','95000000-0000-4000-8000-000000000005','362db1a9-bfdd-4334-9436-46b1c0117eab',null,'ADMIN_SISTEMA',array['*'],array['visualizar']),
 ('95000000-0000-4000-8000-000000000107','95000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab','95000000-0000-4000-8000-000000000011','LEITOR',array['indicadores'],array['visualizar']),
 ('95000000-0000-4000-8000-000000000108','95000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab','95000000-0000-4000-8000-000000000011','GERENTE_UBS',array['administracao','protocolos'],array['visualizar','criar']),
 ('95000000-0000-4000-8000-000000000109','95000000-0000-4000-8000-000000000006','362db1a9-bfdd-4334-9436-46b1c0117eab','95000000-0000-4000-8000-000000000011','GERENTE_UBS',array['administracao','protocolos'],array['visualizar','criar','editar']),
 ('95000000-0000-4000-8000-000000000110','95000000-0000-4000-8000-000000000007','362db1a9-bfdd-4334-9436-46b1c0117eab','95000000-0000-4000-8000-000000000011','GERENTE_UBS',array['administracao','protocolos'],array['visualizar','criar','editar']);
update public.memberships set starts_at=now()+interval '1 day' where id='95000000-0000-4000-8000-000000000109';
update public.memberships set starts_at=now()-interval '2 days',ends_at=now()-interval '1 day' where id='95000000-0000-4000-8000-000000000110';
create temp table access_data(key text primary key,value jsonb); grant all on access_data to authenticated;
insert into access_data values('target-before',(select to_jsonb(m)-'ends_at' from public.memberships m where id='95000000-0000-4000-8000-000000000104'));
insert into access_data values('auth-before',(select to_jsonb(u) from auth.users u where id='95000000-0000-4000-8000-000000000004'));
insert into access_data values('nominal-before',(select to_jsonb(count(*)) from app.epi_grants_v1));
create function pg_temp.access_preview(target_id uuid default '95000000-0000-4000-8000-000000000104') returns jsonb language sql as $$
 select jsonb_build_object('action','preview','organizationId','362db1a9-bfdd-4334-9436-46b1c0117eab','membershipId',target_id); $$;
create function pg_temp.access_end(preview jsonb) returns jsonb language sql as $$
 select pg_temp.access_preview((preview->>'membershipId')::uuid)||jsonb_build_object('action','end','operationId',gen_random_uuid(),
 'expectedFingerprint',preview->>'expectedFingerprint','expectedEndsAt',preview->'expectedEndsAt',
 'deviceId',gen_random_uuid(),'localTimestamp',now(),'reason','[SINTÉTICO] Encerrar somente o vínculo da fixture.'); $$;

set local role anon;
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview())$$,'42501',null,'anon cannot preview or end memberships');
set local role authenticated;
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview())$$,'42501',null,'administrative reader cannot end access');
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000006',true);
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview())$$,'42501',null,'future authority is not active');
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000007',true);
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview())$$,'42501',null,'expired authority is rejected');
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000002',true);
select throws_ok($$select * from app.aps_access_commands_v1$$,'42501',null,'receipts have no direct read grants');
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview()||'{"organizationId":"95000000-0000-4000-8000-000000000099"}')$$,'42501',null,'institutional and other organizations are rejected');
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview('95000000-0000-4000-8000-000000000105'))$$,'42501',null,'other UBS is rejected');
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview('95000000-0000-4000-8000-000000000107'))$$,'42501',null,'domains outside the authority are rejected');
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview('95000000-0000-4000-8000-000000000108'))$$,'42501',null,'unit manager cannot end a peer manager');
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview('95000000-0000-4000-8000-000000000106'))$$,'42501',null,'unit manager cannot end an administrator');
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview('95000000-0000-4000-8000-000000000102'))$$,'42501',null,'self termination is rejected');
insert into access_data values('preview',public.staging_end_membership_v1(pg_temp.access_preview()));
select is((select value->>'unitId' from access_data where key='preview'),'95000000-0000-4000-8000-000000000011','preview identifies exact authorized UBS');
select is((select length(value->>'expectedFingerprint') from access_data where key='preview'),64,'preview carries an optimistic fingerprint');
insert into access_data values('command',pg_temp.access_end((select value from access_data where key='preview')));
select throws_ok($$select public.staging_end_membership_v1(value||'{"reason":"curta"}') from access_data where key='command'$$,'22023',null,'justification is mandatory');
select throws_ok($$select public.staging_end_membership_v1(value-'expectedEndsAt') from access_data where key='command'$$,'22023',null,'expected endsAt must be explicit even when null');
select throws_ok($$select public.staging_end_membership_v1(value||'{"expectedFingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}') from access_data where key='command'$$,'40001',null,'wrong fingerprint cannot end a membership');
reset role;
select ok((select ends_at is null from public.memberships where id='95000000-0000-4000-8000-000000000104'),'preview and failed commands do not change access');
update public.memberships set ends_at=now()+interval '1 day' where id='95000000-0000-4000-8000-000000000104';
set local role authenticated;
select throws_ok($$select public.staging_end_membership_v1(value) from access_data where key='command'$$,'40001',null,'concurrent membership change invalidates preview');
update access_data set value=pg_temp.access_end(public.staging_end_membership_v1(pg_temp.access_preview())) where key='command';
select throws_ok($$select public.staging_end_membership_v1(value||'{"expectedEndsAt":null}') from access_data where key='command'$$,'40001',null,'endsAt literal must match in addition to fingerprint');
insert into access_data values('result',public.staging_end_membership_v1((select value from access_data where key='command')));
select is((select value->>'status' from access_data where key='result'),'ENDED','authorized command ends the exact membership');
select is(public.staging_end_membership_v1((select value from access_data where key='command')),(select value from access_data where key='result'),'retry returns the original receipt');
select throws_ok($$select public.staging_end_membership_v1(value||'{"reason":"[SINTÉTICO] Outra justificativa para o mesmo ID."}') from access_data where key='command'$$,'22023',null,'operation id cannot be reused with other input');
reset role;
select is((select count(*) from app.aps_access_commands_v1 where membership_id='95000000-0000-4000-8000-000000000104'),1::bigint,'only one receipt is persisted');
select is((select count(*) from public.audit_log where entity_id='95000000-0000-4000-8000-000000000104' and action='MEMBERSHIP_ENDED'),1::bigint,'explicit ending and reason are audited once');
select is((select to_jsonb(m)-'ends_at' from public.memberships m where id='95000000-0000-4000-8000-000000000104'),(select value from access_data where key='target-before'),'other membership fields are preserved');
select ok((select ends_at is null from public.memberships where id='95000000-0000-4000-8000-000000000105'),'same person keeps other UBS membership');
select is((select to_jsonb(u) from auth.users u where id='95000000-0000-4000-8000-000000000004'),(select value from access_data where key='auth-before'),'Auth account is not suspended or modified');
select is((select to_jsonb(count(*)) from app.epi_grants_v1),(select value from access_data where key='nominal-before'),'nominal grants are not modified');
select throws_ok($$update app.aps_access_commands_v1 set reason='[SINTÉTICO] Tentar alterar recibo.' where membership_id='95000000-0000-4000-8000-000000000104'$$,'55000',null,'receipts are append only');
update public.memberships set ends_at=now() where id='95000000-0000-4000-8000-000000000102';
set local role authenticated;
select throws_ok($$select public.staging_end_membership_v1(value) from access_data where key='command'$$,'42501',null,'revoked actor cannot replay an old successful command');
select set_config('request.jwt.claim.sub','95000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.staging_end_membership_v1(value) from access_data where key='command'$$,'22023',null,'another authorized actor cannot reuse the receipt');
select lives_ok($$select public.staging_end_membership_v1(pg_temp.access_end(public.staging_end_membership_v1(pg_temp.access_preview('95000000-0000-4000-8000-000000000106'))))$$,'same authority may end another administrator while one remains');
select throws_ok($$select public.staging_end_membership_v1(pg_temp.access_preview('95000000-0000-4000-8000-000000000101'))$$,'42501',null,'last remaining administrator cannot end its own access');
reset role;
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname='aps_access_commands_v1'),'receipt table has RLS');
select ok(not has_function_privilege('anon','public.staging_end_membership_v1(jsonb)','execute'),'anonymous wrapper execute is revoked');
select * from finish();
rollback;
