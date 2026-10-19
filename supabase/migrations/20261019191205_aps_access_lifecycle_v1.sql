-- Additive, synthetic-staging-only access lifecycle. No existing function is replaced.
-- Records change only through an explicitly authorized, justified end command.
create table app.aps_access_commands_v1 (
 operation_id uuid primary key,
 organization_id uuid not null references public.organizations(id)
   check(organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),
 membership_id uuid not null references public.memberships(id),
 actor_id uuid not null references auth.users(id),
 request_hash text not null,
 before_fingerprint text not null,
 after_fingerprint text not null,
 reason text not null check(length(btrim(reason)) between 10 and 500),
 device_id uuid not null,
 local_timestamp timestamptz not null,
 response jsonb not null,
 created_at timestamptz not null default now()
);
create index aps_access_commands_v1_actor on app.aps_access_commands_v1(actor_id,created_at);
create index aps_access_commands_v1_org on app.aps_access_commands_v1(organization_id,created_at);
create index aps_access_commands_v1_membership on app.aps_access_commands_v1(membership_id,created_at);
alter table app.aps_access_commands_v1 enable row level security;
revoke all on app.aps_access_commands_v1 from public,anon,authenticated;
create policy rpc_only on app.aps_access_commands_v1 for all to authenticated using(false) with check(false);
create trigger immutable before update or delete on app.aps_access_commands_v1 for each row execute function app.reject_audit_mutation();

