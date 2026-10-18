-- Additive gateway: no replacement of existing online commands or business DML.
-- This private snapshot helper is executable only by its owning gateway.
create function app.offline_form_snapshot(res text, entity uuid, org uuid, scope_unit uuid) returns jsonb
language plpgsql set search_path='' as $$
declare r jsonb; relations jsonb:='{}';
begin
 case res
 when 'knowledge' then
  select to_jsonb(v) into r from public.knowledge_items v where id=entity and organization_id=org and (unit_id is null or unit_id=scope_unit) and deleted_at is null for update;
  if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  relations:=jsonb_build_object('knowledge-versions',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.knowledge_versions v where knowledge_item_id=entity),'[]'));
 when 'protocols' then
  select to_jsonb(v) into r from public.protocols v where id=entity and organization_id=org and (unit_id is null or unit_id=scope_unit) and deleted_at is null for update;
  if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  relations:=jsonb_build_object('protocol-versions',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.protocol_versions v where protocol_id=entity),'[]'));
 when 'protocol-versions' then
  select to_jsonb(v) into r from public.protocol_versions v where id=entity and organization_id=org and (unit_id is null or unit_id=scope_unit) for update;
  if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.form_versions where protocol_version_id=entity for share;
  perform 1 from public.protocol_indicator_bindings where protocol_version_id=entity for share;
  relations:=jsonb_build_object('forms',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.form_versions v where protocol_version_id=entity),'[]'),'bindings',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.protocol_indicator_bindings v where protocol_version_id=entity),'[]'));
 when 'indicators' then
  select to_jsonb(v) into r from public.indicators v where id=entity and organization_id=org and (unit_id is null or unit_id=scope_unit) and deleted_at is null for update;
  if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.targets where indicator_id=entity and unit_id=scope_unit for share;
  relations:=jsonb_build_object('formulas',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.indicator_formula_versions v where indicator_id=entity and (unit_id is null or unit_id=scope_unit)),'[]'),'targets',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.targets v where indicator_id=entity and unit_id=scope_unit),'[]'));
 when 'executions' then
  select to_jsonb(v) into r from public.executions v where id=entity and organization_id=org and unit_id=scope_unit and deleted_at is null for update;
  if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.execution_responses where execution_id=entity for share;
  relations:=jsonb_build_object('responses',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.execution_responses v where execution_id=entity),'[]'),'forms',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.form_versions v where protocol_version_id=(r->>'protocol_version_id')::uuid),'[]'));
 when 'measurements' then
  select to_jsonb(v) into r from public.measurements v where id=entity and organization_id=org and unit_id=scope_unit for update;
  if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  relations:=jsonb_build_object('analyses',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.critical_analyses v where measurement_id=entity),'[]'),'nonconformities',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.nonconformities v where origin_id=entity and deleted_at is null),'[]'));
 when 'action-plans' then
  select to_jsonb(v) into r from public.action_plans v where id=entity and organization_id=org and unit_id=scope_unit and deleted_at is null for update;
  if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.actions where action_plan_id=entity and deleted_at is null for share;
  relations:=jsonb_build_object('actions',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.actions v where action_plan_id=entity and deleted_at is null),'[]'));
 when 'meetings' then
  select to_jsonb(v) into r from public.meetings v where id=entity and organization_id=org and unit_id=scope_unit and deleted_at is null for update;
  if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
  perform 1 from public.meeting_agenda_items where meeting_id=entity for share;
  perform 1 from public.meeting_participants where meeting_id=entity for share;
  perform 1 from public.referrals where meeting_id=entity for share;
  relations:=jsonb_build_object('agenda',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.meeting_agenda_items v where meeting_id=entity),'[]'),'participants',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.meeting_participants v where meeting_id=entity),'[]'),'referrals',coalesce((select jsonb_agg(to_jsonb(v) order by id) from public.referrals v where meeting_id=entity),'[]'));
 else raise exception 'Unsupported form resource' using errcode='22023';
 end case;
 if r is null then raise exception 'Forbidden scope' using errcode='42501'; end if;
 return jsonb_build_object('record',r,'related',relations);
