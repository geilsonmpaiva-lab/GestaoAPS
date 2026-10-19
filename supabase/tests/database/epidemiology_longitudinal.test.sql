-- Only disposable fixtures. The whole test, including snapshots, rolls back.
begin;
select no_plan();
insert into auth.users(id,email) values
('95900000-0000-4000-8000-000000000001','long-admin@example.invalid'),
('95900000-0000-4000-8000-000000000002','long-reader@example.invalid');
update public.profiles set status='ACTIVE' where id::text like '95900000%';
insert into public.organizations(id,name) values('362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] Longitudinal SQL') on conflict do nothing;
insert into public.units(id,organization_id,name) values
('95900000-0000-4000-8000-000000000011','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS A'),
('95900000-0000-4000-8000-000000000012','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS B');
insert into public.esf_teams(id,organization_id,unit_id,name,code) values
('95900000-0000-4000-8000-000000000021','362db1a9-bfdd-4334-9436-46b1c0117eab','95900000-0000-4000-8000-000000000011','Equipe A','LONG-A'),
('95900000-0000-4000-8000-000000000022','362db1a9-bfdd-4334-9436-46b1c0117eab','95900000-0000-4000-8000-000000000012','Equipe B','LONG-B');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
('95900000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab',null,'ADMIN_SISTEMA',array['*'],array['visualizar']),
('95900000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab','95900000-0000-4000-8000-000000000012','LEITOR',array['*'],array['visualizar']);
insert into app.epi_grants_v1(user_id,organization_id,areas,municipal,nominal,can_write,can_review,can_validate,can_close) values
('95900000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab',array['hanseniase','tuberculose'],true,true,true,true,true,true);
insert into app.epi_grants_v1(user_id,organization_id,unit_id,areas) values
('95900000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab','95900000-0000-4000-8000-000000000012',array['hanseniase']);
create temp table long_requests(key text primary key,req jsonb);
grant all on long_requests to authenticated;
create function pg_temp.long_req() returns jsonb language sql as $$ select jsonb_build_object(
 'organizationId','362db1a9-bfdd-4334-9436-46b1c0117eab','unitId','95900000-0000-4000-8000-000000000011','teamId','95900000-0000-4000-8000-000000000021',
 'area','hanseniase','month','2028-03','action','save','caseId',gen_random_uuid(),'entityId',gen_random_uuid(),'operationId',gen_random_uuid(),'deviceId',gen_random_uuid(),'localTimestamp',now(),
 'synthetic',true,'expectedVersion',0,'headers',jsonb_build_object('filledBy','[SINTÉTICO] Responsável'),
 'payload',jsonb_build_object('name','[SINTÉTICO] Caso SQL','notificationDate','2028-03-01','followUpDate','2028-03-02','sinan','00001','classification','AMBÍGUO','contacts',0)); $$;
