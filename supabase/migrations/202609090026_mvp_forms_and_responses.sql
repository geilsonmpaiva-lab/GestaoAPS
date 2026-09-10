-- Checklist snapshots and response commands used by the operational interface.
-- Lock the same parent as publication/execution so direct writes cannot change
-- the checklist chosen by an already published or executed protocol version.
create or replace function app.guard_protocol_form_snapshot() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare parent public.protocol_versions;
begin
  if tg_op<>'INSERT' then raise exception 'Checklist snapshots are immutable; create a new snapshot' using errcode='55000'; end if;
  select * into parent from public.protocol_versions where id=new.protocol_version_id for update;
  if not found then raise exception 'Protocol version required' using errcode='23514'; end if;
  if parent.status<>'RASCUNHO' or exists(select 1 from public.executions where protocol_version_id=parent.id) then
    raise exception 'Checklist cannot change after protocol review or execution' using errcode='55000';
  end if;
  return new;
end; $$;
create trigger form_versions_snapshot_guard before insert or update or delete on public.form_versions
for each row execute function app.guard_protocol_form_snapshot();

create or replace function public.save_protocol_form(p_version_id uuid, p_operation_id uuid, p_name text, p_fields jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.protocol_versions; prior public.idempotency_keys; answer jsonb; fid uuid; n integer; f jsonb; fingerprint text;
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  fingerprint:=encode(extensions.digest(jsonb_build_array('save_protocol_form',p_version_id,p_name,p_fields)::text,'sha256'),'hex');
  select * into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if found then
    if prior.request_hash<>fingerprint then raise exception 'Operation payload changed' using errcode='22023'; end if;
    return prior.response;
  end if;
  select * into v from public.protocol_versions where id=p_version_id for update;
  if not found then raise exception 'Version not found' using errcode='P0002'; end if;
  if not app.can_access(v.organization_id,v.unit_id,'protocolos','editar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if v.status<>'RASCUNHO' then raise exception 'Checklist requires a draft protocol version' using errcode='22023'; end if;
  if length(trim(p_name)) not between 3 and 240 or jsonb_typeof(p_fields) is distinct from 'array' then raise exception 'Invalid checklist' using errcode='22023'; end if;
  if jsonb_array_length(p_fields) not between 1 and 200 then raise exception 'Invalid checklist length' using errcode='22023'; end if;
  for f in select value from jsonb_array_elements(p_fields) loop
    if coalesce(f->>'key','') !~ '^[a-z][a-z0-9_]{0,79}$' or length(coalesce(f->>'label','')) not between 1 and 500
      or coalesce(f->>'type','') not in ('text','number','boolean') or jsonb_typeof(f->'required') is distinct from 'boolean'
    then raise exception 'Invalid checklist field' using errcode='22023'; end if;
  end loop;
  if (select count(distinct value->>'key') from jsonb_array_elements(p_fields))<>jsonb_array_length(p_fields) then raise exception 'Duplicate field key' using errcode='22023'; end if;
  select coalesce(max(version_number),0)+1 into n from public.form_versions where protocol_version_id=v.id;
  insert into public.form_versions(organization_id,unit_id,protocol_version_id,name,version_number,schema,status,created_by)
    values(v.organization_id,v.unit_id,v.id,trim(p_name),n,jsonb_build_object('fields',p_fields),'PUBLISHED',auth.uid()) returning id into fid;
  answer:=jsonb_build_object('id',fid,'version',n);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),v.organization_id,fingerprint,answer);
  return answer;
end; $$;

create or replace function public.save_execution_responses(p_execution_id uuid,p_expected_version integer,p_operation_id uuid,p_responses jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.executions; prior public.idempotency_keys; form public.form_versions; r jsonb; f jsonb; n integer; answer jsonb; fingerprint text;
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  fingerprint:=encode(extensions.digest(jsonb_build_array('save_execution_responses',p_execution_id,p_expected_version,p_responses)::text,'sha256'),'hex');
  select * into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if found then
    if prior.request_hash<>fingerprint then raise exception 'Operation payload changed' using errcode='22023'; end if;
    return prior.response;
  end if;
  select * into e from public.executions where id=p_execution_id and deleted_at is null for update;
  if not found then raise exception 'Execution not found' using errcode='P0002'; end if;
  if not app.can_access(e.organization_id,e.unit_id,'protocolos','executar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if e.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if e.status not in ('OPEN','IN_PROGRESS','PENDING_SYNC','REOPENED') then raise exception 'Execution closed' using errcode='22023'; end if;
  select * into form from public.form_versions where protocol_version_id=e.protocol_version_id order by version_number desc limit 1;
  if not found or jsonb_typeof(p_responses) is distinct from 'array' then raise exception 'Checklist required' using errcode='22023'; end if;
  if jsonb_array_length(p_responses) not between 1 and 200 then raise exception 'Invalid response count' using errcode='22023'; end if;
  if (select count(distinct value->>'fieldKey') from jsonb_array_elements(p_responses))<>jsonb_array_length(p_responses) then raise exception 'Duplicate response' using errcode='22023'; end if;
  for r in select value from jsonb_array_elements(p_responses) loop
    select value into f from jsonb_array_elements(form.schema->'fields') where value->>'key'=r->>'fieldKey';
    if not found then raise exception 'Unknown checklist field' using errcode='22023'; end if;
    if r->'value' is not null and r->'value'<>'null'::jsonb and (
       (f->>'type'='number' and jsonb_typeof(r->'value')<>'number') or
       (f->>'type'='boolean' and jsonb_typeof(r->'value')<>'boolean') or
       (f->>'type'='text' and jsonb_typeof(r->'value')<>'string')) then raise exception 'Invalid response type' using errcode='22023'; end if;
    if octet_length(coalesce(r->'value','null')::text)>16000 or length(coalesce(r->>'observation',''))>2000 then raise exception 'Response too large' using errcode='22023'; end if;
    insert into public.execution_responses(organization_id,unit_id,execution_id,field_key,value,compliant,observation,created_by,updated_by)
      values(e.organization_id,e.unit_id,e.id,r->>'fieldKey',r->'value',(r->>'compliant')::boolean,r->>'observation',auth.uid(),auth.uid())
      on conflict(execution_id,field_key) do update set value=excluded.value,compliant=excluded.compliant,observation=excluded.observation,updated_by=auth.uid();
  end loop;
  update public.executions set updated_by=auth.uid() where id=e.id returning version into n;
  answer:=jsonb_build_object('id',e.id,'version',n);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),e.organization_id,fingerprint,answer);
  return answer;
end; $$;

create or replace function app.validate_completed_checklist() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare form public.form_versions; f jsonb; response jsonb;
begin
  if new.status<>'COMPLETED' or old.status='COMPLETED' then return new; end if;
  select * into form from public.form_versions where protocol_version_id=new.protocol_version_id order by version_number desc limit 1;
  if not found then return new; end if;
  for f in select value from jsonb_array_elements(coalesce(form.schema->'fields','[]')) where value->>'required'='true' loop
    select value into response from public.execution_responses where execution_id=new.id and field_key=f->>'key';
    if response is null or response='null'::jsonb or response='""'::jsonb then raise exception 'Required checklist response missing' using errcode='22023'; end if;
  end loop;
  return new;
end; $$;
create trigger execution_required_checklist before update of status on public.executions for each row execute function app.validate_completed_checklist();
revoke all on function public.save_protocol_form(uuid,uuid,text,jsonb) from public,anon;
revoke all on function public.save_execution_responses(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.save_protocol_form(uuid,uuid,text,jsonb), public.save_execution_responses(uuid,integer,uuid,jsonb) to authenticated;