create function app.aps_end_membership_v1(p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 org uuid:=(p_request->>'organizationId')::uuid;
 target_id uuid:=(p_request->>'membershipId')::uuid;
 action_key text:=p_request->>'action';
 actor uuid:=auth.uid();
 command_id uuid;
 target public.memberships;
 original public.memberships;
 prior app.aps_access_commands_v1;
 fingerprint text;
 request_hash text;
 after_fingerprint text;
 result jsonb;
 reason_text text;
 device uuid;
 local_time timestamptz;
begin
 if actor is null or org is distinct from '362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid then
   raise exception 'Encerramento disponível somente na homologação sintética autorizada.' using errcode='42501';
 end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>4000
 or target_id is null or action_key is null or action_key not in ('preview','end')
 or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('action','organizationId','membershipId','operationId','expectedFingerprint','expectedEndsAt','reason','deviceId','localTimestamp')) then
   raise exception 'Comando de acesso inválido.' using errcode='22023';
 end if;
 if action_key='end' then
   command_id:=(p_request->>'operationId')::uuid;
   device:=(p_request->>'deviceId')::uuid;
   local_time:=(p_request->>'localTimestamp')::timestamptz;
   reason_text:=btrim(p_request->>'reason');
   if command_id is null or device is null or local_time is null
   or reason_text is null or length(reason_text) not between 10 and 500
   or p_request->>'expectedFingerprint' is null or p_request->>'expectedFingerprint' !~ '^[a-f0-9]{64}$'
   or not p_request ? 'expectedEndsAt' or jsonb_typeof(p_request->'expectedEndsAt') not in ('null','string') then
     raise exception 'Informe a prévia do vínculo, a identificação da operação e uma justificativa.' using errcode='22023';
   end if;
 end if;

 -- Serialize these commands per organization, including the last-administrator check.
 perform pg_advisory_xact_lock(hashtextextended('aps-access-end:'||org::text,0));
 select * into target from public.memberships where id=target_id and organization_id=org for update;
 if not found then raise exception 'Vínculo não disponível.' using errcode='42501'; end if;
 if target.user_id=actor then raise exception 'Não é permitido encerrar seu próprio vínculo.' using errcode='42501'; end if;
 perform p.id from public.profiles p where p.id=actor for share;
 perform m.id from public.memberships m where m.user_id=actor and m.organization_id=org order by m.id for share;
 -- Revalidate authority before looking up any receipt. The actor must be able to
 -- delegate the exact existing role/domain/operation scope, not merely view users.
 if not app.admin_scope(org,target.unit_id,'criar') or not exists(
   select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
   where m.user_id=actor and m.organization_id=org and (m.unit_id is null or (target.unit_id is not null and m.unit_id=target.unit_id))
   and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
   and m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS')
   and ('*'=any(m.domains) or 'administracao'=any(m.domains)) and ('criar'=any(m.operations) or m.role='ADMIN_SISTEMA')
   and (target.role<>'ADMIN_SISTEMA' or m.role='ADMIN_SISTEMA')
   and (m.role<>'GERENTE_UBS' or (target.unit_id is not null and target.role in ('RESPONSAVEL_DOMINIO','EXECUTOR','AUDITOR','LEITOR')))
   and ('*'=any(m.domains) or target.domains<@m.domains)
   and (m.role='ADMIN_SISTEMA' or target.operations<@m.operations)
 ) then raise exception 'Você não pode encerrar este perfil, área ou escopo.' using errcode='42501'; end if;

 if action_key='end' then
   perform pg_advisory_xact_lock(hashtextextended('aps-access-operation:'||command_id::text,0));
   request_hash:=encode(extensions.digest(p_request::text,'sha256'),'hex');
   select * into prior from app.aps_access_commands_v1 where operation_id=command_id;
   if found then
     if prior.actor_id<>actor or prior.request_hash<>request_hash or prior.membership_id<>target_id then
       raise exception 'Esta operação já foi usada com outros dados.' using errcode='22023';
     end if;
     return prior.response;
   end if;
 end if;

 if target.starts_at>now() or (target.ends_at is not null and target.ends_at<=now()) then
   raise exception 'O vínculo não está mais ativo. Consulte novamente os acessos.' using errcode='40001';
 end if;
 if target.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS')
 and ('*'=any(target.domains) or 'administracao'=any(target.domains))
 and ('criar'=any(target.operations) or target.role='ADMIN_SISTEMA')
 and not exists(
   select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
   where m.organization_id=org and m.id<>target.id and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
   and (m.unit_id is null or (target.unit_id is not null and m.unit_id=target.unit_id))
   and m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS')
   and (target.role<>'ADMIN_SISTEMA' or m.role='ADMIN_SISTEMA')
   and ('*'=any(m.domains) or 'administracao'=any(m.domains)) and ('criar'=any(m.operations) or m.role='ADMIN_SISTEMA')
 ) then raise exception 'Não é permitido encerrar o último administrador deste escopo.' using errcode='42501'; end if;

 fingerprint:=encode(extensions.digest(to_jsonb(target)::text,'sha256'),'hex');
 if action_key='preview' then
   return jsonb_build_object('membershipId',target.id,'userId',target.user_id,'unitId',target.unit_id,
     'unitName',(select u.name from public.units u where u.id=target.unit_id and u.organization_id=org),
     'role',target.role,'domains',target.domains,'operations',target.operations,
     'startsAt',target.starts_at,'expectedEndsAt',target.ends_at,'expectedFingerprint',fingerprint);
 end if;
 if p_request->>'expectedFingerprint'<>fingerprint or p_request->'expectedEndsAt' is distinct from coalesce(to_jsonb(target.ends_at),'null'::jsonb) then
   raise exception 'O vínculo foi alterado. Consulte novamente a prévia antes de encerrar.' using errcode='40001';
 end if;

 original:=target;
 update public.memberships set ends_at=now() where id=target.id returning * into target;
 after_fingerprint:=encode(extensions.digest(to_jsonb(target)::text,'sha256'),'hex');
 result:=jsonb_build_object('operationId',command_id,'membershipId',target.id,'status','ENDED','endedAt',target.ends_at);
 insert into app.aps_access_commands_v1(operation_id,organization_id,membership_id,actor_id,request_hash,before_fingerprint,after_fingerprint,reason,device_id,local_timestamp,response)
 values(command_id,org,target.id,actor,request_hash,fingerprint,after_fingerprint,reason_text,device,local_time,result);
 insert into public.audit_log(organization_id,unit_id,actor_id,device_id,session_id,entity_type,entity_id,action,changed_fields,before_value,after_value)
 values(org,target.unit_id,actor,device,auth.jwt()->>'session_id','memberships',target.id,'MEMBERSHIP_ENDED',array['ends_at'],
 jsonb_build_object('endsAt',original.ends_at,'fingerprint',fingerprint),
 jsonb_build_object('endsAt',target.ends_at,'fingerprint',after_fingerprint,'reason',reason_text,'operationId',command_id,'localTimestamp',local_time));
 return result;
