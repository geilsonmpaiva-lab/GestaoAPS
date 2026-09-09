create or replace function app.prevent_published_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status in ('PUBLISHED','PUBLICADO') then
    raise exception 'Published versions are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger knowledge_versions_immutable before update or delete on public.knowledge_versions
for each row execute function app.prevent_published_change();
create trigger protocol_versions_immutable before update or delete on public.protocol_versions
for each row execute function app.prevent_published_change();

do $$
declare r record;
begin
  for r in select * from (values
    ('knowledge_items','conhecimento'), ('knowledge_versions','conhecimento'),
    ('protocols','protocolos'), ('protocol_versions','protocolos'), ('form_versions','protocolos'),
    ('executions','protocolos'), ('execution_responses','protocolos'), ('evidence_links','evidencias'),
    ('indicators','indicadores'), ('indicator_formula_versions','indicadores'), ('targets','indicadores'),
    ('measurements','indicadores'), ('critical_analyses','indicadores'),
    ('nonconformities','melhoria'), ('action_plans','melhoria'), ('actions','melhoria'), ('effectiveness_checks','melhoria'),
    ('notifications','notificacoes'), ('meetings','reunioes'), ('meeting_agenda_items','reunioes'),
    ('meeting_participants','reunioes'), ('referrals','reunioes'),
    ('audit_model_versions','qualidade'), ('audit_executions','qualidade'),
    ('professionals','pessoas'), ('shifts','pessoas'), ('people_events','pessoas'),
    ('assets','patrimonio'), ('asset_movements','patrimonio'), ('maintenance_orders','patrimonio'),
    ('inventory_items','estoque'), ('stock_batches','estoque'), ('stock_movements','estoque'),
    ('safety_events','seguranca'), ('ombudsman_cases','ouvidoria'), ('import_jobs','administracao')
  ) as x(table_name, domain_name)
  loop
    execute format('alter table public.%I enable row level security', r.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (app.can_access(organization_id, unit_id, %L, %L))',
      r.table_name || '_select', r.table_name, r.domain_name, 'visualizar'
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (app.can_access(organization_id, unit_id, %L, %L))',
      r.table_name || '_insert', r.table_name, r.domain_name, 'criar'
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (app.can_access(organization_id, unit_id, %L, %L)) with check (app.can_access(organization_id, unit_id, %L, %L))',
      r.table_name || '_update', r.table_name, r.domain_name, 'editar', r.domain_name, 'editar'
    );
    execute format('grant select, insert, update on public.%I to authenticated', r.table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'knowledge_items','protocols','executions','execution_responses','indicators','targets','measurements',
    'nonconformities','action_plans','actions','meetings','meeting_agenda_items','referrals','audit_executions',
    'professionals','shifts','people_events','assets','maintenance_orders','inventory_items','stock_batches',
    'safety_events','ombudsman_cases'
  ]
  loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_version()', table_name || '_touch', table_name);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('knowledge_items',false), ('knowledge_versions',false), ('protocols',false), ('protocol_versions',false),
    ('executions',false), ('attachments',true), ('indicators',false), ('targets',false), ('measurements',false),
    ('nonconformities',false), ('action_plans',false), ('actions',false), ('meetings',false),
    ('audit_executions',false), ('professionals',true), ('people_events',true), ('assets',false),
    ('inventory_items',false), ('safety_events',true), ('ombudsman_cases',true)
  ) as x(table_name, restricted)
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_change(%L)',
      r.table_name || '_audit', r.table_name, case when r.restricted then 'restricted' else '' end
    );
  end loop;
end $$;

create or replace function public.publish_protocol_version(p_version_id uuid)
returns public.protocol_versions
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v public.protocol_versions;
begin
  select * into v from public.protocol_versions where id = p_version_id for update;
  if not found then raise exception 'Protocol version not found' using errcode = 'P0002'; end if;
  if not app.can_access(v.organization_id, v.unit_id, 'protocolos', 'publicar') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v.status <> 'APROVADO' then raise exception 'Only approved versions can be published' using errcode = '22023'; end if;

  update public.protocol_versions
    set status = 'OBSOLETO'
    where protocol_id = v.protocol_id and status = 'PUBLICADO' and id <> v.id;
  update public.protocol_versions set status = 'PUBLICADO', published_at = now() where id = v.id returning * into v;
  update public.protocols set status = 'PUBLICADO' where id = v.protocol_id;
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(v.organization_id,v.unit_id,'ProtocolPublished','protocols',v.protocol_id,v.version_number,auth.uid(),jsonb_build_object('protocolVersionId',v.id));
  return v;