end;$$;
revoke all on function app.offline_form_snapshot(text,uuid,uuid,uuid) from public,anon,authenticated;

create function app.staging_offline_form(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
 actor uuid:=auth.uid(); org uuid; scope_unit uuid; entity uuid; operation uuid; device uuid; source_id uuid;
 res text; cmd text; domain text; permission text; decision text; input jsonb; snapshot jsonb; r jsonb; answer jsonb;
 previous app.offline_transition_receipts; source app.offline_transition_receipts; expected integer; fields text[]; inserted_id uuid; attendee uuid;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and status='ACTIVE') then raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>500000 then raise exception 'Invalid request' using errcode='22023'; end if;
 org:=(p_request->>'organizationId')::uuid;scope_unit:=(p_request->>'unitId')::uuid;entity:=(p_request->>'entityId')::uuid;operation:=(p_request->>'operationId')::uuid;device:=(p_request->>'deviceId')::uuid;
 res:=p_request->>'resource';cmd:=p_request->>'command';input:=p_request->'payload';expected:=(p_request->>'expectedVersion')::integer;decision:=coalesce(p_request->>'decision','APPLY');source_id:=(p_request->>'sourceOperationId')::uuid;
 if org is null or entity is null or operation is null or device is null or expected is null or expected<1 or jsonb_typeof(input) is distinct from 'object'
 or decision not in ('APPLY','KEEP_SERVER','RETRY') or (decision='APPLY' and source_id is not null) or (decision<>'APPLY' and (source_id is null or length(trim(coalesce(p_request->>'justification',''))) not between 10 and 1000)) then raise exception 'Invalid envelope' using errcode='22023'; end if;
 if not exists(select 1 from public.organizations where id=org and name like '[HOMOLOGAÇÃO]%' and status='ACTIVE' and deleted_at is null)
 or not exists(select 1 from public.devices where id=device and user_id=actor and organization_id=org and revoked_at is null and last_verified_at>now()-interval '72 hours')
 then raise exception 'Synthetic staging device required' using errcode='42501'; end if;
 case res||'/'||cmd
 when 'knowledge/versions' then domain:='conhecimento';permission:='editar';fields:=array['content','references','validFrom','validUntil'];
 when 'protocols/versions' then domain:='protocolos';permission:='editar';fields:=array['content','validFrom','validUntil'];
 when 'protocol-versions/forms' then domain:='protocolos';permission:='editar';fields:=array['name','fields'];
 when 'protocol-versions/indicator-bindings' then domain:='protocolos';permission:='editar';fields:=array['indicatorId','formulaVersionId','unitId'];
 when 'protocol-versions/executions' then domain:='protocolos';permission:='executar';fields:=array['executionId','unitId'];
 when 'indicators/formulas' then domain:='indicadores';permission:='editar';fields:=array['variables','expression','validFrom'];
 when 'indicators/targets' then domain:='indicadores';permission:='criar';fields:=array['organizationId','unitId','startsOn','endsOn','comparison','targetValue','minimumValue','maximumValue','attentionRule'];
 when 'executions/responses' then domain:='protocolos';permission:='executar';fields:=array['responses'];
 when 'measurements/analysis' then domain:='indicadores';permission:='editar';fields:=array['analysis','cause','decision','actionPlanId'];
 when 'measurements/open-plan' then domain:='indicadores';permission:='visualizar';fields:=array['title','description','classification','responsibleId','dueAt'];
 when 'action-plans/actions' then domain:='melhoria';permission:='criar';fields:=array['what','why','where','whenAt','whoId','how','howMuch'];
 when 'meetings/agenda' then domain:='reunioes';permission:='criar';fields:=array['position','title','description'];
 when 'meetings/participants' then domain:='reunioes';permission:='criar';fields:=array['userId','attended'];
 when 'meetings/referrals' then domain:='reunioes';permission:='criar';fields:=array['agendaItemId','description','responsibleId','dueAt','priority'];
 else raise exception 'Unsupported offline form' using errcode='22023';
 end case;
 -- Check authorization BEFORE business locks and BEFORE cached results.
 if not app.can_access(org,scope_unit,domain,permission) or not app.can_access(org,scope_unit,domain,'visualizar')
 or (cmd='open-plan' and not app.can_access(org,scope_unit,'melhoria','criar'))
 or (decision<>'APPLY' and not app.can_access(org,scope_unit,domain,'reabrir')) then raise exception 'Forbidden permission' using errcode='42501'; end if;
 if scope_unit is not null and not exists(select 1 from public.units where id=scope_unit and organization_id=org and status='ACTIVE' and deleted_at is null) then raise exception 'Inactive scope_unit' using errcode='42501'; end if;
 if input-fields<>'{}'::jsonb then raise exception 'Unexpected payload fields' using errcode='22023'; end if;
 if cmd in ('targets','executions','indicator-bindings') and (input->>'unitId') is distinct from scope_unit::text then raise exception 'Payload scope_unit mismatch' using errcode='42501'; end if;
 if cmd='targets' and input->>'organizationId' is distinct from org::text then raise exception 'Payload organization mismatch' using errcode='42501'; end if;
 snapshot:=app.offline_form_snapshot(res,entity,org,scope_unit);r:=snapshot->'record';
 if res='protocol-versions' and not exists(select 1 from public.protocols where id=(r->>'protocol_id')::uuid and organization_id=org and deleted_at is null) then raise exception 'Deleted protocol' using errcode='42501'; end if;
 if cmd='indicator-bindings' and (not app.can_access(org,scope_unit,'indicadores','visualizar') or not exists(select 1 from public.indicator_formula_versions f join public.indicators i on i.id=f.indicator_id where f.id=(input->>'formulaVersionId')::uuid and i.id=(input->>'indicatorId')::uuid and f.organization_id=org and i.organization_id=org and (f.unit_id is null or f.unit_id=scope_unit) and (i.unit_id is null or i.unit_id=scope_unit) and i.deleted_at is null)) then raise exception 'Forbidden formula' using errcode='42501'; end if;
 if cmd='participants' then
  attendee:=(input->>'userId')::uuid;
  if attendee is null or not exists(select 1 from public.read_workspace_people(org,scope_unit) p where p.id=attendee) then raise exception 'Invalid active participant' using errcode='42501'; end if;
  if exists(select 1 from public.meeting_participants where meeting_id=entity and user_id=attendee) and not app.can_access(org,scope_unit,domain,'editar') then raise exception 'Editing attendance forbidden' using errcode='42501'; end if;
 end if;
 if coalesce(input->>'whoId',input->>'responsibleId') is not null and not exists(select 1 from public.read_workspace_people(org,scope_unit) p where p.id=coalesce(input->>'whoId',input->>'responsibleId')::uuid) then raise exception 'Invalid responsible' using errcode='42501'; end if;
 if input->>'agendaItemId' is not null and not exists(select 1 from public.meeting_agenda_items where id=(input->>'agendaItemId')::uuid and meeting_id=entity and organization_id=org and unit_id=scope_unit) then raise exception 'Invalid agenda reference' using errcode='42501'; end if;
 if input->>'actionPlanId' is not null and not exists(select 1 from public.action_plans where id=(input->>'actionPlanId')::uuid and organization_id=org and unit_id=scope_unit and deleted_at is null) then raise exception 'Invalid plan reference' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(operation::text,0));
 select * into previous from app.offline_transition_receipts where operation_id=operation;
 if found then
  if previous.actor_id<>actor or previous.request<>p_request then raise exception 'Operation payload changed' using errcode='22023'; end if;
  return previous.response||jsonb_build_object('duplicate',true);
 end if;
 if exists(select 1 from public.idempotency_keys where operation_id=operation) then raise exception 'Operation belongs to another command' using errcode='22023'; end if;
 if source_id is not null then
  select * into source from app.offline_transition_receipts where operation_id=source_id and actor_id=actor and organization_id=org and entity_id=entity for update;
  if source.operation_id is null or source.resource<>res or source.request->>'command'<>cmd or source.request->'payload' is distinct from input or source.response->>'status'<>'conflict'
  or exists(select 1 from app.offline_transition_receipts where source_operation_id=source_id and response->>'status'='resolved') then raise exception 'Conflict unavailable' using errcode='22023'; end if;
 end if;
 if snapshot->'record' is distinct from p_request->'expectedRecord' or snapshot->'related' is distinct from p_request->'expectedRelated' or coalesce((r->>'version')::integer,(r->>'version_number')::integer)<>expected then
  answer:=jsonb_build_object('status','conflict','reason','snapshot_changed','operationId',operation,'server',snapshot);
 elsif decision='KEEP_SERVER' then answer:=jsonb_build_object('status','resolved','strategy',decision,'operationId',operation,'result',jsonb_build_object('id',entity));
 else
  begin
   if res='meetings' and r->>'status' in ('COMPLETED','CANCELLED') then raise exception 'Meeting closed' using errcode='22023'; end if;
   case res||'/'||cmd
   when 'knowledge/versions' then answer:=public.create_knowledge_version(entity,expected,operation,input->'content',coalesce(input->'references','[]'),(input->>'validFrom')::date,(input->>'validUntil')::date);
   when 'protocols/versions' then answer:=public.create_protocol_version(entity,expected,operation,input->'content',(input->>'validFrom')::date,(input->>'validUntil')::date);
   when 'protocol-versions/forms' then answer:=public.save_protocol_form(entity,operation,input->>'name',input->'fields');
   when 'protocol-versions/indicator-bindings' then answer:=public.bind_protocol_indicator(entity,expected,(input->>'indicatorId')::uuid,(input->>'formulaVersionId')::uuid,scope_unit,operation);
   when 'protocol-versions/executions' then answer:=public.start_protocol_execution((input->>'executionId')::uuid,entity,scope_unit,operation);
   when 'indicators/formulas' then answer:=public.create_indicator_formula_version(entity,expected,operation,input->'variables',input->'expression',(input->>'validFrom')::date);
   when 'executions/responses' then answer:=public.save_execution_responses(entity,expected,operation,input->'responses');
   when 'measurements/analysis' then answer:=public.record_critical_analysis(entity,expected,operation,input->>'analysis',input->>'cause',input->>'decision',(input->>'actionPlanId')::uuid);
   when 'measurements/open-plan' then answer:=public.open_measurement_plan(entity,expected,operation,input);
   when 'indicators/targets' then
    if (input->>'endsOn')::date<(input->>'startsOn')::date or coalesce(input->>'comparison','') not in ('GTE','LTE','EQ','BETWEEN') or (input->>'comparison'='BETWEEN' and (input->>'minimumValue' is null or input->>'maximumValue' is null or (input->>'minimumValue')::numeric>(input->>'maximumValue')::numeric)) or (input->>'comparison'<>'BETWEEN' and input->>'targetValue' is null) then raise exception 'Invalid target' using errcode='22023'; end if;
    insert into public.targets(id,organization_id,unit_id,indicator_id,starts_on,ends_on,comparison,target_value,minimum_value,maximum_value,attention_rule,created_by,updated_by)
    values(operation,org,scope_unit,entity,(input->>'startsOn')::date,(input->>'endsOn')::date,input->>'comparison',(input->>'targetValue')::numeric,(input->>'minimumValue')::numeric,(input->>'maximumValue')::numeric,input->'attentionRule',actor,actor) returning id into inserted_id;
    answer:=jsonb_build_object('id',inserted_id);
   when 'action-plans/actions' then
    if r->>'status' in ('CONCLUIDO','CANCELADO') or length(trim(coalesce(input->>'what',''))) not between 3 and 500 or coalesce((input->>'howMuch')::numeric,0)<0 then raise exception 'Invalid action or closed plan' using errcode='22023'; end if;
    insert into public.actions(id,organization_id,unit_id,action_plan_id,what,why,where_text,when_at,who_id,how,how_much,created_by,updated_by)
    values(operation,org,scope_unit,entity,input->>'what',input->>'why',input->>'where',(input->>'whenAt')::timestamptz,(input->>'whoId')::uuid,input->>'how',(input->>'howMuch')::numeric,actor,actor) returning id into inserted_id;
    answer:=jsonb_build_object('id',inserted_id);
   when 'meetings/agenda' then
    if length(trim(coalesce(input->>'title',''))) not between 3 and 240 or (input->>'position')::integer not between 1 and 999 then raise exception 'Invalid agenda' using errcode='22023'; end if;
    insert into public.meeting_agenda_items(id,organization_id,unit_id,meeting_id,position,title,description,created_by,updated_by)
    values(operation,org,scope_unit,entity,(input->>'position')::integer,input->>'title',input->>'description',actor,actor) returning id into inserted_id;
    answer:=jsonb_build_object('id',inserted_id);
   when 'meetings/participants' then
    if jsonb_typeof(input->'attended') is null or jsonb_typeof(input->'attended') not in ('boolean','null') then raise exception 'Invalid attendance' using errcode='22023'; end if;
    insert into public.meeting_participants(id,organization_id,unit_id,meeting_id,user_id,attended)
    values(operation,org,scope_unit,entity,attendee,(input->>'attended')::boolean) on conflict(meeting_id,user_id) do update set attended=excluded.attended returning id into inserted_id;
    answer:=jsonb_build_object('id',inserted_id);
   when 'meetings/referrals' then
    if length(trim(coalesce(input->>'description',''))) not between 3 and 4000 or coalesce(input->>'priority','NORMAL') not in ('LOW','NORMAL','HIGH','CRITICAL') then raise exception 'Invalid referral' using errcode='22023'; end if;
    insert into public.referrals(id,organization_id,unit_id,meeting_id,agenda_item_id,description,responsible_id,due_at,priority,created_by,updated_by)
    values(operation,org,scope_unit,entity,(input->>'agendaItemId')::uuid,input->>'description',(input->>'responsibleId')::uuid,(input->>'dueAt')::timestamptz,coalesce(input->>'priority','NORMAL'),actor,actor) returning id into inserted_id;
    answer:=jsonb_build_object('id',inserted_id);
   end case;
   answer:=jsonb_build_object('status',case when decision='RETRY' then 'resolved' else 'confirmed' end,'strategy',decision,'operationId',operation,'result',answer);
  exception when sqlstate '40001' or sqlstate '22023' or sqlstate '23514' or sqlstate '23505' or sqlstate '23P01' or sqlstate '55000' then
   answer:=jsonb_build_object('status','conflict','reason','state_or_validation_changed','operationId',operation,'server',snapshot);
  end;
 end if;
 insert into app.offline_transition_receipts(operation_id,organization_id,unit_id,actor_id,device_id,entity_id,resource,request,response,source_operation_id)
 values(operation,org,scope_unit,actor,device,entity,res,p_request,answer,source_id);
 insert into public.audit_log(organization_id,unit_id,actor_id,device_id,session_id,entity_type,entity_id,action,before_value,after_value)
 values(org,scope_unit,actor,device,auth.jwt()->>'session_id',domain,entity,'OFFLINE_FORM_'||upper(answer->>'status'),snapshot,jsonb_build_object('operationId',operation,'sourceOperationId',source_id,'command',cmd,'decision',decision,'justification',p_request->>'justification','response',answer));
 return answer;
end;$$;
revoke all on function app.staging_offline_form(jsonb) from public,anon;
grant execute on function app.staging_offline_form(jsonb) to authenticated;
create function public.staging_offline_form(p_request jsonb) returns jsonb language sql security invoker set search_path=''
as $$select app.staging_offline_form(p_request);$$;
revoke all on function public.staging_offline_form(jsonb) from public,anon;
grant execute on function public.staging_offline_form(jsonb) to authenticated;
