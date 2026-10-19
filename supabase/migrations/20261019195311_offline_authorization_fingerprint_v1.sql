-- Additive, own-actor metadata only; no tables, grants or business records are changed.
create function app.offline_authorization_fingerprint_v1(p_organization_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid(); snapshot jsonb;
begin
 if actor is null or p_organization_id is distinct from '362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid
 or not exists(select 1 from public.profiles p where p.id=actor and p.status='ACTIVE')
 or not exists(select 1 from public.organizations o where o.id=p_organization_id and o.status='ACTIVE' and o.deleted_at is null)
 or not exists(select 1 from public.memberships m where m.user_id=actor and m.organization_id=p_organization_id
   and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()))
 then raise exception 'Sem autorização para renovar o cofre.' using errcode='42501'; end if;
 with memberships as (
   select m.id,m.unit_id,m.role,m.domains,m.operations,m.starts_at,m.ends_at,
     m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) as active
   from public.memberships m where m.user_id=actor and m.organization_id=p_organization_id
 ), grants as (
   select g.id,g.unit_id,g.team_id,g.areas,g.enabled,g.nominal,g.can_write,g.can_review,g.can_validate,g.can_close,g.municipal
   from app.epi_grants_v1 g where g.user_id=actor and g.organization_id=p_organization_id
 ), assignments as (
   select tm.id,tm.unit_id,tm.team_id,tm.deleted_at from public.esf_team_members tm
   where tm.user_id=actor and tm.organization_id=p_organization_id
 ), units as (
   select u.id,u.status,u.deleted_at from public.units u where u.organization_id=p_organization_id
   and (exists(select 1 from memberships m where m.unit_id is null or m.unit_id=u.id)
     or exists(select 1 from grants g where g.municipal or g.unit_id=u.id)
     or exists(select 1 from assignments tm where tm.unit_id=u.id))
 ), teams as (
   select t.id,t.unit_id,t.status,t.deleted_at from public.esf_teams t
   where t.organization_id=p_organization_id and exists(select 1 from units u where u.id=t.unit_id)
 )
 select jsonb_build_object('version',1,'actor',actor,'organizationId',p_organization_id,
   'memberships',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from memberships m),'[]'::jsonb),
   'grants',coalesce((select jsonb_agg(to_jsonb(g) order by g.id) from grants g),'[]'::jsonb),
   'assignments',coalesce((select jsonb_agg(to_jsonb(tm) order by tm.id) from assignments tm),'[]'::jsonb),
   'units',coalesce((select jsonb_agg(to_jsonb(u) order by u.id) from units u),'[]'::jsonb),
   'teams',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from teams t),'[]'::jsonb)) into snapshot;
 -- The private snapshot never leaves this function. It contains no names or clinical values.
 return jsonb_build_object('version',1,'userId',actor,'organizationId',p_organization_id,
   'digest',encode(extensions.digest(snapshot::text,'sha256'),'hex'));
end $$;
revoke all on function app.offline_authorization_fingerprint_v1(uuid) from public,anon;
grant execute on function app.offline_authorization_fingerprint_v1(uuid) to authenticated;
create function public.staging_own_offline_authorization_v1(p_organization_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select app.offline_authorization_fingerprint_v1(p_organization_id); $$;
revoke all on function public.staging_own_offline_authorization_v1(uuid) from public,anon;
grant execute on function public.staging_own_offline_authorization_v1(uuid) to authenticated;
