-- Operational transitions and idempotent alerts processed by the existing Cron job.
alter table public.maintenance_orders add constraint maintenance_orders_status_check check(status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED'));

create or replace function public.transition_maintenance_order(p_order_id uuid,p_expected_version integer,p_operation_id uuid,p_target_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare work_order public.maintenance_orders; asset public.assets; prior jsonb; answer jsonb; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  select * into work_order from public.maintenance_orders where id=p_order_id for update; if not found then raise exception 'Maintenance order not found' using errcode='P0002'; end if;
  if not app.can_access(work_order.organization_id,work_order.unit_id,'patrimonio','editar') then raise exception 'Forbidden' using errcode='42501'; end if; if work_order.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if (p_target_status='IN_PROGRESS' and work_order.status<>'OPEN') or (p_target_status='COMPLETED' and work_order.status<>'IN_PROGRESS') then raise exception 'Invalid maintenance transition' using errcode='22023'; end if;
  update public.maintenance_orders set status=p_target_status,completed_at=case when p_target_status='COMPLETED' then now() else null end,updated_by=auth.uid() where id=work_order.id returning version into next_version;
  select * into asset from public.assets where id=work_order.asset_id for update;
  update public.assets set status=case when p_target_status='IN_PROGRESS' then 'MAINTENANCE' else 'AVAILABLE' end,updated_by=auth.uid() where id=asset.id;
  answer:=jsonb_build_object('id',work_order.id,'status',p_target_status,'version',next_version,'assetId',asset.id,'assetStatus',case when p_target_status='IN_PROGRESS' then 'MAINTENANCE' else 'AVAILABLE' end);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),work_order.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer); return answer;
end; $$;

create or replace function public.refresh_due_notifications() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer:=0; current_count integer;
begin
  insert into public.notifications(organization_id,unit_id,user_id,kind,severity,source_type,source_id,title,due_at,fingerprint)
  select a.organization_id,a.unit_id,a.who_id,'ACTION_OVERDUE','CRITICAL','actions',a.id,'Ação vencida: '||a.what,a.when_at,'action-overdue:'||a.id from public.actions a where a.when_at<now() and a.status not in ('CONCLUIDO','CANCELADO') and a.who_id is not null and a.deleted_at is null
  on conflict(user_id,fingerprint) do update set resolved_at=null,due_at=excluded.due_at; get diagnostics current_count=row_count; affected:=affected+current_count;

  insert into public.notifications(organization_id,unit_id,user_id,kind,severity,source_type,source_id,title,due_at,fingerprint)
  select i.organization_id,i.unit_id,m.user_id,'LOW_STOCK','ATTENTION','inventory_items',i.id,'Estoque abaixo do mínimo: '||i.name,null,'low-stock:'||i.id from public.inventory_items i join public.memberships m on m.organization_id=i.organization_id and (m.unit_id is null or m.unit_id=i.unit_id) and m.role in ('GESTOR_ORGANIZACAO','GERENTE_UBS') and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) where i.deleted_at is null and i.status='ACTIVE' and coalesce((select sum(b.quantity) from public.stock_batches b where b.inventory_item_id=i.id),0)<=i.minimum_stock
  on conflict(user_id,fingerprint) do update set resolved_at=null; get diagnostics current_count=row_count; affected:=affected+current_count;

  insert into public.notifications(organization_id,unit_id,user_id,kind,severity,source_type,source_id,title,due_at,fingerprint)
  select b.organization_id,b.unit_id,m.user_id,'BATCH_EXPIRING','ATTENTION','stock_batches',b.id,'Lote próximo do vencimento: '||i.name,b.expires_on::timestamptz,'batch-expiring:'||b.id from public.stock_batches b join public.inventory_items i on i.id=b.inventory_item_id join public.memberships m on m.organization_id=b.organization_id and (m.unit_id is null or m.unit_id=b.unit_id) and m.role in ('GESTOR_ORGANIZACAO','GERENTE_UBS') and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) where b.quantity>0 and b.expires_on between current_date and current_date+60
  on conflict(user_id,fingerprint) do update set resolved_at=null,due_at=excluded.due_at; get diagnostics current_count=row_count; affected:=affected+current_count;

  insert into public.notifications(organization_id,unit_id,user_id,kind,severity,source_type,source_id,title,due_at,fingerprint)
  select mt.organization_id,mt.unit_id,mt.organizer_id,'MEETING_MINUTES_PENDING','ATTENTION','meetings',mt.id,'Ata pendente: '||mt.title,mt.starts_at,'meeting-minutes:'||mt.id from public.meetings mt where mt.organizer_id is not null and mt.starts_at<now()-interval '2 hours' and mt.status in ('SCHEDULED','IN_PROGRESS','MINUTES_PENDING') and mt.deleted_at is null
  on conflict(user_id,fingerprint) do update set resolved_at=null,due_at=excluded.due_at; get diagnostics current_count=row_count; affected:=affected+current_count;

  insert into public.notifications(organization_id,unit_id,user_id,kind,severity,source_type,source_id,title,due_at,fingerprint)
  select work.organization_id,work.unit_id,m.user_id,'MAINTENANCE_OVERDUE','CRITICAL','maintenance_orders',work.id,'Manutenção vencida: '||asset.name,work.due_at,'maintenance-overdue:'||work.id from public.maintenance_orders work join public.assets asset on asset.id=work.asset_id join public.memberships m on m.organization_id=work.organization_id and (m.unit_id is null or m.unit_id=work.unit_id) and m.role in ('GESTOR_ORGANIZACAO','GERENTE_UBS') and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) where work.due_at<now() and work.status not in ('COMPLETED','CANCELLED')
  on conflict(user_id,fingerprint) do update set resolved_at=null,due_at=excluded.due_at; get diagnostics current_count=row_count; affected:=affected+current_count;

  update public.notifications n set resolved_at=now() where n.resolved_at is null and ((n.kind='ACTION_OVERDUE' and not exists(select 1 from public.actions a where a.id=n.source_id and a.when_at<now() and a.status not in ('CONCLUIDO','CANCELADO'))) or (n.kind='LOW_STOCK' and not exists(select 1 from public.inventory_items i where i.id=n.source_id and i.status='ACTIVE' and i.deleted_at is null and coalesce((select sum(b.quantity) from public.stock_batches b where b.inventory_item_id=i.id),0)<=i.minimum_stock)) or (n.kind='BATCH_EXPIRING' and not exists(select 1 from public.stock_batches b where b.id=n.source_id and b.quantity>0 and b.expires_on between current_date and current_date+60)) or (n.kind='MEETING_MINUTES_PENDING' and not exists(select 1 from public.meetings mt where mt.id=n.source_id and mt.status in ('SCHEDULED','IN_PROGRESS','MINUTES_PENDING'))) or (n.kind='MAINTENANCE_OVERDUE' and not exists(select 1 from public.maintenance_orders work where work.id=n.source_id and work.due_at<now() and work.status not in ('COMPLETED','CANCELLED'))));
  return affected;
end; $$;

revoke all on function public.transition_maintenance_order(uuid,integer,uuid,text) from public,anon;
grant execute on function public.transition_maintenance_order(uuid,integer,uuid,text) to authenticated;
revoke all on function public.refresh_due_notifications() from public,anon,authenticated;
