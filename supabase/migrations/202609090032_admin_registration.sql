-- Administrative catalog and unit creation. No direct write grants are added.
create trigger units_registration_audit after insert or update on public.units for each row execute function app.audit_change('restricted');
create trigger units_registration_outbox after insert or update on public.units for each row execute function app.emit_domain_change('administracao');
create trigger memberships_registration_audit after insert or update on public.memberships for each row execute function app.audit_change('');
create trigger memberships_registration_outbox after insert or update on public.memberships for each row execute function app.emit_domain_change('administracao');
create or replace function app.admin_scope(p_org uuid,p_unit uuid,p_operation text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id
 where m.user_id=auth.uid() and p.status='ACTIVE' and m.organization_id=p_org
 and (m.unit_id is null or (p_unit is not null and m.unit_id=p_unit))
 and m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS')
 and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
 and ('*'=any(m.domains) or 'administracao'=any(m.domains))
 and (p_operation=any(m.operations) or m.role='ADMIN_SISTEMA'));
$$;
revoke all on function app.admin_scope(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.authorize_admin_invite(p_organization_id uuid,p_unit_id uuid,p_role text,p_domains text[],p_operations text[])
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_role is null or p_role not in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS','RESPONSAVEL_DOMINIO','EXECUTOR','AUDITOR','LEITOR')
 or coalesce(cardinality(p_domains),0) not between 1 and 30 or coalesce(cardinality(p_operations),0) not between 1 and 10
 or array_position(p_domains,null) is not null or array_position(p_operations,null) is not null
 or exists(select 1 from unnest(p_domains) d where length(trim(d)) not between 1 and 80)
 or not p_operations <@ array['visualizar','criar','editar','excluir_logicamente','aprovar','publicar','executar','encerrar','reabrir','exportar']::text[] then
   raise exception 'Perfil ou permissões inválidos.' using errcode='22023';
 end if;
 if not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
 where m.user_id=auth.uid() and m.organization_id=p_organization_id
 and (m.unit_id is null or (p_unit_id is not null and m.unit_id=p_unit_id))
 and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
 and m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS')
 and ('*'=any(m.domains) or 'administracao'=any(m.domains))
 and ('criar'=any(m.operations) or m.role='ADMIN_SISTEMA')
 and (p_role<>'ADMIN_SISTEMA' or m.role='ADMIN_SISTEMA')
 and (m.role<>'GERENTE_UBS' or (p_unit_id is not null and p_role in ('RESPONSAVEL_DOMINIO','EXECUTOR','AUDITOR','LEITOR')))
 and ('*'=any(m.domains) or p_domains<@m.domains)
 and (m.role='ADMIN_SISTEMA' or p_operations<@m.operations)) then
   raise exception 'Não é permitido conceder este acesso.' using errcode='42501';
 end if;
 if not exists(select 1 from public.organizations where id=p_organization_id and deleted_at is null and status='ACTIVE') then
   raise exception 'Organização indisponível.' using errcode='P0002';
 end if;
 if p_unit_id is not null and not exists(select 1 from public.units where id=p_unit_id and organization_id=p_organization_id and deleted_at is null and status='ACTIVE') then
   raise exception 'Unidade indisponível neste escopo.' using errcode='42501';
 end if;
 return true;
end; $$;

create or replace function public.provision_invited_membership(p_user_id uuid,p_organization_id uuid,p_unit_id uuid,p_role text,p_domains text[],p_operations text[])
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare membership_id uuid;
begin
 perform public.authorize_admin_invite(p_organization_id,p_unit_id,p_role,p_domains,p_operations);
 if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Perfil convidado não encontrado.' using errcode='P0002'; end if;
 insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations,created_by)
 values(p_user_id,p_organization_id,p_unit_id,p_role,p_domains,p_operations,auth.uid())
 on conflict(user_id,organization_id,unit_id,role) do update set domains=excluded.domains,operations=excluded.operations,ends_at=null returning id into membership_id;
 return membership_id;
end; $$;

