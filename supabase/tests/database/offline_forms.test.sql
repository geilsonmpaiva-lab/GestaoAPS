-- LOCAL ONLY, all fixtures and operations roll back. Never run on shared hosting.
begin;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('93900000-0000-4000-8000-000000000001','forms-manager@example.invalid','{"name":"Synthetic"}'),
 ('93900000-0000-4000-8000-000000000002','forms-reader@example.invalid','{"name":"Reader"}');
update public.profiles set status='ACTIVE' where id::text like '93900000%';
insert into public.organizations(id,name) values('93900000-0000-4000-8000-000000000010','[HOMOLOGAÇÃO] Formulários locais');
insert into public.units(id,organization_id,name) values
 ('93900000-0000-4000-8000-000000000011','93900000-0000-4000-8000-000000000010','UBS A'),
 ('93900000-0000-4000-8000-000000000012','93900000-0000-4000-8000-000000000010','UBS B');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
 ('93900000-0000-4000-8000-000000000001','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011','GERENTE_UBS',array['*'],array['visualizar','criar','editar','executar','aprovar','publicar','encerrar','reabrir']),
 ('93900000-0000-4000-8000-000000000002','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000012','LEITOR',array['*'],array['visualizar']);
insert into public.devices(id,user_id,organization_id,last_verified_at) values
 ('93900000-0000-4000-8000-000000000020','93900000-0000-4000-8000-000000000001','93900000-0000-4000-8000-000000000010',now()),
 ('93900000-0000-4000-8000-000000000021','93900000-0000-4000-8000-000000000002','93900000-0000-4000-8000-000000000010',now());
