-- Close Wave 4/5 acceptance gaps: evidence-required audits, coverage and formal inventories.
create or replace function app.validate_audit_completion() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare checklist jsonb; configured jsonb; submitted jsonb;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' then return new; end if;
  select checklist_schema into checklist from public.audit_model_versions where id=new.model_version_id;
  if jsonb_typeof(new.result->'criteria') <> 'array' then raise exception 'Audit result requires criteria' using errcode='22023'; end if;
  for configured in select value from jsonb_array_elements(coalesce(checklist->'criteria','[]'::jsonb)) loop
    select value into submitted from jsonb_array_elements(new.result->'criteria') where value->>'id'=configured->>'id' limit 1;
    if submitted is null then raise exception 'Missing audit criterion %', configured->>'id' using errcode='22023'; end if;
    if coalesce((configured->>'requiresEvidence')::boolean,false)
       and jsonb_array_length(coalesce(submitted->'evidenceAttachmentIds','[]'::jsonb))=0 then
      raise exception 'Criterion % requires evidence', configured->>'id' using errcode='22023';
    end if;
  end loop;
  return new;
end; $$;
create trigger audit_executions_validate_completion before update of status,result on public.audit_executions for each row execute function app.validate_audit_completion();

create table public.coverage_requirements(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null,
  category text not null, weekday smallint not null check(weekday between 0 and 6), starts_at time not null, ends_at time not null,
  minimum_people integer not null check(minimum_people>0), valid_from date not null, valid_until date,
  version integer not null default 1, created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key(organization_id,unit_id) references public.units(organization_id,id), check(ends_at>starts_at), check(valid_until is null or valid_until>=valid_from)
);

create table public.asset_inventories(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, title text not null,
  status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  started_at timestamptz, completed_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key(organization_id,unit_id) references public.units(organization_id,id)
);
create table public.asset_inventory_items(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null,
  inventory_id uuid not null references public.asset_inventories(id), asset_id uuid not null references public.assets(id),
  found boolean, observed_location text, observed_condition text, notes text, counted_at timestamptz, counted_by uuid references auth.users(id),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  foreign key(organization_id,unit_id) references public.units(organization_id,id), unique(inventory_id,asset_id)
);

create table public.stock_inventories(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, title text not null,
  status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  started_at timestamptz, completed_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key(organization_id,unit_id) references public.units(organization_id,id)
);
create table public.stock_inventory_counts(
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null,
  inventory_id uuid not null references public.stock_inventories(id), batch_id uuid not null references public.stock_batches(id),
  expected_quantity numeric not null, counted_quantity numeric not null check(counted_quantity>=0), difference numeric generated always as (counted_quantity-expected_quantity) stored,
  notes text, counted_at timestamptz not null default now(), counted_by uuid not null references auth.users(id), created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  foreign key(organization_id,unit_id) references public.units(organization_id,id), unique(inventory_id,batch_id)
);

do $$ declare r record; begin for r in select * from(values
 ('coverage_requirements','pessoas'),('asset_inventories','patrimonio'),('asset_inventory_items','patrimonio'),
 ('stock_inventories','estoque'),('stock_inventory_counts','estoque'))x(table_name,domain_name) loop
 execute format('alter table public.%I enable row level security',r.table_name);
 execute format('create policy %I on public.%I for select to authenticated using(app.can_access(organization_id,unit_id,%L,%L))',r.table_name||'_select',r.table_name,r.domain_name,'visualizar');
 execute format('create policy %I on public.%I for insert to authenticated with check(app.can_access(organization_id,unit_id,%L,%L))',r.table_name||'_insert',r.table_name,r.domain_name,'criar');
 execute format('create policy %I on public.%I for update to authenticated using(app.can_access(organization_id,unit_id,%L,%L)) with check(app.can_access(organization_id,unit_id,%L,%L))',r.table_name||'_update',r.table_name,r.domain_name,'editar',r.domain_name,'editar');
 execute format('grant select,insert,update on public.%I to authenticated',r.table_name);
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_change(%L)',r.table_name||'_audit',r.table_name,'');
 execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.emit_domain_change(%L)',r.table_name||'_outbox',r.table_name,r.domain_name);
 end loop; end $$;
create trigger coverage_requirements_touch before update on public.coverage_requirements for each row execute function app.touch_version();
create trigger asset_inventories_touch before update on public.asset_inventories for each row execute function app.touch_version();
create trigger stock_inventories_touch before update on public.stock_inventories for each row execute function app.touch_version();
create trigger asset_inventory_items_inventory_scope before insert or update of organization_id,unit_id,inventory_id on public.asset_inventory_items for each row execute function app.assert_reference_scope('asset_inventories','inventory_id');
create trigger asset_inventory_items_asset_scope before insert or update of organization_id,unit_id,asset_id on public.asset_inventory_items for each row execute function app.assert_reference_scope('assets','asset_id');
create trigger stock_inventory_counts_inventory_scope before insert or update of organization_id,unit_id,inventory_id on public.stock_inventory_counts for each row execute function app.assert_reference_scope('stock_inventories','inventory_id');
create trigger stock_inventory_counts_batch_scope before insert or update of organization_id,unit_id,batch_id on public.stock_inventory_counts for each row execute function app.assert_reference_scope('stock_batches','batch_id');

