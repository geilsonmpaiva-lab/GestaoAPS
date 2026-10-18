-- LOCAL disposable fixtures only. Never run on shared hosted projects.
begin;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('93800000-0000-4000-8000-000000000001','critical-manager@example.invalid','{"name":"Synthetic"}'),
 ('93800000-0000-4000-8000-000000000002','critical-reader@example.invalid','{"name":"Reader"}');
update public.profiles set status='ACTIVE' where id::text like '93800000%';
insert into public.organizations(id,name) values('93800000-0000-4000-8000-000000000010','[HOMOLOGAÇÃO] Transições locais');
insert into public.units(id,organization_id,name) values
 ('93800000-0000-4000-8000-000000000011','93800000-0000-4000-8000-000000000010','UBS A'),
 ('93800000-0000-4000-8000-000000000012','93800000-0000-4000-8000-000000000010','UBS B');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
 ('93800000-0000-4000-8000-000000000001','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','GERENTE_UBS',array['*'],array['visualizar','criar','editar','executar','aprovar','publicar','encerrar','reabrir']),
 ('93800000-0000-4000-8000-000000000002','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','LEITOR',array['*'],array['visualizar']);
insert into public.devices(id,user_id,organization_id,last_verified_at) values
 ('93800000-0000-4000-8000-000000000020','93800000-0000-4000-8000-000000000001','93800000-0000-4000-8000-000000000010',now()),
 ('93800000-0000-4000-8000-000000000021','93800000-0000-4000-8000-000000000002','93800000-0000-4000-8000-000000000010',now());
insert into public.knowledge_items(id,organization_id,unit_id,title,type,domain) values
 ('93800000-0000-4000-8000-000000000030','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','Conteúdo sintético','MANUAL','gestao');
insert into public.knowledge_versions(id,organization_id,unit_id,knowledge_item_id,version_number,content,status,valid_from) values
 ('93800000-0000-4000-8000-000000000031','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','93800000-0000-4000-8000-000000000030',1,'{"text":"Sintético"}','DRAFT',current_date);