end $$;
revoke all on function app.aps_end_membership_v1(jsonb) from public,anon;
grant execute on function app.aps_end_membership_v1(jsonb) to authenticated;
create function public.staging_end_membership_v1(p_request jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select app.aps_end_membership_v1(p_request); $$;
revoke all on function public.staging_end_membership_v1(jsonb) from public,anon;
grant execute on function public.staging_end_membership_v1(jsonb) to authenticated;

-- Administrative metadata only. No clinical records, patient fields or implicit grants.
create function app.aps_read_access_v1(p_request jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare org uuid; target uuid; teams jsonb; epidemiology jsonb; account_active boolean;
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória.' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>1000
 or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('organizationId','userId'))
 or not (p_request ?& array['organizationId','userId']) then raise exception 'Consulta inválida.' using errcode='22023'; end if;
 org:=(p_request->>'organizationId')::uuid; target:=(p_request->>'userId')::uuid;
 if org is distinct from '362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid or target is null
 or not exists(select 1 from public.organizations o where o.id=org and o.status='ACTIVE' and o.deleted_at is null)
 or not exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=target
   and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
   and app.admin_scope(org,m.unit_id,'visualizar'))
 then raise exception 'Consulta fora do recorte administrativo autorizado.' using errcode='42501'; end if;
 select p.status='ACTIVE' into account_active from public.profiles p where p.id=target;
 -- A null scope is never treated as "any unit" here: admin_scope requires an org-wide actor.
 select coalesce(jsonb_agg(jsonb_build_object('id',tm.id,'unitId',u.id,'unitName',u.name,
   'teamId',t.id,'teamName',t.name,'teamStatus',t.status) order by u.name,t.name,tm.id),'[]'::jsonb)
 into teams from public.esf_team_members tm
 join public.esf_teams t on t.organization_id=tm.organization_id and t.unit_id=tm.unit_id and t.id=tm.team_id
 join public.units u on u.organization_id=tm.organization_id and u.id=tm.unit_id
 where tm.organization_id=org and tm.user_id=target and tm.deleted_at is null and t.deleted_at is null
   and u.deleted_at is null and app.admin_scope(org,tm.unit_id,'visualizar');
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'unitId',g.unit_id,'unitName',u.name,
   'teamId',g.team_id,'teamName',t.name,'areas',g.areas,'enabled',g.enabled,'nominal',g.nominal,
   'canWrite',g.can_write,'canReview',g.can_review,'canValidate',g.can_validate,'canClose',g.can_close,
   'municipal',g.municipal) order by g.unit_id nulls first,g.team_id nulls first,g.id),'[]'::jsonb)
 into epidemiology from app.epi_grants_v1 g
 left join public.units u on u.organization_id=g.organization_id and u.id=g.unit_id
 left join public.esf_teams t on t.organization_id=g.organization_id and t.unit_id=g.unit_id and t.id=g.team_id
 where g.organization_id=org and g.user_id=target and app.admin_scope(org,g.unit_id,'visualizar');
 return jsonb_build_object('userId',target,'accountActive',coalesce(account_active,false),
   'canManageGrants',false,'teams',teams,'epidemiology',epidemiology);
end $$;
revoke all on function app.aps_read_access_v1(jsonb) from public,anon;
grant execute on function app.aps_read_access_v1(jsonb) to authenticated;
create function public.staging_read_aps_access_v1(p_request jsonb) returns jsonb
language sql stable security invoker set search_path='' as $$ select app.aps_read_access_v1(p_request); $$;
revoke all on function public.staging_read_aps_access_v1(jsonb) from public,anon;
grant execute on function public.staging_read_aps_access_v1(jsonb) to authenticated;