create or replace function public.read_admin_catalog(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.organization_id=p_organization_id and app.admin_scope(m.organization_id,m.unit_id,'visualizar')) then
   raise exception 'Sem acesso aos cadastros administrativos.' using errcode='42501';
 end if;
 select jsonb_build_object(
   'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'cnes',u.cnes,'status',u.status) order by u.name,u.id)
     from public.units u where u.organization_id=p_organization_id and u.deleted_at is null and app.admin_scope(u.organization_id,u.id,'visualizar')),'[]'::jsonb),
   'users',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',p.name,'email',p.email,'status',p.status,'role',m.role,'unitId',m.unit_id) order by p.name,m.id)
     from public.memberships m join public.profiles p on p.id=m.user_id
     where m.organization_id=p_organization_id and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
       and app.admin_scope(m.organization_id,m.unit_id,'visualizar')),'[]'::jsonb),
   'grants',coalesce((select jsonb_agg(jsonb_build_object('unitId',m.unit_id,'role',m.role,'domains',m.domains,'operations',m.operations))
     from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
     where m.user_id=auth.uid() and m.organization_id=p_organization_id and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
       and m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS')),'[]'::jsonb),
   'canCreateUnits',exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
     where m.user_id=auth.uid() and m.organization_id=p_organization_id and m.unit_id is null
     and m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO') and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
     and ('*'=any(m.domains) or 'administracao'=any(m.domains)) and ('criar'=any(m.operations) or m.role='ADMIN_SISTEMA'))
 ) into result;
 return result;
end; $$;

create or replace function public.register_admin_unit(p_operation_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=(p_input->>'organizationId')::uuid; prior public.idempotency_keys; fingerprint text; answer jsonb; new_unit public.units;
begin
 if p_operation_id is null or org is null or not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
   where m.user_id=auth.uid() and m.organization_id=org and m.unit_id is null and m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO')
   and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
   and ('*'=any(m.domains) or 'administracao'=any(m.domains)) and ('criar'=any(m.operations) or m.role='ADMIN_SISTEMA')) then
   raise exception 'Somente a gestão autorizada da organização pode cadastrar unidades.' using errcode='42501';
 end if;
 if not exists(select 1 from public.organizations where id=org and status='ACTIVE' and deleted_at is null) then raise exception 'Organização indisponível.' using errcode='42501'; end if;
 if length(trim(coalesce(p_input->>'name',''))) not between 2 and 160 or coalesce(p_input->>'cnes','') !~ '^[0-9]{7}$'
   or jsonb_typeof(p_input->'address') is distinct from 'object' or octet_length(p_input::text)>4000 then raise exception 'Cadastro de unidade inválido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_array('register_admin_unit',p_input)::text,'sha256'),'hex');
 select * into prior from public.idempotency_keys where operation_id=p_operation_id;
 if found then
   if prior.user_id<>auth.uid() or prior.request_hash<>fingerprint then raise exception 'Operação já utilizada com outros dados.' using errcode='22023'; end if;
   return prior.response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||':'||(p_input->>'cnes'),0));
 if exists(select 1 from public.units where organization_id=org and cnes=p_input->>'cnes' and deleted_at is null) then raise exception 'Já existe uma unidade com este CNES nesta organização.' using errcode='23505'; end if;
 insert into public.units(organization_id,name,cnes,address,created_by,updated_by)
 values(org,trim(p_input->>'name'),p_input->>'cnes',p_input->'address',auth.uid(),auth.uid()) returning * into new_unit;
 answer:=jsonb_build_object('id',new_unit.id,'name',new_unit.name,'version',new_unit.version);
 insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),org,fingerprint,answer);
 return answer;
end; $$;

revoke all on function public.authorize_admin_invite(uuid,uuid,text,text[],text[]) from public,anon;
revoke all on function public.provision_invited_membership(uuid,uuid,uuid,text,text[],text[]) from public,anon;
revoke all on function public.read_admin_catalog(uuid) from public,anon;
revoke all on function public.register_admin_unit(uuid,jsonb) from public,anon;
grant execute on function public.authorize_admin_invite(uuid,uuid,text,text[],text[]) to authenticated;
grant execute on function public.provision_invited_membership(uuid,uuid,uuid,text,text[],text[]) to authenticated;
grant execute on function public.read_admin_catalog(uuid) to authenticated;
grant execute on function public.register_admin_unit(uuid,jsonb) to authenticated;