create or replace function public.people_coverage(p_unit_id uuid,p_from timestamptz,p_to timestamptz) returns table(bucket_start timestamptz,category text,required integer,scheduled bigint,gap integer)
language sql security invoker set search_path=public,pg_temp as $$
 select d.bucket_start,r.category,r.minimum_people,count(distinct p.id),greatest(r.minimum_people-count(distinct p.id),0)::integer
 from generate_series(p_from,p_to-'1 day'::interval,'1 day'::interval)d(bucket_start)
 join public.coverage_requirements r on r.unit_id=p_unit_id and r.weekday=extract(dow from d.bucket_start)::integer and d.bucket_start::date between r.valid_from and coalesce(r.valid_until,'infinity'::date)
 left join public.shifts s on s.unit_id=r.unit_id and s.starts_at<d.bucket_start+(r.ends_at-time '00:00') and s.ends_at>d.bucket_start+(r.starts_at-time '00:00')
 left join public.professionals p on p.id=s.professional_id and p.category=r.category and p.status='ACTIVE' and p.deleted_at is null
 where app.can_access(r.organization_id,r.unit_id,'pessoas','visualizar') group by d.bucket_start,r.id,r.category,r.minimum_people;
$$;
revoke all on function public.people_coverage(uuid,timestamptz,timestamptz) from public,anon; grant execute on function public.people_coverage(uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.start_asset_inventory(p_inventory_id uuid,p_expected_version integer,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.asset_inventories; answer jsonb; prior jsonb; next_version integer; begin
 select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
 select * into i from public.asset_inventories where id=p_inventory_id for update; if not found then raise exception 'Inventory not found' using errcode='P0002'; end if;
 if not app.can_access(i.organization_id,i.unit_id,'patrimonio','executar') then raise exception 'Forbidden' using errcode='42501'; end if; if i.version<>p_expected_version or i.status<>'OPEN' then raise exception 'Inventory state conflict' using errcode='40001'; end if;
 insert into public.asset_inventory_items(organization_id,unit_id,inventory_id,asset_id,created_by) select i.organization_id,i.unit_id,i.id,a.id,auth.uid() from public.assets a where a.organization_id=i.organization_id and a.unit_id=i.unit_id and a.deleted_at is null on conflict do nothing;
 update public.asset_inventories set status='IN_PROGRESS',started_at=now(),updated_by=auth.uid() where id=i.id returning version into next_version;
 answer=jsonb_build_object('id',i.id,'status','IN_PROGRESS','version',next_version); insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),i.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer); return answer; end $$;
revoke all on function public.start_asset_inventory(uuid,integer,uuid) from public,anon; grant execute on function public.start_asset_inventory(uuid,integer,uuid) to authenticated;

create or replace function public.count_asset_inventory_item(p_item_id uuid,p_found boolean,p_location text,p_condition text,p_notes text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.asset_inventory_items; begin select * into item from public.asset_inventory_items where id=p_item_id for update; if not found then raise exception 'Inventory item not found' using errcode='P0002'; end if;
 if not app.can_access(item.organization_id,item.unit_id,'patrimonio','executar') then raise exception 'Forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.asset_inventories where id=item.inventory_id and status='IN_PROGRESS') then raise exception 'Inventory is not in progress' using errcode='22023'; end if;
 update public.asset_inventory_items set found=p_found,observed_location=nullif(trim(p_location),''),observed_condition=nullif(trim(p_condition),''),notes=nullif(trim(p_notes),''),counted_at=now(),counted_by=auth.uid() where id=item.id;
 return jsonb_build_object('id',item.id,'counted',true); end $$;

create or replace function public.complete_asset_inventory(p_inventory_id uuid,p_expected_version integer,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.asset_inventories; pending integer; differences integer; next_version integer; answer jsonb; prior jsonb; begin
 select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
 select * into i from public.asset_inventories where id=p_inventory_id for update; if not found then raise exception 'Inventory not found' using errcode='P0002'; end if;
 if not app.can_access(i.organization_id,i.unit_id,'patrimonio','encerrar') then raise exception 'Forbidden' using errcode='42501'; end if; if i.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 select count(*) into pending from public.asset_inventory_items where inventory_id=i.id and counted_at is null; if pending>0 then raise exception 'Inventory has % pending items',pending using errcode='22023'; end if;
 select count(*) into differences from public.asset_inventory_items x join public.assets a on a.id=x.asset_id where x.inventory_id=i.id and (not x.found or x.observed_location is distinct from a.location or x.observed_condition is distinct from a.condition);
 update public.asset_inventories set status='COMPLETED',completed_at=now(),updated_by=auth.uid() where id=i.id and status='IN_PROGRESS' returning version into next_version; if next_version is null then raise exception 'Inventory is not in progress' using errcode='22023'; end if;
 answer=jsonb_build_object('id',i.id,'status','COMPLETED','version',next_version,'differences',differences); insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),i.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer); return answer; end $$;

