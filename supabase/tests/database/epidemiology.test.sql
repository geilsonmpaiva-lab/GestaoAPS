-- Isolated synthetic fixtures; all writes rolled back.
begin;
select no_plan();
insert into auth.users(id,email) values
('94900000-0000-4000-8000-000000000001','epi-manager@example.invalid'),
('94900000-0000-4000-8000-000000000002','epi-municipal@example.invalid'),
('94900000-0000-4000-8000-000000000003','epi-reader@example.invalid');
update public.profiles set status='ACTIVE' where id::text like '94900000%';
insert into public.organizations(id,name) values('362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] Epidemiologia SQL') on conflict do nothing;
insert into public.units(id,organization_id,name) values
('94900000-0000-4000-8000-000000000011','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS A'),
('94900000-0000-4000-8000-000000000012','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS B');
insert into public.esf_teams(id,organization_id,unit_id,name,code) values
('94900000-0000-4000-8000-000000000021','362db1a9-bfdd-4334-9436-46b1c0117eab','94900000-0000-4000-8000-000000000011','Equipe A1','EPI-A1'),
('94900000-0000-4000-8000-000000000022','362db1a9-bfdd-4334-9436-46b1c0117eab','94900000-0000-4000-8000-000000000011','Equipe A2','EPI-A2'),
('94900000-0000-4000-8000-000000000023','362db1a9-bfdd-4334-9436-46b1c0117eab','94900000-0000-4000-8000-000000000012','Equipe B','EPI-B');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
('94900000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab','94900000-0000-4000-8000-000000000011','GERENTE_UBS',array['*'],array['visualizar']),
('94900000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab',null,'ADMIN_SISTEMA',array['*'],array['visualizar']),
('94900000-0000-4000-8000-000000000003','362db1a9-bfdd-4334-9436-46b1c0117eab','94900000-0000-4000-8000-000000000012','LEITOR',array['*'],array['visualizar']);
create temp table epi_requests(key text primary key,req jsonb); grant all on epi_requests to authenticated;
create function pg_temp.epi_req(a text default 'hanseniase') returns jsonb language sql as $$ select jsonb_build_object(
 'organizationId','362db1a9-bfdd-4334-9436-46b1c0117eab','unitId','94900000-0000-4000-8000-000000000011','teamId','94900000-0000-4000-8000-000000000021',
 'area',a,'competency','2028-01','action','save','entityId',gen_random_uuid(),'operationId',gen_random_uuid(),'deviceId',gen_random_uuid(),'localTimestamp',now(),
 'synthetic',true,'expectedVersion',0,'payload',jsonb_build_object('name','[SINTÉTICO] Pessoa SQL','date','2028-01-05','sinan','00001')); $$;
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req())$$,'42501',null,'administrator has no implicit epidemiology permission');
select throws_ok($$select * from app.epi_cases_v1$$,'42501',null,'direct nominal table access denied');
select throws_ok($$select * from app.epi_grants_v1$$,'42501',null,'cannot self grant epidemiology access');
reset role;
insert into app.epi_grants_v1(user_id,organization_id,unit_id,team_id,areas,nominal,can_write) values
('94900000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab','94900000-0000-4000-8000-000000000011','94900000-0000-4000-8000-000000000021',array['hanseniase','dengue'],true,true);
insert into app.epi_grants_v1(user_id,organization_id,areas,municipal,nominal,can_write,can_review,can_validate,can_close) values
('94900000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab',array['hanseniase','tuberculose','sifilis','hiv','obitos-infantis','obito-materno','obito-fetal','leishmaniose','dengue'],true,true,true,true,true,true);
insert into app.epi_grants_v1(user_id,organization_id,unit_id,areas) values
('94900000-0000-4000-8000-000000000003','362db1a9-bfdd-4334-9436-46b1c0117eab','94900000-0000-4000-8000-000000000012',array['hanseniase']);
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into epi_requests values('base',pg_temp.epi_req());
select lives_ok($$select public.staging_epidemiology_v1(req) from epi_requests where key='base'$$,'team writer creates synthetic case');
select is((select public.staging_epidemiology_v1(req)->>'version' from epi_requests where key='base'),'1','idempotent replay returns original version');
select throws_ok($$select public.staging_epidemiology_v1(req || '{"synthetic":false}') from epi_requests where key='base'$$,'22023',null,'synthetic acknowledgement mandatory');
select throws_ok($$select public.staging_epidemiology_v1(req || '{"organizationId":"94900000-0000-4000-8000-000000000099"}') from epi_requests where key='base'$$,'42501',null,'other organization blocked before replay');
select throws_ok($$select public.staging_epidemiology_v1(req || '{"unitId":"94900000-0000-4000-8000-000000000012"}') from epi_requests where key='base'$$,'42501',null,'other UBS blocked before replay');
select throws_ok($$select public.staging_epidemiology_v1(req || '{"teamId":"94900000-0000-4000-8000-000000000022"}') from epi_requests where key='base'$$,'42501',null,'other team in same UBS blocked before replay');
select throws_ok($$select public.staging_epidemiology_v1(req || '{"area":"hiv"}') from epi_requests where key='base'$$,'42501',null,'ungranted area blocked');
select throws_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req() || '{"payload":{"name":"Real name"}}')$$,'22023',null,'real name rejected by direct RPC');
select throws_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req() || '{"payload":{"name":"[SINTÉTICO] Pessoa","contacts":-1}}')$$,'22023',null,'negative count rejected by direct RPC');
select throws_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req() || '{"payload":{"name":"[SINTÉTICO] Pessoa","total":99}}')$$,'22023',null,'forged derived fields rejected');
select throws_ok($$select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',0)) from epi_requests where key='base'$$,'PT409',null,'concurrent stale edit conflicts');
insert into epi_requests values('load',jsonb_build_object('action','load','organizationId','362db1a9-bfdd-4334-9436-46b1c0117eab','unitId','94900000-0000-4000-8000-000000000011','area','hanseniase','month','2028-01'));
select is((select public.staging_epidemiology_v1(req)->>'total' from epi_requests where key='load'),'1','resend did not duplicate count');
select is((select public.staging_epidemiology_v1(req)->>'municipal' from epi_requests where key='load'),'false','unit user has no municipal summary');
select is((select jsonb_array_length(public.staging_epidemiology_v1(req)->'teams') from epi_requests where key='load'),1,'only assigned team returned');
select is((select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',1,'action','submit'))->>'status' from epi_requests where key='base'),'SUBMITTED','explicit submission');
select throws_ok($$select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',2,'action','review')) from epi_requests where key='base'$$,'42501',null,'writer cannot review without explicit grant');
select throws_ok($$select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',2)) from epi_requests where key='base'$$,'22023',null,'cannot edit during review');
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000002',true);
select is((select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',2,'action','review'))->>'status' from epi_requests where key='base'),'REVIEWED','explicit UBS review');
select is((select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',3,'action','validate'))->>'status' from epi_requests where key='base'),'VALIDATED','explicit technical validation');
select is((select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',4,'action','close'))->>'status' from epi_requests where key='base'),'CLOSED','explicit record close');
select throws_ok($$select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',5,'action','reopen')) from epi_requests where key='base'$$,'22023',null,'reopening requires reason');
select is((select public.staging_epidemiology_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',5,'action','reopen','reason','Revisão sintética autorizada'))->>'status' from epi_requests where key='base'),'DRAFT','reopen preserves audit snapshot');
select is((select public.staging_epidemiology_v1(req)->>'municipal' from epi_requests where key='load'),'true','municipal summary is explicitly granted');
select ok((select public.staging_epidemiology_v1(req)->'municipalSummary' from epi_requests where key='load')::text not like '%Pessoa%','municipal summary contains no nominal payload');
select lives_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req('hiv'))$$,'HIV form accepts shared fields');
select lives_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req('sifilis') || '{"payload":{"name":"[SINTÉTICO] Pessoa","classification":"TOXOPLASMOSE GESTACIONAL"}}')$$,'literal source classification retained, not inferred as syphilis');
select lives_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req('obito-fetal') || '{"payload":{"name":"[SINTÉTICO] Pessoa","gestationalWeeks":29}}')$$,'gestational weeks separate from age');
select lives_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req('obito-materno') || '{"payload":{"name":"[SINTÉTICO] Pessoa","age":26,"ageUnit":"Anos"}}')$$,'explicit age and unit');
select throws_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req('obitos-infantis') || '{"payload":{"name":"[SINTÉTICO] Pessoa","age":1}}')$$,'22023',null,'age without unit rejected');
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.staging_epidemiology_v1(req) from epi_requests where key='load'$$,'42501',null,'UBS B cannot list A');
select is((select public.staging_epidemiology_v1(req || '{"unitId":"94900000-0000-4000-8000-000000000012"}')->>'total' from epi_requests where key='load'),'0','aggregate-only user receives no nominal records');
select throws_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req() || '{"unitId":"94900000-0000-4000-8000-000000000012","teamId":"94900000-0000-4000-8000-000000000023"}')$$,'42501',null,'reader cannot write');
reset role;
select ok(not has_function_privilege('anon','public.staging_epidemiology_v1(jsonb)','execute'),'anonymous cannot invoke RPC');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname in ('epi_grants_v1','epi_cases_v1','epi_events_v1','epi_receipts_v1') and c.relrowsecurity),4,'all epidemiology tables have RLS');
select ok(exists(select 1 from app.epi_events_v1 where action='close' and snapshot->>'status'='CLOSED'),'closed snapshot preserved after reopening');
select throws_ok($$update app.epi_events_v1 set reason='overwrite'$$,null,null,'audit log append only');
update app.epi_grants_v1 set enabled=false where user_id='94900000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_v1(req) from epi_requests where key='base'$$,'42501',null,'revocation is checked before returning idempotent result');
reset role;
select * from finish();
rollback;
