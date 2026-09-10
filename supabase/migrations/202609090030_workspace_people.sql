-- Minimal colleague directory for assignee/attendance selectors. Never expose
-- email, role, contact information or another tenant's profile metadata.
create or replace function public.read_workspace_people(p_organization_id uuid,p_unit_id uuid)
returns table(id uuid,name text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.memberships own join public.profiles actor on actor.id=own.user_id and actor.status='ACTIVE'
    where own.user_id=auth.uid() and own.organization_id=p_organization_id
      and (own.unit_id is null or (p_unit_id is not null and own.unit_id=p_unit_id))
      and own.starts_at<=now() and (own.ends_at is null or own.ends_at>now())
  ) or not (
    app.can_access(p_organization_id,p_unit_id,'protocolos','visualizar')
    or app.can_access(p_organization_id,p_unit_id,'melhoria','visualizar')
    or app.can_access(p_organization_id,p_unit_id,'reunioes','visualizar')
    or app.can_access(p_organization_id,p_unit_id,'indicadores','visualizar')
    or app.can_access(p_organization_id,p_unit_id,'conhecimento','visualizar')
    or app.can_access(p_organization_id,p_unit_id,'administracao','visualizar')
  ) then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_unit_id is not null and not exists(select 1 from public.units u where u.id=p_unit_id and u.organization_id=p_organization_id and u.deleted_at is null and u.status='ACTIVE') then
    raise exception 'Unit not found' using errcode='P0002';
  end if;
  return query select distinct p.id,p.name from public.profiles p join public.memberships m on m.user_id=p.id
    where p.status='ACTIVE' and m.organization_id=p_organization_id
      and (p_unit_id is null or m.unit_id is null or m.unit_id=p_unit_id)
      and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
    order by p.name,p.id;
end; $$;
revoke all on function public.read_workspace_people(uuid,uuid) from public,anon;
grant execute on function public.read_workspace_people(uuid,uuid) to authenticated;
