-- Isolated fixtures. Run with `supabase test db` on a disposable local database.
-- Everything, including auth identities and audit/outbox records, rolls back.
begin;
select no_plan();

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('90000000-0000-4000-8000-000000000001','mvp-v2-test@example.invalid',now(),'{"name":"Teste MVP v2"}');
insert into public.organizations(id,name) values
 ('90000000-0000-4000-8000-000000000010','Organização sintética v2'),
 ('90000000-0000-4000-8000-000000000020','Organização isolada v2');
insert into public.units(id,organization_id,name) values
 ('90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000010','UBS sintética v2'),
 ('90000000-0000-4000-8000-000000000021','90000000-0000-4000-8000-000000000020','UBS isolada v2');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
 ('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011','GERENTE_UBS',array['*'],array['visualizar','criar','editar','executar','aprovar','publicar','encerrar']);
insert into public.protocols(id,organization_id,unit_id,code,title,domain) values
 ('90000000-0000-4000-8000-000000000100','90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011','MVP-V2-TEST','Protocolo sintético v2','QUALIDADE');
insert into public.protocol_versions(id,organization_id,unit_id,protocol_id,version_number,content,status,valid_from) values
 ('90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000100',1,'{"instructions":"Fixture sintética"}','RASCUNHO',current_date);
insert into public.action_plans(id,organization_id,unit_id,origin_type,origin_id,title) values
 ('90000000-0000-4000-8000-000000000200','90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011','MANUAL','90000000-0000-4000-8000-000000000200','Plano sintético v2');
insert into public.actions(id,organization_id,unit_id,action_plan_id,what,status,completed_at) values
 ('90000000-0000-4000-8000-000000000201','90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000200','Ação aberta de teste','NAO_INICIADO',null),
 ('90000000-0000-4000-8000-000000000202','90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000200','Ação encerrada de teste','CONCLUIDO',now());
insert into public.devices(id,user_id,organization_id,last_verified_at) values
 ('90000000-0000-4000-8000-000000000300','90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000010',now());
create temp table test_results(key text primary key, value jsonb);
grant all on test_results to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

insert into test_results values('form',public.save_protocol_form('90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000400','Checklist sintético','[{"key":"quantidade","label":"Quantidade","type":"number","required":true}]'));
select is(public.save_protocol_form('90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000400','Checklist sintético','[{"key":"quantidade","label":"Quantidade","type":"number","required":true}]'),(select value from test_results where key='form'),'checklist replay returns original response');
select is((select count(*) from public.form_versions where protocol_version_id='90000000-0000-4000-8000-000000000101'),1::bigint,'checklist replay does not insert a second snapshot');
select throws_ok($$select public.save_protocol_form('90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000400','Changed payload','[{"key":"quantidade","label":"Quantidade","type":"number","required":true}]')$$,'22023',null,'changed payload with same operation is rejected');
select throws_ok($$update public.form_versions set schema='{}' where protocol_version_id='90000000-0000-4000-8000-000000000101'$$,'55000',null,'saved checklist snapshot is immutable');

update public.protocol_versions set status='PUBLICADO' where id='90000000-0000-4000-8000-000000000101';
select throws_ok($$insert into public.form_versions(organization_id,unit_id,protocol_version_id,name,version_number,schema) values('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000101','Late checklist',2,'{"fields":[]}')$$,'55000',null,'direct late checklist insert cannot change a published protocol');
insert into test_results values('execution',public.start_protocol_execution('90000000-0000-4000-8000-000000000102','90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000011','90000000-0000-4000-8000-000000000401'));
select throws_ok($$select public.complete_execution('90000000-0000-4000-8000-000000000102',1,'90000000-0000-4000-8000-000000000402','{}')$$,'22023',null,'required checklist answers block premature completion');
insert into test_results values('responses',public.save_execution_responses('90000000-0000-4000-8000-000000000102',1,'90000000-0000-4000-8000-000000000403','[{"fieldKey":"quantidade","value":7}]'));
select is(public.save_execution_responses('90000000-0000-4000-8000-000000000102',1,'90000000-0000-4000-8000-000000000403','[{"fieldKey":"quantidade","value":7}]'),(select value from test_results where key='responses'),'response retry does not bump execution version');
select is((select version from public.executions where id='90000000-0000-4000-8000-000000000102'),2,'response save increments execution version');
select throws_ok($$select public.save_execution_responses('90000000-0000-4000-8000-000000000102',1,'90000000-0000-4000-8000-000000000404','[{"fieldKey":"quantidade","value":8}]')$$,'40001',null,'stale response version conflicts');
select throws_ok($$select public.save_execution_responses('90000000-0000-4000-8000-000000000102',2,'90000000-0000-4000-8000-000000000405','[{"fieldKey":"quantidade","value":"seven"}]')$$,'22023',null,'response type is validated');
select lives_ok($$select public.complete_execution('90000000-0000-4000-8000-000000000102',2,'90000000-0000-4000-8000-000000000406','{}')$$,'execution with saved required answers can complete');
select throws_ok($$select public.save_execution_responses('90000000-0000-4000-8000-000000000102',3,'90000000-0000-4000-8000-000000000407','[{"fieldKey":"quantidade","value":9}]')$$,'22023',null,'closed execution rejects response edits');

