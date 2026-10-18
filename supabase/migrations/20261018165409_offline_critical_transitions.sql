-- Additive staging-only gateway. Existing commands and business rows unchanged.
create table app.offline_transition_receipts (
 operation_id uuid primary key,
 organization_id uuid not null references public.organizations(id),
 unit_id uuid,
 actor_id uuid not null references auth.users(id),
 device_id uuid not null references public.devices(id),
 entity_id uuid not null,
 resource text not null,
 request jsonb not null,
 response jsonb not null,
 source_operation_id uuid references app.offline_transition_receipts(operation_id),
 created_at timestamptz not null default now(),
 foreign key(organization_id,unit_id) references public.units(organization_id,id)
);
create index offline_transition_entity_idx on app.offline_transition_receipts(organization_id,entity_id,created_at);
create unique index offline_transition_resolution_once on app.offline_transition_receipts(source_operation_id)
 where source_operation_id is not null and response->>'status'='resolved';
alter table app.offline_transition_receipts enable row level security;
revoke all on app.offline_transition_receipts from public,anon,authenticated;

create function app.offline_receipt_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Offline receipts are append-only' using errcode='55000'; end;$$;
revoke all on function app.offline_receipt_immutable() from public,anon,authenticated;
create trigger offline_receipt_append_only before update or delete on app.offline_transition_receipts
 for each row execute function app.offline_receipt_immutable();
create trigger offline_receipt_no_truncate before truncate on app.offline_transition_receipts
 for each statement execute function app.offline_receipt_immutable();