select set_config('request.jwt.claim.sub','93900000-0000-4000-8000-000000000001',true);
insert into public.knowledge_items(id,organization_id,unit_id,title,type,domain) values('93900000-0000-4000-8000-000000000030','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011','Sintético','MANUAL','gestao');
insert into public.protocols(id,organization_id,unit_id,code,title,domain) values('93900000-0000-4000-8000-000000000040','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011','FORM-TEST','Sintético','QUALIDADE');
insert into public.indicators(id,organization_id,unit_id,code,name,definition,unit,periodicity,source,domain,better_direction) values('93900000-0000-4000-8000-000000000050','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011','FORM-TEST','Sintético','Definição sintética','unidade','MONTHLY','Teste','gestao','HIGHER');
insert into public.measurements(id,organization_id,unit_id,indicator_id,competency,value,status,origin_type) values('93900000-0000-4000-8000-000000000051','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011','93900000-0000-4000-8000-000000000050',current_date,1,'FORA_META','MANUAL');
insert into public.action_plans(id,organization_id,unit_id,origin_type,origin_id,title) values('93900000-0000-4000-8000-000000000060','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011','MANUAL','93900000-0000-4000-8000-000000000060','Plano sintético');
insert into public.meetings(id,organization_id,unit_id,title,starts_at) values('93900000-0000-4000-8000-000000000070','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011','Reunião sintética',now());
create temp table forms_results(key text primary key,value jsonb,envelope jsonb);
grant all on forms_results to authenticated;
create function pg_temp.form_envelope(res text,entity uuid,cmd text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
 snapshot:=app.offline_form_snapshot(res,entity,'93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011');
 return jsonb_build_object('organizationId','93900000-0000-4000-8000-000000000010','unitId','93900000-0000-4000-8000-000000000011','deviceId','93900000-0000-4000-8000-000000000020','entityId',entity,'resource',res,'command',cmd,'operationId',gen_random_uuid(),'expectedVersion',coalesce(snapshot->'record'->'version',snapshot->'record'->'version_number'),'expectedRecord',snapshot->'record','expectedRelated',snapshot->'related','payload',payload);
end;$$;
create function pg_temp.run_form(key text,res text,entity uuid,cmd text,payload jsonb) returns text language plpgsql as $$
declare env jsonb; answer jsonb; repeated jsonb;
begin
 env:=pg_temp.form_envelope(res,entity,cmd,payload);answer:=public.staging_offline_form(env);repeated:=public.staging_offline_form(env);
 insert into forms_results values(key,answer,env);
 if repeated->>'duplicate'<>'true' or repeated-'duplicate'<>answer then return 'duplicate_failed';end if;
 return answer->>'status';
end;$$;
set local role authenticated;
select is(pg_temp.run_form('knowledge','knowledge','93900000-0000-4000-8000-000000000030','versions','{"content":{"text":"Sintético"},"validFrom":"2026-01-01","references":[]}'),'confirmed','knowledge version and exact replay');
select is(pg_temp.run_form('protocol','protocols','93900000-0000-4000-8000-000000000040','versions','{"content":{"text":"Sintético"},"validFrom":"2026-01-01"}'),'confirmed','protocol version and replay');
select is(pg_temp.run_form('form','protocol-versions',(select (value->'result'->>'id')::uuid from forms_results where key='protocol'),'forms','{"name":"Checklist sintético","fields":[{"key":"quantidade","label":"Quantidade","type":"number","required":true}]}'),'confirmed','structured checklist and replay');
select is(pg_temp.run_form('formula','indicators','93900000-0000-4000-8000-000000000050','formulas','{"variables":["quantidade"],"expression":{"type":"variable","name":"quantidade"},"validFrom":"2026-01-01"}'),'confirmed','immutable formula and replay');
select is(pg_temp.run_form('binding','protocol-versions',(select (value->'result'->>'id')::uuid from forms_results where key='protocol'),'indicator-bindings',jsonb_build_object('indicatorId','93900000-0000-4000-8000-000000000050','formulaVersionId',(select value->'result'->>'id' from forms_results where key='formula'),'unitId','93900000-0000-4000-8000-000000000011')),'confirmed','formula binding and replay');
select is(pg_temp.run_form('target','indicators','93900000-0000-4000-8000-000000000050','targets','{"organizationId":"93900000-0000-4000-8000-000000000010","unitId":"93900000-0000-4000-8000-000000000011","startsOn":"2026-01-01","endsOn":"2026-12-31","comparison":"GTE","targetValue":90}'),'confirmed','target inserted once');
reset role;
update public.protocol_versions set status='PUBLICADO' where protocol_id='93900000-0000-4000-8000-000000000040';
set local role authenticated;
select is(pg_temp.run_form('execution','protocol-versions',(select (value->'result'->>'id')::uuid from forms_results where key='protocol'),'executions','{"executionId":"93900000-0000-4000-8000-000000000041","unitId":"93900000-0000-4000-8000-000000000011"}'),'confirmed','execution start and replay');
select is(pg_temp.run_form('responses','executions','93900000-0000-4000-8000-000000000041','responses','{"responses":[{"fieldKey":"quantidade","value":7}]}'),'confirmed','typed checklist answers and replay');
select is(pg_temp.run_form('analysis','measurements','93900000-0000-4000-8000-000000000051','analysis','{"analysis":"Análise sintética","decision":"Decisão sintética"}'),'confirmed','critical analysis and replay');
select is(pg_temp.run_form('deviation','measurements','93900000-0000-4000-8000-000000000051','open-plan','{"title":"Plano sintético","description":"Desvio sintético","classification":"MINOR"}'),'confirmed','deviation and plan created once');
select is(pg_temp.run_form('action','action-plans','93900000-0000-4000-8000-000000000060','actions','{"what":"Ação sintética","whoId":"93900000-0000-4000-8000-000000000001","howMuch":0}'),'confirmed','5W2H action and replay');
select is(pg_temp.run_form('agenda','meetings','93900000-0000-4000-8000-000000000070','agenda','{"position":1,"title":"Pauta sintética"}'),'confirmed','agenda and replay');
select is(pg_temp.run_form('presence','meetings','93900000-0000-4000-8000-000000000070','participants','{"userId":"93900000-0000-4000-8000-000000000001","attended":true}'),'confirmed','attendance and replay');
select is(pg_temp.run_form('referral','meetings','93900000-0000-4000-8000-000000000070','referrals','{"description":"Encaminhamento sintético","responsibleId":"93900000-0000-4000-8000-000000000001"}'),'confirmed','referral and replay');
select is((select count(*) from public.actions where action_plan_id='93900000-0000-4000-8000-000000000060'),1::bigint,'action not duplicated');
select is((select count(*) from public.targets where indicator_id='93900000-0000-4000-8000-000000000050'),1::bigint,'target not duplicated');
select throws_ok($$select public.staging_offline_form((select envelope||'{"payload":{"position":2,"title":"Changed payload"}}' from forms_results where key='agenda'))$$,'22023',null,'same operation cannot change payload');
select throws_ok($$select public.staging_offline_form((select envelope||'{"unitId":"93900000-0000-4000-8000-000000000012"}' from forms_results where key='agenda'))$$,'42501',null,'other UBS rejected');
select throws_ok($$select app.offline_form_snapshot('meetings','93900000-0000-4000-8000-000000000070','93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000011')$$,'42501',null,'private helper cannot be invoked directly');
insert into forms_results values('stale',null,pg_temp.form_envelope('meetings','93900000-0000-4000-8000-000000000070','agenda','{"position":2,"title":"Pauta offline"}'));
select pg_temp.run_form('concurrent','meetings','93900000-0000-4000-8000-000000000070','agenda','{"position":3,"title":"Pauta concorrente"}');
select is(public.staging_offline_form((select envelope from forms_results where key='stale'))->>'status','conflict','related change without parent version bump conflicts');
select is(public.staging_offline_form((select envelope from forms_results where key='stale'))->>'duplicate','true','conflict replay stays a conflict');
insert into forms_results select 'resolved',null,pg_temp.form_envelope('meetings','93900000-0000-4000-8000-000000000070','agenda',envelope->'payload')||jsonb_build_object('decision','RETRY','sourceOperationId',envelope->>'operationId','justification','Pauta atual revisada explicitamente') from forms_results where key='stale';
select is(public.staging_offline_form((select envelope from forms_results where key='resolved'))->>'status','resolved','explicit retry validates current snapshot');
select is(public.staging_offline_form((select envelope from forms_results where key='resolved'))->>'duplicate','true','resolution replay not duplicated');
select set_config('request.jwt.claim.sub','93900000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.staging_offline_form((select envelope||'{"deviceId":"93900000-0000-4000-8000-000000000021"}' from forms_results where key='agenda'))$$,'42501',null,'reader cannot obtain another actors result');
reset role;
update public.devices set revoked_at=now() where id='93900000-0000-4000-8000-000000000020';
set local role authenticated;
select set_config('request.jwt.claim.sub','93900000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.staging_offline_form((select envelope from forms_results where key='agenda'))$$,'42501',null,'revoked device cannot read cached result');
reset role;
select is((select count(*) from app.offline_transition_receipts where organization_id='93900000-0000-4000-8000-000000000010' and response->>'status'='confirmed'),15::bigint,'one receipt per successful command');
select is((select count(*) from public.audit_log where organization_id='93900000-0000-4000-8000-000000000010' and action='OFFLINE_FORM_RESOLVED'),1::bigint,'one resolution audit');
select ok(not has_function_privilege('anon','public.staging_offline_form(jsonb)','execute'),'anonymous form RPC disabled');
select is((select prosecdef from pg_proc where oid='public.staging_offline_form(jsonb)'::regprocedure),false,'public gateway security invoker');
select * from finish();
rollback;