insert into test_results values('draft_input','{"organizationId":"90000000-0000-4000-8000-000000000010","unitId":"90000000-0000-4000-8000-000000000011","title":"Documento sintético","type":"MANUAL","domain":"QUALIDADE"}');
insert into test_results select 'draft',public.create_mvp_record('knowledge','90000000-0000-4000-8000-000000000410',value) from test_results where key='draft_input';
select is(public.create_mvp_record('knowledge','90000000-0000-4000-8000-000000000410',(select value from test_results where key='draft_input')),(select value from test_results where key='draft'),'MVP creation retry returns original draft');
select is((select count(*) from public.knowledge_items where title='Documento sintético'),1::bigint,'MVP creation is deduplicated');
select throws_ok($$select public.create_mvp_record('knowledge','90000000-0000-4000-8000-000000000410',(select value||'{"title":"Alterado"}' from test_results where key='draft_input'))$$,'22023',null,'MVP changed replay payload rejected');
select throws_ok($$select public.create_mvp_record('knowledge','90000000-0000-4000-8000-000000000411',(select value||'{"organizationId":"90000000-0000-4000-8000-000000000020","unitId":"90000000-0000-4000-8000-000000000021"}' from test_results where key='draft_input'))$$,'42501',null,'MVP creation cannot cross tenant boundaries');

insert into test_results values('sync_base','{"operationId":"90000000-0000-4000-8000-000000000420","deviceId":"90000000-0000-4000-8000-000000000300","entityId":"90000000-0000-4000-8000-000000000201","organizationId":"90000000-0000-4000-8000-000000000010","unitId":"90000000-0000-4000-8000-000000000011","command":"ACTION_UPDATE_PROGRESS","entityType":"melhoria","expectedVersion":1,"occurredAt":"2026-09-09T00:00:00Z","payload":{"percentage":20,"status":"EM_ANDAMENTO"}}');
insert into test_results select 'sync_first',public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array(value))) from test_results where key='sync_base';
select is((select value#>>'{results,0,status}' from test_results where key='sync_first'),'accepted','first valid sync operation is accepted');
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select value from test_results where key='sync_base'))))#>>'{results,0,status}','accepted','accepted replay preserves accepted outcome');
select is((select version from public.actions where id='90000000-0000-4000-8000-000000000201'),2,'sync replay does not update action twice');
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select jsonb_set(value,'{payload,percentage}','30') from test_results where key='sync_base'))))#>>'{results,0,reason}','operation_payload_changed','same sync operation cannot change its payload');
insert into test_results select 'sync_unsupported',value||'{"operationId":"90000000-0000-4000-8000-000000000421","command":"UNSUPPORTED"}' from test_results where key='sync_base';
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select value from test_results where key='sync_unsupported'))))#>>'{results,0,status}','rejected','unsupported operation is rejected');
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select value from test_results where key='sync_unsupported'))))#>>'{results,0,status}','rejected','rejected replay never becomes duplicate acknowledgement');
insert into test_results select 'sync_conflict',value||'{"operationId":"90000000-0000-4000-8000-000000000422"}' from test_results where key='sync_base';
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select value from test_results where key='sync_conflict'))))#>>'{results,0,status}','conflict','stale sync operation creates conflict');
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select value from test_results where key='sync_conflict'))))#>>'{results,0,status}','conflict','conflict replay remains pending attention');
select is((select count(*) from public.sync_conflicts where entity_id='90000000-0000-4000-8000-000000000201'),1::bigint,'conflict retry preserves exactly one server/client snapshot');
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select value||'{"operationId":"90000000-0000-4000-8000-000000000423","expectedVersion":2}' from test_results where key='sync_base'))))#>>'{results,0,reason}','entity_conflict_open','another operation cannot mutate a conflicted entity');
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select value||'{"operationId":"90000000-0000-4000-8000-000000000424","entityId":"90000000-0000-4000-8000-000000000202"}' from test_results where key='sync_base'))))#>>'{results,0,reason}','entity_closed','sync cannot reopen a completed action');
select is(public.apply_sync_batch(jsonb_build_object('operations',jsonb_build_array((select value||'{"operationId":"90000000-0000-4000-8000-000000000425","entityId":"90000000-0000-4000-8000-000000000102","command":"EXECUTION_SAVE_DRAFT","expectedVersion":3,"payload":{"result":{}}}' from test_results where key='sync_base'))))#>>'{results,0,reason}','entity_closed','sync cannot overwrite a completed execution');

select * from finish();
rollback;
