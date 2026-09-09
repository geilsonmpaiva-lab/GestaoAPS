-- Critical state changes are explicit, authorized, version-checked and idempotent.
alter function public.apply_sync_batch(jsonb) security definer;

drop function if exists public.publish_protocol_version(uuid);
create or replace function public.approve_protocol_version(p_version_id uuid, p_expected_version integer, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.protocol_versions; prior jsonb; answer jsonb;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior || jsonb_build_object('duplicate',true); end if;
  select * into v from public.protocol_versions where id=p_version_id for update;
  if not found then raise exception 'Protocol version not found' using errcode='P0002'; end if;
  if not app.can_access(v.organization_id,v.unit_id,'protocolos','aprovar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if v.version_number<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if v.status<>'EM_REVISAO' then raise exception 'Only versions under review can be approved' using errcode='22023'; end if;
  update public.protocol_versions set status='APROVADO',approved_by=auth.uid(),approved_at=now() where id=v.id;
  answer := jsonb_build_object('id',v.id,'status','APROVADO','version',v.version_number,'approvedAt',now());
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(v.organization_id,v.unit_id,'ProtocolApproved','protocolos',v.protocol_id,v.version_number,auth.uid(),jsonb_build_object('protocolVersionId',v.id));
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),v.organization_id,encode(digest(jsonb_build_object('id',v.id,'version',p_expected_version)::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

create or replace function public.publish_protocol_version(p_version_id uuid, p_expected_version integer, p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.protocol_versions; prior jsonb; answer jsonb;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior || jsonb_build_object('duplicate',true); end if;
  select * into v from public.protocol_versions where id=p_version_id for update;
  if not found then raise exception 'Protocol version not found' using errcode='P0002'; end if;
  if not app.can_access(v.organization_id,v.unit_id,'protocolos','publicar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if v.version_number<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if v.status<>'APROVADO' then raise exception 'Only approved versions can be published' using errcode='22023'; end if;
  update public.protocol_versions set status='OBSOLETO' where protocol_id=v.protocol_id and status='PUBLICADO' and id<>v.id;
  update public.protocol_versions set status='PUBLICADO',published_at=now() where id=v.id;
  update public.protocols set status='PUBLICADO' where id=v.protocol_id;
  answer := jsonb_build_object('id',v.id,'status','PUBLICADO','version',v.version_number,'publishedAt',now());
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(v.organization_id,v.unit_id,'ProtocolPublished','protocolos',v.protocol_id,v.version_number,auth.uid(),jsonb_build_object('protocolVersionId',v.id));
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),v.organization_id,encode(digest(jsonb_build_object('id',v.id,'version',p_expected_version)::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

create or replace function public.complete_execution(p_execution_id uuid, p_expected_version integer, p_operation_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare e public.executions; prior jsonb; answer jsonb; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior || jsonb_build_object('duplicate',true); end if;
  select * into e from public.executions where id=p_execution_id for update;
  if not found then raise exception 'Execution not found' using errcode='P0002'; end if;
  if not app.can_access(e.organization_id,e.unit_id,'protocolos','encerrar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if e.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if e.status not in ('OPEN','IN_PROGRESS','PENDING_SYNC','REOPENED') then raise exception 'Execution cannot be completed from its current state' using errcode='22023'; end if;
  update public.executions set status='COMPLETED',completed_at=now(),accepted_at=now(),
    result=coalesce(p_payload->'result',result),compliance=coalesce(p_payload->>'compliance',compliance),notes=coalesce(p_payload->>'notes',notes),updated_by=auth.uid()
  where id=e.id returning version into next_version;
  answer := jsonb_build_object('id',e.id,'status','COMPLETED','version',next_version,'completedAt',now());
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(e.organization_id,e.unit_id,'ExecutionCompleted','protocolos',e.id,next_version,auth.uid(),jsonb_build_object('protocolVersionId',e.protocol_version_id));
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),e.organization_id,encode(digest(p_payload::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

create or replace function public.open_measurement_plan(p_measurement_id uuid, p_expected_version integer, p_operation_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.measurements; prior jsonb; answer jsonb; nc_id uuid; plan_id uuid; nc_code text;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior || jsonb_build_object('duplicate',true); end if;
  select * into m from public.measurements where id=p_measurement_id for update;
  if not found then raise exception 'Measurement not found' using errcode='P0002'; end if;
  if not app.can_access(m.organization_id,m.unit_id,'melhoria','criar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if m.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if m.status not in ('FORA_META','ATENCAO') then raise exception 'Only a deviation can originate a plan' using errcode='22023'; end if;
  nc_code := 'NC-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.nonconformities(organization_id,unit_id,code,origin_type,origin_id,classification,description,responsible_id,due_at,created_by,updated_by)
  values(m.organization_id,m.unit_id,nc_code,'MEASUREMENT',m.id,coalesce(nullif(p_payload->>'classification',''),'MAJOR'),p_payload->>'description',nullif(p_payload->>'responsibleId','')::uuid,nullif(p_payload->>'dueAt','')::timestamptz,auth.uid(),auth.uid())
  returning id into nc_id;
  insert into public.action_plans(organization_id,unit_id,origin_type,origin_id,title,responsible_id,due_at,created_by,updated_by)
  values(m.organization_id,m.unit_id,'NONCONFORMITY',nc_id,p_payload->>'title',nullif(p_payload->>'responsibleId','')::uuid,nullif(p_payload->>'dueAt','')::timestamptz,auth.uid(),auth.uid())
  returning id into plan_id;
  answer := jsonb_build_object('measurementId',m.id,'nonconformityId',nc_id,'nonconformityCode',nc_code,'actionPlanId',plan_id,'status','OPEN');
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(m.organization_id,m.unit_id,'DeviationPlanOpened','melhoria',plan_id,1,auth.uid(),answer);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),m.organization_id,encode(digest(p_payload::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

create or replace function public.complete_meeting(p_meeting_id uuid, p_expected_version integer, p_operation_id uuid, p_minutes text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.meetings; prior jsonb; answer jsonb; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior || jsonb_build_object('duplicate',true); end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if not found then raise exception 'Meeting not found' using errcode='P0002'; end if;
  if not app.can_access(m.organization_id,m.unit_id,'reunioes','encerrar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if m.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if m.status not in ('SCHEDULED','IN_PROGRESS','MINUTES_PENDING') then raise exception 'Meeting cannot be completed from its current state' using errcode='22023'; end if;
  if length(trim(p_minutes))<10 then raise exception 'Minutes are required' using errcode='22023'; end if;
  update public.meetings set status='COMPLETED',minutes=p_minutes,ends_at=coalesce(ends_at,now()),updated_by=auth.uid()
  where id=m.id returning version into next_version;
  answer := jsonb_build_object('id',m.id,'status','COMPLETED','version',next_version,'completedAt',now());
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(m.organization_id,m.unit_id,'MeetingCompleted','reunioes',m.id,next_version,auth.uid(),jsonb_build_object('referralsPreserved',true));
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),m.organization_id,encode(digest(p_minutes,'sha256'),'hex'),answer);
  return answer;
end;
$$;

revoke all on function public.approve_protocol_version(uuid,integer,uuid) from public,anon;
revoke all on function public.publish_protocol_version(uuid,integer,uuid) from public,anon;
revoke all on function public.complete_execution(uuid,integer,uuid,jsonb) from public,anon;
revoke all on function public.open_measurement_plan(uuid,integer,uuid,jsonb) from public,anon;
revoke all on function public.complete_meeting(uuid,integer,uuid,text) from public,anon;
grant execute on function public.approve_protocol_version(uuid,integer,uuid) to authenticated;
grant execute on function public.publish_protocol_version(uuid,integer,uuid) to authenticated;
grant execute on function public.complete_execution(uuid,integer,uuid,jsonb) to authenticated;
grant execute on function public.open_measurement_plan(uuid,integer,uuid,jsonb) to authenticated;
grant execute on function public.complete_meeting(uuid,integer,uuid,text) to authenticated;
