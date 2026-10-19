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
-- Monthly revisions use a fresh synthetic period and remain entirely rollback-only.
create function pg_temp.epi_month_req(a text default 'close') returns jsonb language sql as $$ select jsonb_build_object(
 'organizationId','362db1a9-bfdd-4334-9436-46b1c0117eab','unitId','94900000-0000-4000-8000-000000000011','team','94900000-0000-4000-8000-000000000021',
 'area','hanseniase','month','2028-02','action',a,'operationId',gen_random_uuid(),'expectedVersion',0,'synthetic',true,
 'deviceId',gen_random_uuid(),'localTimestamp',now(),'reason','Fechamento sintético mensal'); $$;
insert into epi_requests values('monthly',pg_temp.epi_month_req());
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_monthly_v1(req) from epi_requests where key='monthly'$$,'42501',null,'writer cannot close monthly without explicit close grant');
select throws_ok($$select * from app.epi_month_snapshots_v1$$,'42501',null,'monthly nominal snapshots are not directly readable');
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.staging_epidemiology_monthly_v1(req) from epi_requests where key='monthly'$$,'22023',null,'empty month is not automatically zero activity');
select is((public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('load')||'{"scope":"team"}')->'teams'->0->>'noActivity'),'false','no records remains undeclared');
reset role;
insert into app.epi_cases_v1(id,organization_id,unit_id,team_id,area,competency,status,payload,created_by,updated_by)
select gen_random_uuid(),'362db1a9-bfdd-4334-9436-46b1c0117eab','94900000-0000-4000-8000-000000000011','94900000-0000-4000-8000-000000000021','hanseniase','2028-02',
 case when n=1 then 'DRAFT' else 'VALIDATED' end,jsonb_build_object('name','[SINTÉTICO] Mensal '||n,'date','2028-02-01','sinan','00001','contacts',0),
 '94900000-0000-4000-8000-000000000002','94900000-0000-4000-8000-000000000002' from generate_series(1,51) n;
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_monthly_v1(req) from epi_requests where key='monthly'$$,'22023',null,'monthly close requires technical validation of every record');
reset role;
update app.epi_cases_v1 set status='VALIDATED' where competency='2028-02';
set local role authenticated;
select is((select public.staging_epidemiology_monthly_v1(req)->>'revision' from epi_requests where key='monthly'),'1','first monthly revision closed');
select is((select public.staging_epidemiology_monthly_v1(req)->>'version' from epi_requests where key='monthly'),'1','identical command replay does not create another revision');
select is((public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team","nominal":true}')->'teams'->0->'records')::text like '%00001%',true,'identifier zeros preserved in closed snapshot');
select is(jsonb_array_length(public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team","nominal":true}')->'teams'->0->'records'),51,'export snapshot includes all records, not paginated 25');
select ok(not (public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team"}')->'teams'->0 ? 'records'),'aggregate export excludes nominal payload');
select throws_ok($$select public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"municipal","nominal":true}')$$,'22023',null,'municipal nominal export is prohibited');
select throws_ok($$select public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team","revision":999}')$$,'P0002',null,'unknown historical revision never falls back to live data');
select throws_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req()||'{"competency":"2028-02"}')$$,'22023',null,'old case RPC cannot insert into closed period');
reset role;
select throws_ok($$update app.epi_cases_v1 set payload=payload||'{"contacts":99}' where competency='2028-02'$$,'22023',null,'trigger also freezes direct updates to closed period');
select throws_ok($$update app.epi_month_snapshots_v1 set snapshot='{}'$$,null,null,'closed monthly revisions are immutable');
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('reopen')||'{"expectedVersion":0}')$$,'PT409',null,'stale monthly version conflicts');
select throws_ok($$select public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('reopen')||'{"expectedVersion":1,"reason":""}')$$,'22023',null,'monthly reopening requires a reason');
select is(public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('reopen')||'{"expectedVersion":1}')->>'status','OPEN','monthly reopen creates provisional state without replacing snapshot');
select is(public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team","revision":1}')->>'definitive','true','historical closed revision remains available after reopening');
select is(public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team"}')->>'definitive','false','current report is provisional after reopening');
select lives_ok($$select public.staging_epidemiology_v1(pg_temp.epi_req()||'{"competency":"2028-02"}')$$,'reopened month allows new record through original RPC');
reset role;
update app.epi_cases_v1 set status='VALIDATED' where competency='2028-02';
set local role authenticated;
select is(public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req()||'{"expectedVersion":2}')->>'revision','2','new close creates second revision');
select is(public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team","revision":1}')->>'total','51','previous revision count unchanged');
select is(public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team","revision":2}')->>'total','52','new revision includes new record exactly once');
select lives_ok($$select public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req()||'{"team":"94900000-0000-4000-8000-000000000022","noActivity":true}')$$,'empty month closes only with explicit justified declaration');
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team"}')$$,'42501',null,'reader B cannot export A');
select throws_ok($$select public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"team","nominal":true,"unitId":"94900000-0000-4000-8000-000000000012","team":"94900000-0000-4000-8000-000000000023"}')$$,'42501',null,'aggregate-only reader cannot request nominal export for own UBS');
select throws_ok($$select public.staging_epidemiology_monthly_v1(pg_temp.epi_month_req('report')||'{"scope":"municipal"}')$$,'42501',null,'unit reader cannot request municipal export');
reset role;
select ok(not has_function_privilege('anon','public.staging_epidemiology_monthly_v1(jsonb)','execute'),'anonymous cannot invoke monthly RPC');
select ok(exists(select 1 from app.epi_events_v1 where action='MONTH_EXPORT'),'exports are audited');
update app.epi_grants_v1 set enabled=false where user_id='94900000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_monthly_v1(req) from epi_requests where key='monthly'$$,'42501',null,'monthly receipt cannot bypass revocation');
reset role;
update app.epi_grants_v1 set enabled=false where user_id='94900000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','94900000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_v1(req) from epi_requests where key='base'$$,'42501',null,'revocation is checked before returning idempotent result');
reset role;
select * from finish();
rollback;
