-- Additive Preview adapter. No existing function, grant or business row changes.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely; catch it before returning.
create function public.staging_update_action(
  p_action_id uuid, p_expected_version integer, p_operation_id uuid, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item public.actions; answer jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id=auth.uid() and status='ACTIVE'
  ) then raise exception 'Forbidden' using errcode='42501'; end if;

  -- Check CURRENT access before the existing command can return a cached result.
  select * into item from public.actions where id=p_action_id and deleted_at is null;
  if not found then raise exception 'Action not found' using errcode='P0002'; end if;
  if not app.can_access(item.organization_id,item.unit_id,'melhoria','editar')
     or not exists (select 1 from public.organizations where id=item.organization_id
       and name like '[HOMOLOGAÇÃO]%' and status='ACTIVE' and deleted_at is null)
  then raise exception 'Synthetic staging scope required' using errcode='42501'; end if;

  answer := public.update_action(p_action_id,p_expected_version,p_operation_id,p_payload);
  if answer->>'id' is distinct from p_action_id::text then
    raise exception 'Operation belongs to another action' using errcode='22023';
  end if;
  return answer;
exception when sqlstate '40001' then
  raise sqlstate 'PT409' using message='Version conflict';
end;
$$;
revoke all on function public.staging_update_action(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.staging_update_action(uuid,integer,uuid,jsonb) to authenticated;
comment on function public.staging_update_action(uuid,integer,uuid,jsonb) is
  'Additive synthetic-staging adapter: authorization before replay and bounded HTTP 409 conflicts. Existing update_action remains unchanged.';