create temp table commands(key text primary key,value jsonb);
grant all on commands to authenticated;
insert into commands select 'review',jsonb_build_object('organizationId',organization_id,'unitId',unit_id,'entityId',id,'operationId','93800000-0000-4000-8000-000000000040','deviceId','93800000-0000-4000-8000-000000000020','resource','knowledge-versions','command','transition','expectedVersion',1,'expectedRecord',to_jsonb(v),'expectedRelated','{}'::jsonb,'payload','{"targetStatus":"IN_REVIEW"}'::jsonb) from public.knowledge_versions v where id='93800000-0000-4000-8000-000000000031';
set local role authenticated;
select throws_ok($$select public.staging_offline_transition((select value from commands where key='review'))$$,'42501',null,'JWT required');
select set_config('request.jwt.claim.sub','93800000-0000-4000-8000-000000000001',true);
select is(public.staging_offline_transition((select value from commands where key='review'))->>'status','confirmed','review confirmed only by server');
select is(public.staging_offline_transition((select value from commands where key='review'))->>'duplicate','true','lost response returns original confirmation');
select throws_ok($$select public.staging_offline_transition((select jsonb_set(value,'{payload,targetStatus}','"PUBLISHED"') from commands where key='review'))$$,'22023',null,'same operation cannot change payload');
insert into commands select 'stale',jsonb_set(value,'{operationId}','"93800000-0000-4000-8000-000000000041"') from commands where key='review';
select is(public.staging_offline_transition((select value from commands where key='stale'))->>'status','conflict','same version number with changed state conflicts');
select is(public.staging_offline_transition((select value from commands where key='stale'))->>'status','conflict','repeated conflict is not acknowledged');
insert into commands select 'keep',value||jsonb_build_object('operationId','93800000-0000-4000-8000-000000000042','sourceOperationId','93800000-0000-4000-8000-000000000041','decision','KEEP_SERVER','justification','Preservar o estado autorizado atual','expectedRecord',(select to_jsonb(v) from public.knowledge_versions v where v.id='93800000-0000-4000-8000-000000000031')) from commands where key='stale';
select is(public.staging_offline_transition((select value from commands where key='keep'))->>'status','resolved','keep server resolves without transition');
select is((select status from public.knowledge_versions where id='93800000-0000-4000-8000-000000000031'),'IN_REVIEW','keeping server never publishes');
select is(public.staging_offline_transition((select value from commands where key='keep'))->>'duplicate','true','resolution retry does not duplicate audit');
select throws_ok($$select public.staging_offline_transition((select value||'{"unitId":"93800000-0000-4000-8000-000000000012","operationId":"93800000-0000-4000-8000-000000000043"}' from commands where key='review'))$$,'42501',null,'another UBS rejected');
select throws_ok($$select public.staging_offline_transition((select value||'{"command":"arbitrary_sql"}' from commands where key='review'))$$,'22023',null,'arbitrary commands denied');
select set_config('request.jwt.claim.sub','93800000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.staging_offline_transition((select value||'{"deviceId":"93800000-0000-4000-8000-000000000021","operationId":"93800000-0000-4000-8000-000000000044"}' from commands where key='review'))$$,'42501',null,'reader cannot transition');
reset role;
update public.devices set revoked_at=now() where id='93800000-0000-4000-8000-000000000020';
set local role authenticated;
select set_config('request.jwt.claim.sub','93800000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.staging_offline_transition((select value from commands where key='review'))$$,'42501',null,'revoked device denied before idempotent replay');
select throws_ok($$select * from app.offline_transition_receipts$$,'42501',null,'private receipts not directly readable');
reset role;
select throws_ok($$update app.offline_transition_receipts set response='{}'$$,'55000',null,'receipts append-only');
select is((select count(*) from app.offline_transition_receipts),3::bigint,'retry does not duplicate receipts');
select is((select count(*) from public.audit_log where action='OFFLINE_TRANSITION_RESOLVED' and organization_id='93800000-0000-4000-8000-000000000010'),1::bigint,'resolution audited once');
select ok(not has_function_privilege('anon','public.staging_offline_transition(jsonb)','execute'),'anonymous RPC disabled');
select is((select prosecdef from pg_proc where oid='public.staging_offline_transition(jsonb)'::regprocedure),false,'public RPC SECURITY INVOKER');
-- Qualify every command family on fresh synthetic local records.
update public.devices set revoked_at=null where id='93800000-0000-4000-8000-000000000020';
insert into public.protocols(id,organization_id,unit_id,code,title,domain) values('93800000-0000-4000-8000-000000000050','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','OFFLINE-TEST','Protocolo sintético','QUALIDADE');
insert into public.protocol_versions(id,organization_id,unit_id,protocol_id,version_number,content,valid_from) values('93800000-0000-4000-8000-000000000051','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','93800000-0000-4000-8000-000000000050',1,'{"instructions":"Somente sintético"}',current_date);
insert into public.action_plans(id,organization_id,unit_id,origin_type,origin_id,title) values('93800000-0000-4000-8000-000000000060','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','MANUAL','93800000-0000-4000-8000-000000000060','Plano sintético');
insert into public.actions(id,organization_id,unit_id,action_plan_id,what) values('93800000-0000-4000-8000-000000000061','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','93800000-0000-4000-8000-000000000060','Ação sintética');
insert into public.meetings(id,organization_id,unit_id,title,starts_at) values('93800000-0000-4000-8000-000000000070','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','Reunião sintética',now());
insert into public.meeting_agenda_items(organization_id,unit_id,meeting_id,position,title) values('93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','93800000-0000-4000-8000-000000000070',1,'Pauta sintética');
insert into public.meeting_participants(organization_id,unit_id,meeting_id,user_id,attended) values('93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','93800000-0000-4000-8000-000000000070','93800000-0000-4000-8000-000000000001',true);
insert into public.referrals(id,organization_id,unit_id,meeting_id,description,responsible_id,due_at) values('93800000-0000-4000-8000-000000000071','93800000-0000-4000-8000-000000000010','93800000-0000-4000-8000-000000000011','93800000-0000-4000-8000-000000000070','Encaminhamento sintético','93800000-0000-4000-8000-000000000001',now()+interval '2 days');
create function pg_temp.offline_envelope(res text,entity uuid,cmd text,payload jsonb default '{}') returns jsonb language plpgsql as $$
declare r jsonb; relations jsonb:='{}';
begin
 case res
 when 'knowledge-versions' then select to_jsonb(v) into r from public.knowledge_versions v where id=entity;
 when 'protocol-versions' then select to_jsonb(v) into r from public.protocol_versions v where id=entity;relations:='{"forms":[],"bindings":[]}';
 when 'executions' then select to_jsonb(v) into r from public.executions v where id=entity;relations:='{"responses":[]}';
 when 'actions' then select to_jsonb(v) into r from public.actions v where id=entity;
 when 'action-plans' then select to_jsonb(v) into r from public.action_plans v where id=entity;relations:=jsonb_build_object('actions',(select jsonb_agg(to_jsonb(a) order by id) from public.actions a where a.action_plan_id=entity));
 when 'referrals' then select to_jsonb(v) into r from public.referrals v where id=entity;
 when 'meetings' then select to_jsonb(v) into r from public.meetings v where id=entity;
 relations:=jsonb_build_object('agenda',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.meeting_agenda_items v where meeting_id=entity),'[]'),'participants',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.meeting_participants v where meeting_id=entity),'[]'),'referrals',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.referrals v where meeting_id=entity),'[]'));
 end case;
 return jsonb_build_object('organizationId',r->'organization_id','unitId',r->'unit_id','entityId',entity,'operationId',gen_random_uuid(),'deviceId','93800000-0000-4000-8000-000000000020','resource',res,'command',cmd,'expectedVersion',coalesce(r->'version',r->'version_number'),'expectedRecord',r,'expectedRelated',relations,'payload',payload);