insert into long_requests values('base',pg_temp.long_req());
select set_config('request.jwt.claim.sub','95900000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$select * from app.epi_long_cases_v1$$,'42501',null,'direct nominal access denied');
select lives_ok($$select public.staging_epidemiology_longitudinal_v1(req) from long_requests where key='base'$$,'new case and first visit created');
select is((select public.staging_epidemiology_longitudinal_v1(req)->>'version' from long_requests where key='base'),'1','exact replay is idempotent');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('operationId',gen_random_uuid())) from long_requests where key='base'$$,'PT409',null,'stale version rejected');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('operationId',gen_random_uuid(),'month','2028-04')) from long_requests where key='base'$$,'42501',null,'same case cannot reuse visit id in another month');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('operationId',gen_random_uuid(),'caseId',gen_random_uuid())) from long_requests where key='base'$$,'42501',null,'other case cannot reuse visit id');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('organizationId',gen_random_uuid())) from long_requests where key='base'$$,'42501',null,'other organization denied before replay');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(pg_temp.long_req()||'{"payload":{"name":"Real"}}')$$,'22023',null,'real names rejected');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(pg_temp.long_req()||'{"payload":{"name":"[SINTÉTICO] Caso","contacts":-1}}')$$,'22023',null,'negative counts rejected');
insert into long_requests select 'report',req||jsonb_build_object('action','report','scope','team','team',req->'teamId','nominal',true) from long_requests where key='base';
select is((select public.staging_epidemiology_longitudinal_v1(req)->>'total' from long_requests where key='report'),'1','report includes visit once');
select is((select public.staging_epidemiology_longitudinal_v1(req)->'teams'->0->'records'->0->'payload'->>'sinan' from long_requests where key='report'),'00001','text code preserved');
insert into long_requests select 'next',req||jsonb_build_object('operationId',gen_random_uuid(),'entityId',gen_random_uuid(),'month','2028-04') from long_requests where key='base';
select lives_ok($$select public.staging_epidemiology_longitudinal_v1(req) from long_requests where key='next'$$,'second month adds visit to same case');
select is((select jsonb_array_length(public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','load','case',req->'caseId'))->'history') from long_requests where key='base'),2,'longitudinal history spans two months');
insert into long_requests select 'close',req||jsonb_build_object('action','month-close','operationId',gen_random_uuid()) from long_requests where key='base';
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req) from long_requests where key='close'$$,'22023',null,'pending visit prevents close');
select is((select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','submit','operationId',gen_random_uuid(),'expectedVersion',1))->>'status' from long_requests where key='base'),'SUBMITTED','submit');
select is((select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','review','operationId',gen_random_uuid(),'expectedVersion',2))->>'status' from long_requests where key='base'),'REVIEWED','review');
select is((select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','validate','operationId',gen_random_uuid(),'expectedVersion',3))->>'status' from long_requests where key='base'),'VALIDATED','validate');
select throws_ok($$select public.staging_epidemiology_monthly_v1(req||jsonb_build_object('action','close','team',req->'teamId','noActivity',true,'reason','Ausência sintética confirmada')) from long_requests where key='close'$$,'22023',null,'old client cannot close partial snapshot');
select is((select public.staging_epidemiology_longitudinal_v1(req)->>'revision' from long_requests where key='close'),'1','combined monthly snapshot closed');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','return','operationId',gen_random_uuid(),'expectedVersion',4,'reason','Correção sintética solicitada')) from long_requests where key='base'$$,'22023',null,'closed month freezes visits');
reset role;
select is((select count(*)::int from app.epi_long_cases_v1),1,'single permanent case');
select is((select count(*)::int from app.epi_long_visits_v1),2,'one visit per competency');
select throws_ok($$update app.epi_long_cases_v1 set initial='{}'$$,null,null,'initial case history immutable');
select throws_ok($$delete from app.epi_long_events_v1$$,null,null,'audit cannot be deleted');
create temp table frozen as select snapshot from app.epi_month_snapshots_v1 where competency='2028-03';
select set_config('request.jwt.claim.sub','95900000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req) from long_requests where key='base'$$,'42501',null,'different user cannot replay saved command');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req) from long_requests where key='report'$$,'42501',null,'UBS B cannot export UBS A');
select is((select public.staging_epidemiology_longitudinal_v1(req||'{"action":"report","scope":"unit","nominal":false,"unitId":"95900000-0000-4000-8000-000000000012"}')->>'total' from long_requests where key='base'),'0','reader sees only own consolidated scope');
select set_config('request.jwt.claim.sub','95900000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','month-reopen','operationId',gen_random_uuid(),'expectedVersion',1,'reason','Correção sintética autorizada')) from long_requests where key='close'$$,'monthly reopening explicit');
select lives_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','return','operationId',gen_random_uuid(),'expectedVersion',4,'reason','Correção sintética autorizada')) from long_requests where key='base'$$,'visit can return only after monthly reopening');
reset role;
select is((select snapshot from app.epi_month_snapshots_v1 where competency='2028-03'),(select snapshot from frozen),'closed historical snapshot unchanged');
-- Explicit adoption retains the source row and suppresses only its same-month duplicate.
insert into app.epi_cases_v1(id,organization_id,unit_id,team_id,area,competency,status,payload,created_by,updated_by) values
('95900000-0000-4000-8000-000000000031','362db1a9-bfdd-4334-9436-46b1c0117eab','95900000-0000-4000-8000-000000000011','95900000-0000-4000-8000-000000000021','hanseniase','2028-05','VALIDATED','{"name":"[SINTÉTICO] Origem","sinan":"00007","classification":"AMBÍGUO","contacts":0}','95900000-0000-4000-8000-000000000001','95900000-0000-4000-8000-000000000001');
create temp table original_source as select to_jsonb(c) value from app.epi_cases_v1 c where id='95900000-0000-4000-8000-000000000031';
insert into long_requests select 'adopt',pg_temp.long_req()||'{"month":"2028-05","sourceId":"95900000-0000-4000-8000-000000000031"}';
set local role authenticated;
select lives_ok($$select public.staging_epidemiology_longitudinal_v1(req) from long_requests where key='adopt'$$,'source adoption explicit');
select is((select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','report','scope','team','team',req->'teamId','nominal',true))->>'total' from long_requests where key='adopt'),'1','source not double counted in same month');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('operationId',gen_random_uuid(),'entityId',gen_random_uuid(),'caseId',gen_random_uuid())) from long_requests where key='adopt'$$,'PT409',null,'source cannot be adopted twice');
reset role;
select is((select to_jsonb(c) from app.epi_cases_v1 c where id='95900000-0000-4000-8000-000000000031'),(select value from original_source),'adoption preserves original source byte for byte');
set local role authenticated;
select lives_ok($$select public.staging_epidemiology_longitudinal_v1(pg_temp.long_req()||'{"month":"2028-05","headers":{"filledBy":"[SINTÉTICO] Outro responsável"}}')$$,'second record retains its own header');
select is((select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','report','scope','team','team',req->'teamId','nominal',true))->'teams'->0->>'headerConflict' from long_requests where key='adopt'),'true','divergent headers are explicit');
reset role;
update app.epi_long_visits_v1 set status='VALIDATED' where competency='2028-05' and updated_by='95900000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req||jsonb_build_object('action','month-close','operationId',gen_random_uuid())) from long_requests where key='adopt'$$,'22023',null,'divergent headers block closure even with validated visits');
reset role;
-- Stage 4 gateway: active device, durable conflict and immutable replay.
insert into public.devices(id,user_id,organization_id) values('95900000-0000-4000-8000-000000000041','95900000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab');
insert into long_requests select 'offline',jsonb_build_object('kind','command','organizationId','362db1a9-bfdd-4334-9436-46b1c0117eab','unitId','95900000-0000-4000-8000-000000000011','team','95900000-0000-4000-8000-000000000021','area','hanseniase','month','2028-08','deviceId','95900000-0000-4000-8000-000000000041','baseline',null,'command',pg_temp.long_req()||'{"month":"2028-08","deviceId":"95900000-0000-4000-8000-000000000041"}');
set local role authenticated;
select is((select public.staging_epi_long_offline_v1(req)->>'status' from long_requests where key='offline'),'confirmed','offline gateway confirms only durable server command');
select is((select public.staging_epi_long_offline_v1(req)->'result'->>'version' from long_requests where key='offline'),'1','lost-response replay does not duplicate visit');
select lives_ok($$select public.staging_epidemiology_longitudinal_v1((req->'command')||jsonb_build_object('organizationId',req->'organizationId','unitId',req->'unitId','expectedVersion',1,'operationId',gen_random_uuid())) from long_requests where key='offline'$$,'concurrent online edit');
insert into long_requests select 'conflict',jsonb_set(req,'{command}',(req->'command')||jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',1)) from long_requests where key='offline';
select is((select public.staging_epi_long_offline_v1(req)->>'status' from long_requests where key='conflict'),'conflict','stale offline visit creates durable conflict');
select is((select public.staging_epi_long_offline_v1(req)->'server'->>'version' from long_requests where key='conflict'),'2','conflict returns authorized server version');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1((req->'command')||jsonb_build_object('organizationId',req->'organizationId','unitId',req->'unitId','expectedVersion',2,'operationId',gen_random_uuid())) from long_requests where key='offline'$$,'PT409',null,'old online client also blocked while case has unresolved conflict');
insert into long_requests select 'resolution',(req-'command'-'baseline')||jsonb_build_object('kind','resolve','conflictId',public.staging_epi_long_offline_v1(req)->'conflictId','operationId',gen_random_uuid(),'decision','KEEP_SERVER','expectedServerVersion',2,'justification','Decisão sintética após conferir duas versões') from long_requests where key='conflict';
select is((select public.staging_epi_long_offline_v1(req)->>'status' from long_requests where key='resolution'),'resolved','explicit authorized resolution');
select is((select public.staging_epi_long_offline_v1(req)->>'status' from long_requests where key='resolution'),'resolved','resolution replay is idempotent');
select throws_ok($$select public.staging_epi_long_offline_v1(req||jsonb_build_object('operationId',gen_random_uuid(),'decision',null)) from long_requests where key='resolution'$$,'22023',null,'missing decision cannot resolve conflict');
select is((select public.staging_epi_long_offline_v1((req-'command'-'baseline')||jsonb_build_object('kind','prepare','case',req->'command'->'caseId'))->'data'->'visit'->>'version' from long_requests where key='offline'),'2','keep server never overwrites its payload');
select is((select jsonb_array_length(public.staging_epi_long_offline_v1((req-'command'-'baseline')||jsonb_build_object('kind','prepare','case',req->'command'->'caseId'))->'data'->'cases') from long_requests where key='offline'),0,'offline preparation excludes other case registry names');
insert into long_requests select 'file',(req-'command'-'baseline')||jsonb_build_object('kind','attachment-reserve','attachmentId','95900000-0000-4000-8000-000000000051','visitId',req->'command'->'entityId','fileName','[SINTÉTICO] comprovante.pdf','contentType','application/pdf','byteSize',4,'sha256',encode(extensions.digest('test','sha256'),'hex')) from long_requests where key='offline';
select is((select public.staging_epi_long_offline_v1(req)->>'status' from long_requests where key='file'),'PENDING','private attachment reservation');
select is((select public.staging_epi_long_offline_v1(req)->>'status' from long_requests where key='file'),'PENDING','same attachment reservation resumes without duplicate');
select throws_ok($$select public.staging_epi_long_offline_v1(req||'{"fileName":"outra.pdf"}') from long_requests where key='file'$$,'PT409',null,'reservation cannot be overwritten');
select throws_ok($$select public.staging_epidemiology_longitudinal_v1((req->'command')||jsonb_build_object('organizationId',req->'organizationId','unitId',req->'unitId','action','submit','expectedVersion',2,'operationId',gen_random_uuid())) from long_requests where key='offline'$$,'22023',null,'pending attachment prevents critical transition');
select throws_ok($$select public.staging_epi_long_offline_v1(req||jsonb_build_object('kind','attachment-finalize','observedSize',4,'observedSha256',req->'sha256')) from long_requests where key='file'$$,'22023',null,'missing storage object cannot be confirmed');
reset role;
insert into storage.objects(bucket_id,name,owner_id,metadata) select 'epi-longitudinal-synthetic',object_path,created_by::text,'{"size":4,"mimetype":"application/pdf"}' from app.epi_long_files_v1 where id='95900000-0000-4000-8000-000000000051';
set local role authenticated;
select throws_ok($$select public.staging_epi_long_offline_v1(req||jsonb_build_object('kind','attachment-finalize','observedSize',5,'observedSha256',req->'sha256')) from long_requests where key='file'$$,'22023',null,'observed size mismatch blocked');
select is((select public.staging_epi_long_offline_v1(req||jsonb_build_object('kind','attachment-finalize','observedSize',4,'observedSha256',req->'sha256'))->>'status' from long_requests where key='file'),'AVAILABLE','confirmed metadata after observed integrity check');
select is((select count(*)::int from storage.objects where bucket_id='epi-longitudinal-synthetic'),1,'authorized nominal actor can read private object');
reset role;
update public.devices set revoked_at=now() where id='95900000-0000-4000-8000-000000000041';
set local role authenticated;
select throws_ok($$select public.staging_epi_long_offline_v1(req) from long_requests where key='offline'$$,'42501',null,'device revocation checked before replay');
reset role;
update public.devices set revoked_at=null,last_verified_at=now()-interval '73 hours' where id='95900000-0000-4000-8000-000000000041';
set local role authenticated;
select throws_ok($$select public.staging_epi_long_offline_v1(req) from long_requests where key='offline'$$,'42501',null,'expired device denied before replay');
select set_config('request.jwt.claim.sub','95900000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from storage.objects where bucket_id='epi-longitudinal-synthetic'),0,'other UBS cannot read private objects');
reset role;
select set_config('request.jwt.claim.sub','95900000-0000-4000-8000-000000000001',true);
select throws_ok($$delete from app.epi_long_offline_receipts_v1$$,null,null,'offline receipts append only');
update app.epi_grants_v1 set can_write=false where user_id='95900000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.staging_epidemiology_longitudinal_v1(req) from long_requests where key='base'$$,'42501',null,'revocation checked before idempotent replay');
reset role;
select ok(not has_function_privilege('anon','public.staging_epidemiology_longitudinal_v1(jsonb)','execute'),'anonymous cannot call public wrapper');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and c.relname in ('epi_long_cases_v1','epi_long_visits_v1','epi_long_events_v1','epi_long_receipts_v1') and c.relrowsecurity),4,'all new tables have RLS');
select * from finish();
rollback;
