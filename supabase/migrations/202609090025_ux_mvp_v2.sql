-- Dark launch: existing tenants retain the legacy interface until explicitly enabled.
insert into public.feature_flags (organization_id, unit_id, key, enabled, reason)
select id, null, 'ux_mvp_v2', false, 'Nova experiência em homologação; liberação explícita após aceite.'
from public.organizations
on conflict (organization_id, unit_id, key) do nothing;

-- Read only navigation metadata for the actor's own currently valid memberships.
create or replace function public.read_workspace_metadata() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
with own as (
 select m.* from public.memberships m join public.profiles p on p.id=m.user_id
 where m.user_id=auth.uid() and p.status='ACTIVE' and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
)
select jsonb_build_object(
 'organizations', coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name)) from public.organizations o where o.deleted_at is null and o.status='ACTIVE' and exists(select 1 from own m where m.organization_id=o.id)), '[]'::jsonb),
 'units', coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'organization_id',u.organization_id)) from public.units u where u.deleted_at is null and u.status='ACTIVE' and exists(select 1 from own m where m.organization_id=u.organization_id and (m.unit_id is null or m.unit_id=u.id))), '[]'::jsonb),
 'flags', coalesce((select jsonb_agg(jsonb_build_object('key',f.key,'enabled',f.enabled,'unit_id',f.unit_id,'organization_id',f.organization_id)) from public.feature_flags f where exists(select 1 from own m where m.organization_id=f.organization_id and (f.unit_id is null or m.unit_id is null or m.unit_id=f.unit_id))), '[]'::jsonb)
); $$;
revoke all on function public.read_workspace_metadata() from public, anon;
grant execute on function public.read_workspace_metadata() to authenticated;

create or replace function public.set_feature_flag(p_organization_id uuid,p_unit_id uuid,p_key text,p_enabled boolean,p_reason text) returns public.feature_flags
language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.feature_flags; normalized_key text; begin
 if not app.can_access(p_organization_id,p_unit_id,'administracao','editar') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_key not in('ux_mvp_v2','reunioes','qualidade','pessoas','patrimonio','estoque','seguranca','ouvidoria','safety_events','ombudsman','module.reunioes','module.qualidade','module.pessoas','module.patrimonio','module.estoque','module.seguranca','module.ouvidoria') then raise exception 'Unknown feature flag' using errcode='22023'; end if;
 normalized_key:=case when p_key in('seguranca','module.seguranca') then 'safety_events' when p_key in('ouvidoria','module.ouvidoria') then 'ombudsman' when p_key like 'module.%' then substr(p_key,8) else p_key end;
 if p_enabled and normalized_key in('safety_events','ombudsman') and length(trim(coalesce(p_reason,'')))<10 then raise exception 'Sensitive module activation requires an approval reason' using errcode='22023'; end if;
 insert into public.feature_flags(organization_id,unit_id,key,enabled,reason,updated_by) values(p_organization_id,p_unit_id,normalized_key,p_enabled,nullif(trim(p_reason),''),auth.uid())
 on conflict(organization_id,unit_id,key) do update set enabled=excluded.enabled,reason=excluded.reason,updated_at=now(),updated_by=auth.uid() returning * into result;
 return result; end $$;
revoke all on function public.set_feature_flag(uuid,uuid,text,boolean,text) from public,anon;
grant execute on function public.set_feature_flag(uuid,uuid,text,boolean,text) to authenticated;
