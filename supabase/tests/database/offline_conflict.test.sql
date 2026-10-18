-- Disposable LOCAL database only. All fixtures and mutations roll back.
begin;
select no_plan();
create temp table original_command as select md5(pg_get_functiondef('public.update_action(uuid,integer,uuid,jsonb)'::regprocedure)) definition;
insert into auth.users(id,email,raw_user_meta_data) values
 ('93700000-0000-4000-8000-000000000001','offline-manager@example.invalid','{"name":"Synthetic manager"}'),
 ('93700000-0000-4000-8000-000000000002','offline-reader@example.invalid','{"name":"Synthetic reader"}');
update public.profiles set status='ACTIVE' where id::text like '93700000%';
insert into public.organizations(id,name) values
 ('93700000-0000-4000-8000-000000000010','[HOMOLOGAÇÃO] Fixture local'),
 ('93700000-0000-4000-8000-000000000020','Não sintética');
insert into public.units(id,organization_id,name) values
 ('93700000-0000-4000-8000-000000000011','93700000-0000-4000-8000-000000000010','UBS A'),
 ('93700000-0000-4000-8000-000000000012','93700000-0000-4000-8000-000000000010','UBS B'),
 ('93700000-0000-4000-8000-000000000021','93700000-0000-4000-8000-000000000020','UBS não sintética');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
 ('93700000-0000-4000-8000-000000000001','93700000-0000-4000-8000-000000000010','93700000-0000-4000-8000-000000000011','GERENTE_UBS',array['*'],array['visualizar','editar']),
 ('93700000-0000-4000-8000-000000000001','93700000-0000-4000-8000-000000000020',null,'GESTOR_ORGANIZACAO',array['*'],array['visualizar','editar']),
 ('93700000-0000-4000-8000-000000000002','93700000-0000-4000-8000-000000000010','93700000-0000-4000-8000-000000000011','LEITOR',array['*'],array['visualizar']);
insert into public.action_plans(id,organization_id,unit_id,origin_type,origin_id,title) values
 ('93700000-0000-4000-8000-000000000030','93700000-0000-4000-8000-000000000010','93700000-0000-4000-8000-000000000011','MANUAL','93700000-0000-4000-8000-000000000030','Plano local'),
 ('93700000-0000-4000-8000-000000000031','93700000-0000-4000-8000-000000000010','93700000-0000-4000-8000-000000000012','MANUAL','93700000-0000-4000-8000-000000000031','Plano UBS B'),
 ('93700000-0000-4000-8000-000000000032','93700000-0000-4000-8000-000000000020','93700000-0000-4000-8000-000000000021','MANUAL','93700000-0000-4000-8000-000000000032','Plano não sintético');
insert into public.actions(id,organization_id,unit_id,action_plan_id,what) values
 ('93700000-0000-4000-8000-000000000040','93700000-0000-4000-8000-000000000010','93700000-0000-4000-8000-000000000011','93700000-0000-4000-8000-000000000030','Ação A'),
 ('93700000-0000-4000-8000-000000000041','93700000-0000-4000-8000-000000000010','93700000-0000-4000-8000-000000000012','93700000-0000-4000-8000-000000000031','Ação B'),
 ('93700000-0000-4000-8000-000000000042','93700000-0000-4000-8000-000000000020','93700000-0000-4000-8000-000000000021','93700000-0000-4000-8000-000000000032','Ação não sintética');
set local role authenticated;
select throws_ok($$select public.staging_update_action('93700000-0000-4000-8000-000000000040',1,gen_random_uuid(),'{"percentage":30}')$$,'42501',null,'JWT required');
select set_config('request.jwt.claim.sub','93700000-0000-4000-8000-000000000001',true);
select is((public.staging_update_action('93700000-0000-4000-8000-000000000040',1,'93700000-0000-4000-8000-000000000050','{"percentage":60,"comment":"Atualização sintética"}')->>'version')::integer,2,'valid write increments version');
select is(public.staging_update_action('93700000-0000-4000-8000-000000000040',1,'93700000-0000-4000-8000-000000000050','{"percentage":60,"comment":"Atualização sintética"}')->>'duplicate','true','retry returns original result');
select throws_ok($$select public.staging_update_action('93700000-0000-4000-8000-000000000040',1,gen_random_uuid(),'{"percentage":30}')$$,'PT409',null,'stale version becomes HTTP 409 without serialization retries');
select is((select percentage::integer from public.actions where id='93700000-0000-4000-8000-000000000040'),60,'conflict preserves server version');
select throws_ok($$select public.staging_update_action('93700000-0000-4000-8000-000000000041',1,gen_random_uuid(),'{"percentage":30}')$$,'P0002',null,'other UBS hidden');
select throws_ok($$select public.staging_update_action('93700000-0000-4000-8000-000000000042',1,gen_random_uuid(),'{"percentage":30}')$$,'42501',null,'non-synthetic organization rejected even with editing rights');
select set_config('request.jwt.claim.sub','93700000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.staging_update_action('93700000-0000-4000-8000-000000000040',2,gen_random_uuid(),'{"percentage":30}')$$,'42501',null,'reader cannot resolve');
reset role;
update public.memberships set ends_at=now()-interval '1 second' where user_id='93700000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','93700000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.staging_update_action('93700000-0000-4000-8000-000000000040',1,'93700000-0000-4000-8000-000000000050','{"percentage":60}')$$,'P0002',null,'revoked membership cannot replay cached result');
reset role;
select is((select version from public.actions where id='93700000-0000-4000-8000-000000000040'),2,'retry and conflict never double-update');
select is(md5(pg_get_functiondef('public.update_action(uuid,integer,uuid,jsonb)'::regprocedure)),(select definition from original_command),'original command definition unchanged');
select is((select prosecdef from pg_proc where oid='public.staging_update_action(uuid,integer,uuid,jsonb)'::regprocedure),false,'adapter is SECURITY INVOKER');
select ok(not has_function_privilege('anon','public.staging_update_action(uuid,integer,uuid,jsonb)','EXECUTE'),'anonymous execution denied');
select is((select count(*) from public.action_comments where action_id='93700000-0000-4000-8000-000000000040'),1::bigint,'audit comment persisted once');
select * from finish();
rollback;
