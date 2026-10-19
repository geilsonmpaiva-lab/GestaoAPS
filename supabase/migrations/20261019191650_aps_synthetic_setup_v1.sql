-- Additive, explicitly synthetic-only setup. It runs only when invoked by an
-- authorized actor; applying the migration creates no flags or business records.
create function app.prepare_aps_synthetic_v1(p_organization_id uuid, p_synthetic boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare org constant uuid := '362db1a9-bfdd-4334-9436-46b1c0117eab'; key_name text;
begin
  if p_organization_id is distinct from org or p_synthetic is distinct from true or auth.uid() is null
    or not exists(select 1 from public.organizations o where o.id=org and o.name like '[HOMOLOGAÇÃO]%' and o.deleted_at is null and o.status='ACTIVE')
    or not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
      where m.user_id=auth.uid() and m.organization_id=org and m.unit_id is null and m.role='ADMIN_SISTEMA'
        and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) and ('*'=any(m.domains) or 'administracao'=any(m.domains)))
  then raise exception 'Preparação sintética não autorizada.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(org::text || ':aps-synthetic-setup',0));
  foreach key_name in array array['esf.producao','esf.producao.catalog_approved','ux_aps_v3'] loop
    -- A previous explicit false is never overridden by a bootstrap command.
    if exists(select 1 from public.feature_flags f where f.organization_id=org and f.unit_id is null and f.key=key_name and not f.enabled)
      then raise exception 'Existe uma configuração desabilitada explicitamente. Solicite revisão.' using errcode='22023'; end if;
    insert into public.feature_flags(organization_id,unit_id,key,enabled,reason,updated_by)
      select org,null,key_name,true,'[HOMOLOGAÇÃO] Testes exclusivamente sintéticos. Não representa aprovação do catálogo institucional.',auth.uid()
      where not exists(select 1 from public.feature_flags f where f.organization_id=org and f.unit_id is null and f.key=key_name);
  end loop;
  return jsonb_build_object('synthetic',true,'organizationId',org,'ready',true);
end $$;
revoke all on function app.prepare_aps_synthetic_v1(uuid,boolean) from public,anon,authenticated;
grant execute on function app.prepare_aps_synthetic_v1(uuid,boolean) to authenticated;
create function public.staging_prepare_aps_v1(p_organization_id uuid,p_synthetic boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select app.prepare_aps_synthetic_v1(p_organization_id,p_synthetic); $$;
revoke all on function public.staging_prepare_aps_v1(uuid,boolean) from public,anon;
grant execute on function public.staging_prepare_aps_v1(uuid,boolean) to authenticated;