end;$$;
set local role authenticated;
select is(public.staging_offline_transition(pg_temp.offline_envelope('knowledge-versions','93800000-0000-4000-8000-000000000031','transition','{"targetStatus":"APPROVED"}'))->>'status','confirmed','knowledge approval');
select is(public.staging_offline_transition(pg_temp.offline_envelope('knowledge-versions','93800000-0000-4000-8000-000000000031','transition','{"targetStatus":"PUBLISHED"}'))->>'status','confirmed','knowledge publication');
select is(public.staging_offline_transition(pg_temp.offline_envelope('protocol-versions','93800000-0000-4000-8000-000000000051','submit-review'))->>'status','confirmed','protocol review');
select is(public.staging_offline_transition(pg_temp.offline_envelope('protocol-versions','93800000-0000-4000-8000-000000000051','approve'))->>'status','confirmed','protocol approval');
select is(public.staging_offline_transition(pg_temp.offline_envelope('protocol-versions','93800000-0000-4000-8000-000000000051','publish'))->>'status','confirmed','protocol publication');
select public.start_protocol_execution('93800000-0000-4000-8000-000000000052','93800000-0000-4000-8000-000000000051','93800000-0000-4000-8000-000000000011',gen_random_uuid());
select is(public.staging_offline_transition(pg_temp.offline_envelope('executions','93800000-0000-4000-8000-000000000052','complete','{"result":{}}'))->>'status','confirmed','execution completion');
select is(public.staging_offline_transition(pg_temp.offline_envelope('actions','93800000-0000-4000-8000-000000000061','complete'))->>'status','confirmed','action completion');
select is(public.staging_offline_transition(pg_temp.offline_envelope('action-plans','93800000-0000-4000-8000-000000000060','effectiveness','{"effective":true,"notes":"Eficácia sintética local"}'))->>'status','confirmed','plan effectiveness');
insert into commands values('start-meeting',pg_temp.offline_envelope('meetings','93800000-0000-4000-8000-000000000070','start'));
update public.meeting_agenda_items set title='Pauta alterada concorrentemente' where meeting_id='93800000-0000-4000-8000-000000000070';
select is(public.staging_offline_transition((select value from commands where key='start-meeting'))->>'status','conflict','agenda changes conflict even without meeting version change');
insert into commands values('retry-meeting',pg_temp.offline_envelope('meetings','93800000-0000-4000-8000-000000000070','start')||jsonb_build_object('decision','RETRY','sourceOperationId',(select value->>'operationId' from commands where key='start-meeting'),'justification','Revisão autorizada da pauta atualizada'));
select is(public.staging_offline_transition((select value from commands where key='retry-meeting'))->>'status','resolved','explicit retry revalidates current snapshot');
select is(public.staging_offline_transition((select value from commands where key='retry-meeting'))->>'duplicate','true','retry resolution replay deduplicated');
select is(public.staging_offline_transition(pg_temp.offline_envelope('referrals','93800000-0000-4000-8000-000000000071','convert-to-action'))->>'status','confirmed','referral conversion');
select is(public.staging_offline_transition(pg_temp.offline_envelope('meetings','93800000-0000-4000-8000-000000000070','complete','{"minutes":"Ata sintética validada localmente."}'))->>'status','confirmed','meeting completion');
reset role;
select * from finish();
rollback;
