-- Team allocation is an additional restriction, never an Auth/account registration.
alter table public.esf_team_members add column version integer not null default 1;
alter table public.esf_team_members add column updated_at timestamptz not null default now();
alter table public.esf_team_members add column updated_by uuid references auth.users(id);
create trigger esf_team_members_touch before update on public.esf_team_members for each row execute function app.touch_version();

create function app.esf_can_allocate(p_org uuid,p_unit uuid,p_user uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select app.admin_scope(p_org,p_unit,'criar') and exists(
 select 1 from public.memberships recipient join public.profiles rp on rp.id=recipient.user_id and rp.status='ACTIVE'
 join public.memberships actor on actor.user_id=auth.uid() and actor.organization_id=p_org and (actor.unit_id is null or actor.unit_id=p_unit)
 join public.profiles ap on ap.id=actor.user_id and ap.status='ACTIVE'
 where recipient.user_id=p_user and recipient.organization_id=p_org and (recipient.unit_id is null or recipient.unit_id=p_unit)
 and recipient.role in ('RESPONSAVEL_DOMINIO','EXECUTOR','AUDITOR','LEITOR')
 and recipient.starts_at<=now() and (recipient.ends_at is null or recipient.ends_at>now())
 and actor.starts_at<=now() and (actor.ends_at is null or actor.ends_at>now())
 and actor.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS')
 and ('*'=any(recipient.domains) or 'esf.producao'=any(recipient.domains)) and 'visualizar'=any(recipient.operations)
 and ('*'=any(actor.domains) or 'esf.producao'=any(actor.domains))
 and (recipient.operations<@actor.operations or actor.role='ADMIN_SISTEMA'));
$$;
revoke all on function app.esf_can_allocate(uuid,uuid,uuid) from public,anon,authenticated;

create function public.read_esf_team_access(p_org uuid,p_unit uuid,p_team uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not app.admin_scope(p_org,p_unit,'visualizar') or not exists(select 1 from public.esf_teams where organization_id=p_org and unit_id=p_unit and id=p_team and deleted_at is null)
 then raise exception 'Sem acesso à equipe.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('userId',p.id,'name',p.name,'assigned',tm.id is not null and tm.deleted_at is null,'version',coalesce(tm.version,0),'canAssign',app.esf_can_allocate(p_org,p_unit,p.id)) order by p.name,p.id)
 from public.profiles p left join public.esf_team_members tm on tm.user_id=p.id and tm.team_id=p_team
 where app.esf_can_allocate(p_org,p_unit,p.id) or tm.id is not null),'[]'::jsonb);
end $$;

create function public.assign_esf_team_member(p_operation_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=(p_input->>'organizationId')::uuid; unit uuid:=(p_input->>'unitId')::uuid; team uuid:=(p_input->>'teamId')::uuid;
 target uuid:=(p_input->>'userId')::uuid; enabled boolean:=(p_input->>'enabled')::boolean; expected integer:=(p_input->>'expectedVersion')::integer;
 prior public.idempotency_keys; fingerprint text; answer jsonb; member public.esf_team_members;
begin
 if unit is null or not app.admin_scope(org,unit,'criar') or (enabled and not app.esf_can_allocate(org,unit,target))
 or not exists(select 1 from public.esf_teams where id=team and organization_id=org and unit_id=unit and status='ACTIVE' and deleted_at is null)
 then raise exception 'Não é permitido conceder este acesso à equipe.' using errcode='42501'; end if;
 if p_operation_id is null or target is null or enabled is null or expected is null or expected<0 or octet_length(p_input::text)>2000 then raise exception 'Vínculo inválido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_array('assign_esf_team_member',p_input)::text,'sha256'),'hex');
 select * into prior from public.idempotency_keys where operation_id=p_operation_id;
 if found then
 if prior.user_id<>auth.uid() or prior.request_hash<>fingerprint then raise exception 'Operação reutilizada com outros dados.' using errcode='22023'; end if;
 return prior.response; end if;
 perform pg_advisory_xact_lock(hashtextextended(team::text||':'||target::text,0));
 select * into member from public.esf_team_members where team_id=team and user_id=target for update;
 if coalesce(member.version,0)<>expected then raise exception 'Vínculo alterado. Atualize a lista.' using errcode='40001'; end if;
 if member.id is null then
 if not enabled then raise exception 'Vínculo inexistente.' using errcode='P0002'; end if;
 insert into public.esf_team_members(organization_id,unit_id,team_id,user_id,created_by) values(org,unit,team,target,auth.uid()) returning * into member;
 else update public.esf_team_members set deleted_at=case when enabled then null else now() end where id=member.id returning * into member;
 end if;
 answer:=jsonb_build_object('id',member.id,'version',member.version);
 insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),org,fingerprint,answer);
 return answer;
end $$;
revoke all on function public.read_esf_team_access(uuid,uuid,uuid),public.assign_esf_team_member(uuid,jsonb) from public,anon;
grant execute on function public.read_esf_team_access(uuid,uuid,uuid),public.assign_esf_team_member(uuid,jsonb) to authenticated;