end;
$$;
grant execute on function public.publish_protocol_version(uuid) to authenticated;

create or replace function public.sync_bootstrap(p_unit_id uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'cursor', now(),
    'unitId', p_unit_id,
    'units', coalesce((select jsonb_agg(to_jsonb(u)) from public.units u where (p_unit_id is null or u.id=p_unit_id) and app.can_access(u.organization_id,u.id,'administracao','visualizar')), '[]'::jsonb),
    'knowledge', coalesce((select jsonb_agg(to_jsonb(k)) from public.knowledge_items k where (p_unit_id is null or k.unit_id is null or k.unit_id=p_unit_id) and deleted_at is null), '[]'::jsonb),
    'protocols', coalesce((select jsonb_agg(to_jsonb(p)) from public.protocols p where (p_unit_id is null or p.unit_id is null or p.unit_id=p_unit_id) and deleted_at is null), '[]'::jsonb),
    'executions', coalesce((select jsonb_agg(to_jsonb(e)) from public.executions e where (p_unit_id is null or e.unit_id=p_unit_id) and deleted_at is null), '[]'::jsonb),
    'featureFlags', coalesce((select jsonb_object_agg(f.key,f.enabled) from public.feature_flags f where (p_unit_id is null or f.unit_id is null or f.unit_id=p_unit_id)), '{}'::jsonb)
  );
$$;
grant execute on function public.sync_bootstrap(uuid) to authenticated;

create or replace function public.sync_changes_since(p_cursor timestamptz)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'cursor', now(),
    'changes', coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'type',e.event_type,'aggregateType',e.aggregate_type,'aggregateId',e.aggregate_id,
      'version',e.aggregate_version,'occurredAt',e.occurred_at,'payload',e.payload
    ) order by e.occurred_at,e.id) filter (where e.id is not null), '[]'::jsonb),
    'tombstones', '[]'::jsonb
  )
  from public.domain_events e
  where e.occurred_at > coalesce(p_cursor,'epoch'::timestamptz)
    and app.can_access(e.organization_id,e.unit_id,e.aggregate_type,'visualizar');
$$;
grant execute on function public.sync_changes_since(timestamptz) to authenticated;

