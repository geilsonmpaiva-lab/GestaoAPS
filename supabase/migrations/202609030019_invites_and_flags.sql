-- Administrative workflows: membership provisioning and governed feature gates.
create or replace function public.provision_invited_membership(p_user_id uuid,p_organization_id uuid,p_unit_id uuid,p_role text,p_domains text[],p_operations text[]) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare membership_id uuid; begin
 if not app.can_access(p_organization_id,p_unit_id,'administracao','criar') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_role not in('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS','RESPONSAVEL_DOMINIO','EXECUTOR','AUDITOR','LEITOR') then raise exception 'Invalid role' using errcode='22023'; end if;
 if p_unit_id is not null and not exists(select 1 from public.units where id=p_unit_id and organization_id=p_organization_id and deleted_at is null) then raise exception 'Unit does not belong to organization' using errcode='23514'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Invited profile not found' using errcode='P0002'; end if;
 insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations,created_by)
 values(p_user_id,p_organization_id,p_unit_id,p_role,coalesce(p_domains,array['*']::text[]),coalesce(p_operations,array['visualizar']::text[]),auth.uid())
 on conflict(user_id,organization_id,unit_id,role) do update set domains=excluded.domains,operations=excluded.operations,ends_at=null returning id into membership_id;
 return membership_id; end $$;

create or replace function public.set_feature_flag(p_organization_id uuid,p_unit_id uuid,p_key text,p_enabled boolean,p_reason text) returns public.feature_flags
language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.feature_flags; normalized_key text; begin
 if not app.can_access(p_organization_id,p_unit_id,'administracao','editar') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_key not in('reunioes','qualidade','pessoas','patrimonio','estoque','seguranca','ouvidoria','safety_events','ombudsman','module.reunioes','module.qualidade','module.pessoas','module.patrimonio','module.estoque','module.seguranca','module.ouvidoria') then raise exception 'Unknown feature flag' using errcode='22023'; end if;
 normalized_key:=case when p_key in('seguranca','module.seguranca') then 'safety_events' when p_key in('ouvidoria','module.ouvidoria') then 'ombudsman' when p_key like 'module.%' then substr(p_key,8) else p_key end;
 if p_enabled and normalized_key in('safety_events','ombudsman') and length(trim(coalesce(p_reason,'')))<10 then raise exception 'Sensitive module activation requires an approval reason' using errcode='22023'; end if;
 insert into public.feature_flags(organization_id,unit_id,key,enabled,reason,updated_by) values(p_organization_id,p_unit_id,normalized_key,p_enabled,nullif(trim(p_reason),''),auth.uid())
 on conflict(organization_id,unit_id,key) do update set enabled=excluded.enabled,reason=excluded.reason,updated_at=now(),updated_by=auth.uid() returning * into result;
 return result; end $$;
revoke all on function public.provision_invited_membership(uuid,uuid,uuid,text,text[],text[]) from public,anon;
revoke all on function public.set_feature_flag(uuid,uuid,text,boolean,text) from public,anon;
grant execute on function public.provision_invited_membership(uuid,uuid,uuid,text,text[],text[]) to authenticated;
grant execute on function public.set_feature_flag(uuid,uuid,text,boolean,text) to authenticated;
