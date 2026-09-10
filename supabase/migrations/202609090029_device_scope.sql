create or replace function public.register_device(p_device_id uuid, p_label text, p_platform text, p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.devices;
begin
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE' where m.user_id=auth.uid() and m.organization_id=p_organization_id and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())) then raise exception 'No active membership' using errcode='42501'; end if;
 select * into existing from public.devices where id=p_device_id for update;
 if found then
  if existing.user_id<>auth.uid() or existing.organization_id<>p_organization_id or existing.revoked_at is not null then raise exception 'Device is not authorized' using errcode='42501'; end if;
  update public.devices set label=left(p_label,120),platform=left(p_platform,240),last_verified_at=now() where id=p_device_id;
 else
  insert into public.devices(id,user_id,organization_id,label,platform,last_verified_at) values(p_device_id,auth.uid(),p_organization_id,left(p_label,120),left(p_platform,240),now());
 end if;
 return jsonb_build_object('id',p_device_id,'organizationId',p_organization_id,'verifiedAt',now());
end; $$;
revoke all on function public.register_device(uuid,text,text,uuid) from public,anon;
grant execute on function public.register_device(uuid,text,text,uuid) to authenticated;