-- Privileged persistence lives in the non-exposed app schema. No arbitrary SQL.
create function app.staging_offline_transition(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
 actor uuid:=auth.uid(); org uuid; unit uuid; entity uuid; operation uuid; device uuid;
 resource text; command text; domain text; required_operation text;
 current_row jsonb; related jsonb:='{}'; input jsonb; answer jsonb; previous app.offline_transition_receipts;
 source app.offline_transition_receipts; source_id uuid; decision text; expected integer; allowed_fields text[];
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and status='ACTIVE') then
  raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>500000 then raise exception 'Invalid request' using errcode='22023'; end if;
 org:=(p_request->>'organizationId')::uuid; unit:=(p_request->>'unitId')::uuid;
 entity:=(p_request->>'entityId')::uuid; operation:=(p_request->>'operationId')::uuid; device:=(p_request->>'deviceId')::uuid;
 resource:=p_request->>'resource'; command:=p_request->>'command'; input:=coalesce(p_request->'payload','{}');
 expected:=(p_request->>'expectedVersion')::integer; decision:=coalesce(p_request->>'decision','APPLY');
 source_id:=(p_request->>'sourceOperationId')::uuid;
 if org is null or entity is null or operation is null or device is null or expected is null or expected<1 or jsonb_typeof(input)<>'object'
  or decision not in ('APPLY','KEEP_SERVER','RETRY') or (decision='APPLY' and source_id is not null) or (decision<>'APPLY' and (source_id is null or length(trim(coalesce(p_request->>'justification','')))<10))
 then raise exception 'Invalid command envelope' using errcode='22023'; end if;
 if not exists(select 1 from public.organizations where id=org and name like '[HOMOLOGAÇÃO]%' and status='ACTIVE' and deleted_at is null)
  or not exists(select 1 from public.devices where id=device and user_id=actor and organization_id=org and revoked_at is null and last_verified_at>now()-interval '72 hours')
 then raise exception 'Synthetic staging device required' using errcode='42501'; end if;

 -- Reject unauthorized scopes before acquiring ANY business-row lock. In the
 -- shared database a forged production UUID must never lock a production row.
 domain:=case when resource='knowledge-versions' then 'conhecimento' when resource in ('protocol-versions','executions') then 'protocolos' when resource in ('actions','action-plans') then 'melhoria' when resource in ('meetings','referrals') then 'reunioes' end;
 required_operation:=case when resource='knowledge-versions' then case input->>'targetStatus' when 'IN_REVIEW' then 'editar' when 'APPROVED' then 'aprovar' when 'PUBLISHED' then 'publicar' end when resource='protocol-versions' then case command when 'submit-review' then 'editar' when 'approve' then 'aprovar' when 'publish' then 'publicar' end when resource='meetings' and command='start' then 'executar' when resource='referrals' then 'editar' else 'encerrar' end;
 if domain is null or required_operation is null or not app.can_access(org,unit,domain,required_operation) or not app.can_access(org,unit,domain,'visualizar') then raise exception 'Forbidden scope or permission' using errcode='42501'; end if;

 -- Fixed command allowlist and row locks. Never execute a client-supplied name.
 case
 when resource='knowledge-versions' and command='transition' then
  domain:='conhecimento'; required_operation:=case input->>'targetStatus' when 'IN_REVIEW' then 'editar' when 'APPROVED' then 'aprovar' when 'PUBLISHED' then 'publicar' end;
  select to_jsonb(v) into current_row from public.knowledge_versions v where id=entity and organization_id=org and (unit_id is null or unit_id=unit) for update;
 when resource='protocol-versions' and command in ('submit-review','approve','publish') then
  domain:='protocolos'; required_operation:=case command when 'submit-review' then 'editar' when 'approve' then 'aprovar' else 'publicar' end;
  select to_jsonb(v) into current_row from public.protocol_versions v where id=entity and organization_id=org and (unit_id is null or unit_id=unit) for update;
  if current_row is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.form_versions where protocol_version_id=entity for share;
  perform 1 from public.protocol_indicator_bindings where protocol_version_id=entity for share;
  related:=jsonb_build_object('forms',coalesce((select jsonb_agg(to_jsonb(f) order by f.id) from public.form_versions f where f.protocol_version_id=entity),'[]'),
    'bindings',coalesce((select jsonb_agg(to_jsonb(b) order by b.id) from public.protocol_indicator_bindings b where b.protocol_version_id=entity),'[]'));
 when resource='executions' and command='complete' then
  domain:='protocolos'; required_operation:='encerrar';
  select to_jsonb(v) into current_row from public.executions v where id=entity and organization_id=org and unit_id is not distinct from unit and deleted_at is null for update;
  if current_row is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.execution_responses where execution_id=entity for share;
  related:=jsonb_build_object('responses',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.execution_responses r where r.execution_id=entity),'[]'));
 when resource='actions' and command='complete' then
  domain:='melhoria'; required_operation:='encerrar';
  select to_jsonb(v) into current_row from public.actions v where id=entity and organization_id=org and unit_id is not distinct from unit and deleted_at is null for update;
 when resource='action-plans' and command='effectiveness' then
  domain:='melhoria'; required_operation:='encerrar';
  select to_jsonb(v) into current_row from public.action_plans v where id=entity and organization_id=org and unit_id is not distinct from unit and deleted_at is null for update;
  if current_row is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.actions where action_plan_id=entity and deleted_at is null for share;
  related:=jsonb_build_object('actions',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.actions a where a.action_plan_id=entity and a.deleted_at is null),'[]'));
 when resource='meetings' and command in ('start','complete') then
  domain:='reunioes'; required_operation:=case command when 'start' then 'executar' else 'encerrar' end;
  select to_jsonb(v) into current_row from public.meetings v where id=entity and organization_id=org and unit_id is not distinct from unit and deleted_at is null for update;
  if current_row is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.meeting_agenda_items where meeting_id=entity for share;
  perform 1 from public.meeting_participants where meeting_id=entity for share;
  perform 1 from public.referrals where meeting_id=entity for share;
  related:=jsonb_build_object('agenda',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.meeting_agenda_items a where a.meeting_id=entity),'[]'),
    'participants',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.meeting_participants a where a.meeting_id=entity),'[]'),
    'referrals',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.referrals a where a.meeting_id=entity),'[]'));
 when resource='referrals' and command='convert-to-action' then
  domain:='reunioes'; required_operation:='editar';
  select to_jsonb(v) into current_row from public.referrals v where id=entity and organization_id=org and unit_id is not distinct from unit for update;
 else raise exception 'Unsupported offline transition' using errcode='22023';
 end case;
 if current_row is null or current_row->>'organization_id'<>org::text
  or (current_row->>'unit_id' is not null and current_row->>'unit_id' is distinct from unit::text)
  or current_row->>'deleted_at' is not null or required_operation is null
  or not app.can_access(org,unit,domain,required_operation) or not app.can_access(org,unit,domain,'visualizar')
  or (resource='referrals' and not app.can_access(org,unit,'melhoria','editar'))
 then raise exception 'Forbidden scope or permission' using errcode='42501'; end if;
 if unit is not null and not exists(select 1 from public.units where id=unit and organization_id=org and status='ACTIVE' and deleted_at is null) then raise exception 'Inactive unit' using errcode='42501'; end if;
 if resource='knowledge-versions' and not exists(select 1 from public.knowledge_items where id=(current_row->>'knowledge_item_id')::uuid and deleted_at is null) then raise exception 'Deleted knowledge item' using errcode='42501'; end if;
 if resource='protocol-versions' and not exists(select 1 from public.protocols where id=(current_row->>'protocol_id')::uuid and deleted_at is null) then raise exception 'Deleted protocol' using errcode='42501'; end if;
 allowed_fields:=case resource when 'knowledge-versions' then array['targetStatus'] when 'executions' then array['result','indicatorInputs','compliance','notes'] when 'actions' then array['evidenceAttachmentId'] when 'action-plans' then array['effective','notes','evidenceAttachmentId'] when 'meetings' then case when command='complete' then array['minutes'] else array[]::text[] end else array[]::text[] end;
 if input-allowed_fields<>'{}'::jsonb
  or (resource='action-plans' and (jsonb_typeof(input->'effective') is distinct from 'boolean' or length(trim(coalesce(input->>'notes',''))) not between 3 and 10000))
  or (resource='meetings' and command='complete' and length(trim(coalesce(input->>'minutes',''))) not between 10 and 50000)
  or (resource='executions' and ((input?'result' and jsonb_typeof(input->'result')<>'object') or (input?'indicatorInputs' and jsonb_typeof(input->'indicatorInputs')<>'object') or length(coalesce(input->>'notes',''))>10000 or length(coalesce(input->>'compliance',''))>80))
 then raise exception 'Invalid transition fields' using errcode='22023'; end if;
 if decision<>'APPLY' and not app.can_access(org,unit,domain,'reabrir') then raise exception 'Resolution requires reopening permission' using errcode='42501'; end if;
 -- Authorization always precedes cached results, including retries/resolutions.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation::text,0));
 select * into previous from app.offline_transition_receipts where operation_id=operation;
 if found then
  if previous.actor_id<>actor or previous.request<>p_request then raise exception 'Operation payload changed' using errcode='22023'; end if;
  return previous.response||jsonb_build_object('duplicate',true);
 end if;
 if exists(select 1 from public.idempotency_keys where operation_id=operation) then raise exception 'Operation already belongs to another command' using errcode='22023'; end if;
 if source_id is not null then
  select * into source from app.offline_transition_receipts where operation_id=source_id and actor_id=actor and organization_id=org and entity_id=entity for update;
  if source.operation_id is null or source.actor_id<>actor or source.organization_id<>org or source.entity_id<>entity or source.resource<>resource
    or source.request->>'command'<>command or source.request->'payload' is distinct from input or source.response->>'status'<>'conflict'
    or exists(select 1 from app.offline_transition_receipts where source_operation_id=source_id and response->>'status'='resolved')
  then raise exception 'Conflict unavailable for resolution' using errcode='22023'; end if;
 end if;
 -- Snapshot equality also catches state/content changes in immutable version rows.
 if current_row is distinct from p_request->'expectedRecord' or related is distinct from p_request->'expectedRelated'
  or coalesce((current_row->>'version')::integer,(current_row->>'version_number')::integer)<>expected then
  answer:=jsonb_build_object('status','conflict','reason','snapshot_changed','operationId',operation,'server',jsonb_build_object('record',current_row,'related',related));
 elsif decision='KEEP_SERVER' then
  answer:=jsonb_build_object('status','resolved','strategy',decision,'operationId',operation,'result',jsonb_build_object('id',entity));
 else
  begin
   case
    when resource='knowledge-versions' then answer:=public.transition_knowledge_version(entity,expected,operation,input->>'targetStatus');
    when resource='protocol-versions' and command='submit-review' then answer:=public.submit_protocol_review(entity,expected,operation);
    when resource='protocol-versions' and command='approve' then answer:=public.approve_protocol_version(entity,expected,operation);
    when resource='protocol-versions' and command='publish' then answer:=public.publish_protocol_version(entity,expected,operation);
    when resource='executions' then answer:=public.complete_execution(entity,expected,operation,input);
    when resource='actions' then answer:=public.complete_action(entity,expected,operation,(input->>'evidenceAttachmentId')::uuid);
    when resource='action-plans' then answer:=public.record_plan_effectiveness(entity,expected,operation,(input->>'effective')::boolean,input->>'notes',(input->>'evidenceAttachmentId')::uuid);
    when resource='meetings' and command='start' then answer:=public.start_meeting(entity,expected,operation);
    when resource='meetings' and command='complete' then answer:=public.complete_meeting(entity,expected,operation,input->>'minutes');
    when resource='referrals' then answer:=public.convert_referral_to_action(entity,expected,operation);
   end case;
   answer:=jsonb_build_object('status',case when decision='RETRY' then 'resolved' else 'confirmed' end,'strategy',decision,'operationId',operation,'result',answer);
  exception when sqlstate '40001' or sqlstate '22023' or sqlstate '23514' then
   answer:=jsonb_build_object('status','conflict','reason','state_or_validation_changed','operationId',operation,'server',jsonb_build_object('record',current_row,'related',related));
  end;
 end if;
 insert into app.offline_transition_receipts(operation_id,organization_id,unit_id,actor_id,device_id,entity_id,resource,request,response,source_operation_id)
 values(operation,org,unit,actor,device,entity,resource,p_request,answer,source_id);
 insert into public.audit_log(organization_id,unit_id,actor_id,device_id,session_id,entity_type,entity_id,action,before_value,after_value)
 values(org,unit,actor,device,auth.jwt()->>'session_id',domain,entity,'OFFLINE_TRANSITION_'||upper(answer->>'status'),
  jsonb_build_object('record',current_row,'related',related),jsonb_build_object('operationId',operation,'sourceOperationId',source_id,'command',command,'decision',decision,'justification',p_request->>'justification','response',answer));
 return answer;
end;$$;
revoke all on function app.staging_offline_transition(jsonb) from public,anon;
grant execute on function app.staging_offline_transition(jsonb) to authenticated;
create function public.staging_offline_transition(p_request jsonb) returns jsonb language sql security invoker set search_path=''
as $$select app.staging_offline_transition(p_request);$$;
revoke all on function public.staging_offline_transition(jsonb) from public,anon;
grant execute on function public.staging_offline_transition(jsonb) to authenticated;
