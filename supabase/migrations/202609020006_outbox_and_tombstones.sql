-- Every domain mutation emits a compact event in the same database transaction.
create or replace function app.emit_domain_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  source_row jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  is_tombstone boolean := tg_op='DELETE' or (source_row ? 'deleted_at' and nullif(source_row->>'deleted_at','') is not null);
  event_name text;
  aggregate_version integer;
begin
  event_name := case when is_tombstone then 'EntityTombstoned' when tg_op='INSERT' then 'EntityCreated' else 'EntityUpdated' end;
  aggregate_version := coalesce(nullif(source_row->>'version','')::integer,nullif(source_row->>'version_number','')::integer,1);
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(
    (source_row->>'organization_id')::uuid,
    nullif(source_row->>'unit_id','')::uuid,
    event_name,
    tg_argv[0],
    (source_row->>'id')::uuid,
    aggregate_version,
    auth.uid(),
    jsonb_build_object('entityType',tg_table_name,'tombstone',is_tombstone,'changedAt',coalesce(source_row->>'updated_at',source_row->>'created_at',now()::text))
  );
  return coalesce(new,old);
end;
$$;

do $$
declare r record;
begin
  for r in select * from (values
    ('knowledge_items','conhecimento'),('knowledge_versions','conhecimento'),
    ('protocols','protocolos'),('protocol_versions','protocolos'),('form_versions','protocolos'),
    ('executions','protocolos'),('execution_responses','protocolos'),('evidence_links','evidencias'),
    ('indicators','indicadores'),('indicator_formula_versions','indicadores'),('targets','indicadores'),('measurements','indicadores'),('critical_analyses','indicadores'),
    ('nonconformities','melhoria'),('action_plans','melhoria'),('actions','melhoria'),('effectiveness_checks','melhoria'),
    ('meetings','reunioes'),('meeting_agenda_items','reunioes'),('meeting_participants','reunioes'),('referrals','reunioes'),
    ('audit_model_versions','qualidade'),('audit_executions','qualidade'),
    ('professionals','pessoas'),('shifts','pessoas'),('people_events','pessoas'),
    ('assets','patrimonio'),('asset_movements','patrimonio'),('maintenance_orders','patrimonio'),
    ('inventory_items','estoque'),('stock_batches','estoque'),('stock_movements','estoque'),
    ('safety_events','seguranca'),('ombudsman_cases','ouvidoria')
  ) as x(table_name,domain_name)
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.emit_domain_change(%L)',r.table_name || '_outbox',r.table_name,r.domain_name);
  end loop;
end $$;

create or replace function public.sync_changes_since(p_cursor timestamptz)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'cursor',now(),
    'changes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'type',e.event_type,'aggregateType',e.aggregate_type,'entityType',e.payload->>'entityType',
        'aggregateId',e.aggregate_id,'version',e.aggregate_version,'occurredAt',e.occurred_at,'payload',e.payload
      ) order by e.occurred_at,e.id)
      from public.domain_events e
      where e.occurred_at>coalesce(p_cursor,'epoch'::timestamptz)
        and coalesce((e.payload->>'tombstone')::boolean,false)=false
        and app.can_access(e.organization_id,e.unit_id,e.aggregate_type,'visualizar')
    ),'[]'::jsonb),
    'tombstones',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'entityType',e.payload->>'entityType','entityId',e.aggregate_id,'version',e.aggregate_version,'occurredAt',e.occurred_at
      ) order by e.occurred_at,e.id)
      from public.domain_events e
      where e.occurred_at>coalesce(p_cursor,'epoch'::timestamptz)
        and coalesce((e.payload->>'tombstone')::boolean,false)=true
        and app.can_access(e.organization_id,e.unit_id,e.aggregate_type,'visualizar')
    ),'[]'::jsonb)
  );
$$;
grant execute on function public.sync_changes_since(timestamptz) to authenticated;
