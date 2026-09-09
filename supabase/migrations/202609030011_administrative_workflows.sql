-- Wave 5: schedule integrity, append-only movements and transactional balances.
alter table public.shifts add constraint shifts_no_overlap exclude using gist(professional_id with =,tstzrange(starts_at,ends_at,'[)') with &&);
alter table public.stock_batches add constraint stock_batches_nonnegative check(quantity>=0);
alter table public.asset_movements add constraint asset_movements_type_check check(movement_type in ('TRANSFER','STATUS_CHANGE','INVENTORY_ADJUSTMENT'));

revoke update on public.asset_movements,public.stock_movements from authenticated;
create trigger asset_movements_audit after insert or delete on public.asset_movements for each row execute function app.audit_change('');
create trigger stock_movements_audit after insert or delete on public.stock_movements for each row execute function app.audit_change('');

create or replace function public.move_asset(p_asset_id uuid,p_expected_version integer,p_operation_id uuid,p_to_location text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare asset public.assets; prior jsonb; answer jsonb; movement_id uuid; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  select * into asset from public.assets where id=p_asset_id for update; if not found then raise exception 'Asset not found' using errcode='P0002'; end if;
  if not app.can_access(asset.organization_id,asset.unit_id,'patrimonio','editar') then raise exception 'Forbidden' using errcode='42501'; end if; if asset.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if length(trim(coalesce(p_to_location,'')))<2 or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Destination and reason are required' using errcode='22023'; end if;
  insert into public.asset_movements(organization_id,unit_id,asset_id,movement_type,from_location,to_location,reason,created_by) values(asset.organization_id,asset.unit_id,asset.id,'TRANSFER',asset.location,p_to_location,p_reason,auth.uid()) returning id into movement_id;
  update public.assets set location=p_to_location,updated_by=auth.uid() where id=asset.id returning version into next_version;
  answer:=jsonb_build_object('id',asset.id,'movementId',movement_id,'location',p_to_location,'version',next_version); insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),asset.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer); return answer;
end; $$;

create or replace function public.record_stock_movement(p_batch_id uuid,p_expected_version integer,p_operation_id uuid,p_movement_type text,p_quantity numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare batch public.stock_batches; prior jsonb; answer jsonb; movement_id uuid; resulting numeric; recorded_quantity numeric; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  if p_movement_type not in ('ENTRY','EXIT','LOSS','ADJUSTMENT') or p_quantity<0 then raise exception 'Invalid stock movement' using errcode='22023'; end if;
  select * into batch from public.stock_batches where id=p_batch_id for update; if not found then raise exception 'Stock batch not found' using errcode='P0002'; end if;
  if not app.can_access(batch.organization_id,batch.unit_id,'estoque','editar') then raise exception 'Forbidden' using errcode='42501'; end if; if batch.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if p_movement_type='ENTRY' then resulting:=batch.quantity+p_quantity; recorded_quantity:=p_quantity;
  elsif p_movement_type in ('EXIT','LOSS') then resulting:=batch.quantity-p_quantity; recorded_quantity:=p_quantity;
  else resulting:=p_quantity; recorded_quantity:=abs(batch.quantity-p_quantity); end if;
  if resulting<0 then raise exception 'Insufficient stock' using errcode='22023'; end if; if recorded_quantity<=0 then raise exception 'Movement must change stock' using errcode='22023'; end if;
  insert into public.stock_movements(organization_id,unit_id,inventory_item_id,batch_id,movement_type,quantity,reason,created_by) values(batch.organization_id,batch.unit_id,batch.inventory_item_id,batch.id,p_movement_type,recorded_quantity,p_reason,auth.uid()) returning id into movement_id;
  update public.stock_batches set quantity=resulting,updated_by=auth.uid() where id=batch.id returning version into next_version;
  answer:=jsonb_build_object('id',batch.id,'movementId',movement_id,'quantity',resulting,'version',next_version); insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),batch.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer); return answer;
end; $$;

revoke all on function public.move_asset(uuid,integer,uuid,text,text) from public,anon;
revoke all on function public.record_stock_movement(uuid,integer,uuid,text,numeric,text) from public,anon;
grant execute on function public.move_asset(uuid,integer,uuid,text,text) to authenticated;
grant execute on function public.record_stock_movement(uuid,integer,uuid,text,numeric,text) to authenticated;