create or replace function public.apply_sync_batch(p_batch jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  op jsonb;
  prior jsonb;
  current_version integer;
  result jsonb := '[]'::jsonb;
  op_response jsonb;
begin
  for op in select * from jsonb_array_elements(coalesce(p_batch->'operations','[]'::jsonb))
  loop
    select response into prior from public.idempotency_keys
      where operation_id = (op->>'operationId')::uuid and user_id = auth.uid();
    if prior is not null then
      result := result || jsonb_build_array(prior || jsonb_build_object('status','duplicate'));
      continue;
    end if;

    if not app.can_access((op->>'organizationId')::uuid, nullif(op->>'unitId','')::uuid, op->>'entityType', 'editar') then
      op_response := jsonb_build_object('operationId',op->>'operationId','status','rejected','reason','forbidden');
    elsif op->>'command' = 'ACTION_UPDATE_PROGRESS' then
      select version into current_version from public.actions where id=(op->>'entityId')::uuid;
      if current_version is distinct from (op->>'expectedVersion')::integer then
        insert into public.sync_conflicts(organization_id,unit_id,entity_type,entity_id,operation_id,expected_version,server_version,client_payload,server_payload)
        select organization_id,unit_id,'melhoria',id,(op->>'operationId')::uuid,(op->>'expectedVersion')::integer,version,op->'payload',to_jsonb(a)
        from public.actions a where id=(op->>'entityId')::uuid;
        op_response := jsonb_build_object('operationId',op->>'operationId','status','conflict','serverVersion',current_version);
      else
        update public.actions set
          percentage = least(100,greatest(0,(op->'payload'->>'percentage')::integer)),
          status = coalesce(op->'payload'->>'status',status),
          completed_at = case when op->'payload'->>'status'='CONCLUIDO' then coalesce(completed_at,now()) else completed_at end
        where id=(op->>'entityId')::uuid
        returning version into current_version;
        op_response := jsonb_build_object('operationId',op->>'operationId','status','accepted','serverVersion',current_version);
      end if;
    elsif op->>'command' = 'EXECUTION_SAVE_DRAFT' then
      select version into current_version from public.executions where id=(op->>'entityId')::uuid;
      if current_version is distinct from (op->>'expectedVersion')::integer then
        insert into public.sync_conflicts(organization_id,unit_id,entity_type,entity_id,operation_id,expected_version,server_version,client_payload,server_payload)
        select organization_id,unit_id,'protocolos',id,(op->>'operationId')::uuid,(op->>'expectedVersion')::integer,version,op->'payload',to_jsonb(e)
        from public.executions e where id=(op->>'entityId')::uuid;
        op_response := jsonb_build_object('operationId',op->>'operationId','status','conflict','serverVersion',current_version);
      else
        update public.executions set result=op->'payload'->'result', notes=op->'payload'->>'notes', status='PENDING_SYNC'
        where id=(op->>'entityId')::uuid returning version into current_version;
        op_response := jsonb_build_object('operationId',op->>'operationId','status','accepted','serverVersion',current_version);
      end if;
    else
      op_response := jsonb_build_object('operationId',op->>'operationId','status','rejected','reason','unsupported_command');
    end if;

    insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
    values((op->>'operationId')::uuid,auth.uid(),(op->>'organizationId')::uuid,encode(digest(op::text,'sha256'),'hex'),op_response);
    result := result || jsonb_build_array(op_response);
  end loop;
  return jsonb_build_object('cursor',now(),'results',result);
end;
$$;
grant execute on function public.apply_sync_batch(jsonb) to authenticated;

create or replace function public.resolve_sync_conflict(p_conflict_id uuid, p_resolution jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare c public.sync_conflicts;
begin
  select * into c from public.sync_conflicts where id=p_conflict_id and status='OPEN' for update;
  if not found then raise exception 'Conflict not found' using errcode='P0002'; end if;
  if not app.can_access(c.organization_id,c.unit_id,c.entity_type,'reabrir') then raise exception 'Forbidden' using errcode='42501'; end if;
  update public.sync_conflicts set
    status='RESOLVED', resolution=p_resolution->>'strategy', justification=p_resolution->>'justification',
    resolved_by=auth.uid(), resolved_at=now()
  where id=p_conflict_id;
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(c.organization_id,c.unit_id,'SyncConflictResolved',c.entity_type,c.entity_id,c.server_version,auth.uid(),jsonb_build_object('conflictId',c.id,'strategy',p_resolution->>'strategy'));
  return jsonb_build_object('id',p_conflict_id,'status','resolved','resolvedAt',now());
end;
$$;
grant execute on function public.resolve_sync_conflict(uuid,jsonb) to authenticated;

create or replace function public.refresh_due_notifications()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare inserted_count integer;
begin
  insert into public.notifications(organization_id,unit_id,user_id,kind,severity,source_type,source_id,title,due_at,fingerprint)
  select a.organization_id,a.unit_id,a.who_id,'ACTION_OVERDUE','CRITICAL','actions',a.id,'Ação vencida: ' || a.what,a.when_at,'action-overdue:' || a.id::text
  from public.actions a
  where a.when_at < now() and a.status not in ('CONCLUIDO','CANCELADO') and a.who_id is not null and a.deleted_at is null
  on conflict(user_id,fingerprint) do update set resolved_at=null, due_at=excluded.due_at;
  get diagnostics inserted_count = row_count;
  update public.notifications n set resolved_at=now()
    where n.kind='ACTION_OVERDUE' and n.resolved_at is null
      and not exists(select 1 from public.actions a where a.id=n.source_id and a.when_at<now() and a.status not in ('CONCLUIDO','CANCELADO'));
  return inserted_count;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('evidence','evidence',false,26214400,array['application/pdf','image/jpeg','image/png','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false;

create policy evidence_object_read on storage.objects for select to authenticated
using (
  bucket_id='evidence'
  and app.can_access(
    ((storage.foldername(name))[1])::uuid,
    nullif((storage.foldername(name))[2],'organization')::uuid,
    'evidencias','visualizar'
  )
);
create policy evidence_object_write on storage.objects for insert to authenticated
with check (
  bucket_id='evidence'
  and owner_id=auth.uid()::text
  and app.can_access(
    ((storage.foldername(name))[1])::uuid,
    nullif((storage.foldername(name))[2],'organization')::uuid,
    'evidencias','criar'
  )
);

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('sgc-refresh-due-notifications','*/15 * * * *','select public.refresh_due_notifications()');
  end if;
exception when others then
  raise notice 'Cron will be configured after pg_cron is enabled: %', sqlerrm;
end $$;