create or replace function public.record_stock_inventory_count(p_inventory_id uuid,p_batch_id uuid,p_counted numeric,p_notes text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.stock_inventories; b public.stock_batches; count_id uuid; begin select * into i from public.stock_inventories where id=p_inventory_id for update; select * into b from public.stock_batches where id=p_batch_id;
 if i.id is null or b.id is null then raise exception 'Inventory or batch not found' using errcode='P0002'; end if; if i.organization_id<>b.organization_id or i.unit_id<>b.unit_id then raise exception 'Cross-scope count forbidden' using errcode='23514'; end if;
 if not app.can_access(i.organization_id,i.unit_id,'estoque','executar') then raise exception 'Forbidden' using errcode='42501'; end if; if i.status not in('OPEN','IN_PROGRESS') or p_counted<0 then raise exception 'Invalid stock count' using errcode='22023'; end if;
 update public.stock_inventories set status='IN_PROGRESS',started_at=coalesce(started_at,now()),updated_by=auth.uid() where id=i.id;
 insert into public.stock_inventory_counts(organization_id,unit_id,inventory_id,batch_id,expected_quantity,counted_quantity,notes,counted_by,created_by) values(i.organization_id,i.unit_id,i.id,b.id,b.quantity,p_counted,nullif(trim(p_notes),''),auth.uid(),auth.uid()) on conflict(inventory_id,batch_id) do update set counted_quantity=excluded.counted_quantity,notes=excluded.notes,counted_at=now(),counted_by=auth.uid() returning id into count_id;
 return jsonb_build_object('id',count_id,'difference',p_counted-b.quantity); end $$;

revoke all on function public.count_asset_inventory_item(uuid,boolean,text,text,text) from public,anon;
revoke all on function public.complete_asset_inventory(uuid,integer,uuid) from public,anon;
revoke all on function public.record_stock_inventory_count(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.count_asset_inventory_item(uuid,boolean,text,text,text) to authenticated;
grant execute on function public.complete_asset_inventory(uuid,integer,uuid) to authenticated;
grant execute on function public.record_stock_inventory_count(uuid,uuid,numeric,text) to authenticated;

create or replace function public.complete_stock_inventory(p_inventory_id uuid,p_expected_version integer,p_operation_id uuid,p_apply_adjustments boolean,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.stock_inventories; c public.stock_inventory_counts; next_version integer; differences integer; answer jsonb; prior jsonb; begin
 select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
 select * into i from public.stock_inventories where id=p_inventory_id for update; if not found then raise exception 'Inventory not found' using errcode='P0002'; end if;
 if not app.can_access(i.organization_id,i.unit_id,'estoque','encerrar') then raise exception 'Forbidden' using errcode='42501'; end if; if i.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
 if i.status<>'IN_PROGRESS' or not exists(select 1 from public.stock_inventory_counts where inventory_id=i.id) then raise exception 'Inventory has no completed counts' using errcode='22023'; end if;
 if p_apply_adjustments and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Adjustment reason is required' using errcode='22023'; end if;
 select count(*) into differences from public.stock_inventory_counts where inventory_id=i.id and difference<>0;
 if p_apply_adjustments then for c in select * from public.stock_inventory_counts where inventory_id=i.id and difference<>0 loop
   update public.stock_batches set quantity=c.counted_quantity,updated_by=auth.uid() where id=c.batch_id;
   insert into public.stock_movements(organization_id,unit_id,inventory_item_id,batch_id,movement_type,quantity,reason,created_by)
   select c.organization_id,c.unit_id,b.inventory_item_id,c.batch_id,'ADJUSTMENT',abs(c.difference),'Inventário: '||trim(p_reason),auth.uid() from public.stock_batches b where b.id=c.batch_id;
 end loop; end if;
 update public.stock_inventories set status='COMPLETED',completed_at=now(),updated_by=auth.uid() where id=i.id returning version into next_version;
 answer=jsonb_build_object('id',i.id,'status','COMPLETED','version',next_version,'differences',differences,'adjusted',p_apply_adjustments); insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),i.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer); return answer; end $$;
revoke all on function public.complete_stock_inventory(uuid,integer,uuid,boolean,text) from public,anon; grant execute on function public.complete_stock_inventory(uuid,integer,uuid,boolean,text) to authenticated;
