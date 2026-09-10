-- A retry must never turn an earlier rejection/conflict into an acknowledgement.
-- Only the two existing draft commands are supported by this endpoint.
create or replace function public.apply_sync_batch(p_batch jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  op jsonb; prior public.idempotency_keys; action_row public.actions; execution_row public.executions;
  results jsonb:='[]'::jsonb; answer jsonb; next_version integer; expected integer;
  org uuid; unit uuid; operation uuid; device uuid; entity uuid; fingerprint text; v_percentage integer;
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_batch->'operations') is distinct from 'array' then raise exception 'Invalid sync batch' using errcode='22023'; end if;
  if jsonb_array_length(p_batch->'operations') not between 1 and 100 or octet_length(p_batch::text)>2000000 then raise exception 'Invalid sync batch size' using errcode='22023'; end if;
  for op in select value from jsonb_array_elements(p_batch->'operations') loop
    operation:=(op->>'operationId')::uuid; device:=(op->>'deviceId')::uuid; entity:=(op->>'entityId')::uuid;
    org:=(op->>'organizationId')::uuid; unit:=nullif(op->>'unitId','')::uuid; expected:=(op->>'expectedVersion')::integer;
    if operation is null or device is null or entity is null or org is null or expected is null or expected<0 then raise exception 'Invalid sync operation' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(operation::text,0));
    fingerprint:=encode(extensions.digest(op::text,'sha256'),'hex');
    select * into prior from public.idempotency_keys where operation_id=operation;
    if found then
      if prior.user_id<>auth.uid() or prior.request_hash<>fingerprint then
        answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','operation_payload_changed');
      else
        -- Preserve accepted/rejected/conflict verbatim. The duplicate flag is
        -- descriptive and cannot be mistaken by clients for accepted work.
        answer:=prior.response||jsonb_build_object('duplicate',true);
      end if;
      results:=results||jsonb_build_array(answer); continue;
    end if;
    if not exists(select 1 from public.devices d where d.id=device and d.user_id=auth.uid() and d.organization_id=org and d.revoked_at is null and d.last_verified_at>now()-interval '72 hours') then
      answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','device_invalid_or_expired');
    elsif op->>'command'='ACTION_UPDATE_PROGRESS' then
      select * into action_row from public.actions where id=entity and organization_id=org and unit_id is not distinct from unit and deleted_at is null for update;
      if not found or not app.can_access(action_row.organization_id,action_row.unit_id,'melhoria','editar') then
        answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','entity_scope_forbidden');
      elsif action_row.status in ('CONCLUIDO','CANCELADO') then
        answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','entity_closed');
      elsif exists(select 1 from public.sync_conflicts where entity_id=entity and entity_type='melhoria' and status='OPEN') then
        answer:=jsonb_build_object('operationId',operation,'status','conflict','reason','entity_conflict_open','serverVersion',action_row.version);
      elsif action_row.version<>expected then
        insert into public.sync_conflicts(organization_id,unit_id,entity_type,entity_id,operation_id,expected_version,server_version,client_payload,server_payload)
          values(org,unit,'melhoria',entity,operation,expected,action_row.version,coalesce(op->'payload','{}'),to_jsonb(action_row));
        answer:=jsonb_build_object('operationId',operation,'status','conflict','serverVersion',action_row.version);
      elsif jsonb_typeof(op->'payload') is distinct from 'object'
        or coalesce(op->'payload'->>'percentage','') !~ '^[0-9]{1,2}$'
        or coalesce(op->'payload'->>'status',action_row.status) not in ('NAO_INICIADO','EM_ANDAMENTO','BLOQUEADO')
        or (op->'payload'->>'status'='BLOQUEADO' and length(trim(coalesce(op->'payload'->>'blockedReason','')))<3) then
        answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','invalid_payload');
      else
        v_percentage:=(op->'payload'->>'percentage')::integer;
        update public.actions set percentage=v_percentage,status=coalesce(op->'payload'->>'status',status),
          blocked_reason=case when coalesce(op->'payload'->>'status',status)='BLOQUEADO' then coalesce(nullif(op->'payload'->>'blockedReason',''),blocked_reason) else null end,
          updated_by=auth.uid() where id=entity returning version into next_version;
        answer:=jsonb_build_object('operationId',operation,'status','accepted','serverVersion',next_version);
      end if;
    elsif op->>'command'='EXECUTION_SAVE_DRAFT' then
      select * into execution_row from public.executions where id=entity and organization_id=org and unit_id is not distinct from unit and deleted_at is null for update;
      if not found or not app.can_access(execution_row.organization_id,execution_row.unit_id,'protocolos','executar') then
        answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','entity_scope_forbidden');
      elsif execution_row.status not in ('OPEN','IN_PROGRESS','PENDING_SYNC','REOPENED') then
        answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','entity_closed');
      elsif exists(select 1 from public.sync_conflicts where entity_id=entity and entity_type='protocolos' and status='OPEN') then
        answer:=jsonb_build_object('operationId',operation,'status','conflict','reason','entity_conflict_open','serverVersion',execution_row.version);
      elsif execution_row.version<>expected then
        insert into public.sync_conflicts(organization_id,unit_id,entity_type,entity_id,operation_id,expected_version,server_version,client_payload,server_payload)
          values(org,unit,'protocolos',entity,operation,expected,execution_row.version,coalesce(op->'payload','{}'),to_jsonb(execution_row));
        answer:=jsonb_build_object('operationId',operation,'status','conflict','serverVersion',execution_row.version);
      elsif jsonb_typeof(op->'payload'->'result') is distinct from 'object' or octet_length((op->'payload')::text)>100000 then
        answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','invalid_payload');
      else
        update public.executions set result=op->'payload'->'result',notes=left(coalesce(op->'payload'->>'notes',''),10000),status='PENDING_SYNC',updated_by=auth.uid()
          where id=entity returning version into next_version;
        answer:=jsonb_build_object('operationId',operation,'status','accepted','serverVersion',next_version);
      end if;
    else
      answer:=jsonb_build_object('operationId',operation,'status','rejected','reason','unsupported_command');
    end if;
    -- Forged organization identifiers must not abort the whole batch via an FK,
    -- nor write idempotency data into another tenant's organization.
    if exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.organization_id=org and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())) then
      insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(operation,auth.uid(),org,fingerprint,answer);
    end if;
    results:=results||jsonb_build_array(answer);
  end loop;
  return jsonb_build_object('cursor',now(),'results',results);
end; $$;
revoke all on function public.apply_sync_batch(jsonb) from public,anon;
grant execute on function public.apply_sync_batch(jsonb) to authenticated;
