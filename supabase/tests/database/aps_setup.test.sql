begin;
select no_plan();
insert into auth.users(id,email) values
('94800000-0000-4000-8000-000000000001','aps-admin@example.invalid'),
('94800000-0000-4000-8000-000000000002','aps-reader@example.invalid');
update public.profiles set status='ACTIVE' where id::text like '94800000%';
insert into public.organizations(id,name) values('362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] APS SQL') on conflict do nothing;
insert into public.memberships(user_id,organization_id,role,domains,operations) values
('94800000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab','ADMIN_SISTEMA',array['administracao'],array['visualizar']),
('94800000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab','LEITOR',array['*'],array['visualizar']);
select set_config('request.jwt.claim.sub','94800000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.staging_prepare_aps_v1('362db1a9-bfdd-4334-9436-46b1c0117eab',true)$$,'42501',null,'reader cannot prepare flags');
select set_config('request.jwt.claim.sub','94800000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.staging_prepare_aps_v1('94800000-0000-4000-8000-000000000099',true)$$,'42501',null,'institutional or other organization blocked');
select throws_ok($$select public.staging_prepare_aps_v1('362db1a9-bfdd-4334-9436-46b1c0117eab',false)$$,'42501',null,'synthetic acknowledgement mandatory');
select lives_ok($$select public.staging_prepare_aps_v1('362db1a9-bfdd-4334-9436-46b1c0117eab',true)$$,'synthetic administrator prepares only synthetic flags');
select lives_ok($$select public.staging_prepare_aps_v1('362db1a9-bfdd-4334-9436-46b1c0117eab',true)$$,'setup is idempotent');
reset role;
select is((select count(*) from public.feature_flags where organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab' and unit_id is null and key in ('esf.producao','esf.producao.catalog_approved','ux_aps_v3')),3::bigint,'exactly three flags after repeated setup');
select is((select count(*) from public.esf_production where organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),0::bigint,'setup creates no production entries');
update public.feature_flags set enabled=false where organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab' and key='esf.producao';
set local role authenticated;
select throws_ok($$select public.staging_prepare_aps_v1('362db1a9-bfdd-4334-9436-46b1c0117eab',true)$$,'22023',null,'existing disabled configuration is preserved');
reset role;
select is((select enabled from public.feature_flags where organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab' and key='esf.producao'),false,'disabled flag remains disabled');
set local role anon;
select throws_ok($$select public.staging_prepare_aps_v1('362db1a9-bfdd-4334-9436-46b1c0117eab',true)$$,'42501',null,'anonymous invocation blocked');
reset role;
select * from finish();
rollback;
