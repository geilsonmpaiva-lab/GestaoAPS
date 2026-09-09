-- Wave 6: hard gates, consultation audit and explicit sensitive workflows.
create table public.sensitive_access_log(
  id bigint generated always as identity primary key,organization_id uuid not null references public.organizations(id),unit_id uuid not null,
  actor_id uuid not null references auth.users(id),device_id uuid,entity_type text not null check(entity_type in ('safety_events','ombudsman_cases')),
  record_count integer not null check(record_count>=0),purpose text not null,accessed_at timestamptz not null default now(),
  foreign key(organization_id,unit_id) references public.units(organization_id,id)
);
alter table public.sensitive_access_log enable row level security;
create policy sensitive_access_log_select on public.sensitive_access_log for select to authenticated using(app.can_access(organization_id,unit_id,'auditoria','visualizar'));
grant select on public.sensitive_access_log to authenticated;
create trigger sensitive_access_log_append_only before update or delete on public.sensitive_access_log for each row execute function app.reject_audit_mutation();

create or replace function app.feature_enabled(p_organization_id uuid,p_unit_id uuid,p_key text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select enabled from public.feature_flags where organization_id=p_organization_id and key=p_key and (unit_id=p_unit_id or unit_id is null) order by (unit_id is not null) desc limit 1),false)
$$;
revoke all on function app.feature_enabled(uuid,uuid,text) from public,anon;
grant execute on function app.feature_enabled(uuid,uuid,text) to authenticated;

drop policy safety_events_select on public.safety_events; drop policy safety_events_insert on public.safety_events; drop policy safety_events_update on public.safety_events;
create policy safety_events_select on public.safety_events for select to authenticated using(app.feature_enabled(organization_id,unit_id,'safety_events') and app.can_access(organization_id,unit_id,'seguranca','visualizar'));
create policy safety_events_insert on public.safety_events for insert to authenticated with check(app.feature_enabled(organization_id,unit_id,'safety_events') and app.can_access(organization_id,unit_id,'seguranca','criar'));
create policy safety_events_update on public.safety_events for update to authenticated using(app.feature_enabled(organization_id,unit_id,'safety_events') and app.can_access(organization_id,unit_id,'seguranca','editar')) with check(app.feature_enabled(organization_id,unit_id,'safety_events') and app.can_access(organization_id,unit_id,'seguranca','editar'));
drop policy ombudsman_cases_select on public.ombudsman_cases; drop policy ombudsman_cases_insert on public.ombudsman_cases; drop policy ombudsman_cases_update on public.ombudsman_cases;
create policy ombudsman_cases_select on public.ombudsman_cases for select to authenticated using(app.feature_enabled(organization_id,unit_id,'ombudsman') and app.can_access(organization_id,unit_id,'ouvidoria','visualizar'));
create policy ombudsman_cases_insert on public.ombudsman_cases for insert to authenticated with check(app.feature_enabled(organization_id,unit_id,'ombudsman') and app.can_access(organization_id,unit_id,'ouvidoria','criar'));
create policy ombudsman_cases_update on public.ombudsman_cases for update to authenticated using(app.feature_enabled(organization_id,unit_id,'ombudsman') and app.can_access(organization_id,unit_id,'ouvidoria','editar')) with check(app.feature_enabled(organization_id,unit_id,'ombudsman') and app.can_access(organization_id,unit_id,'ouvidoria','editar'));

alter table public.safety_events add constraint safety_events_status_check check(status in ('REPORTED','IN_ANALYSIS','ACTION_PLAN','CLOSED','CANCELLED'));
alter table public.ombudsman_cases add constraint ombudsman_cases_status_check check(status in ('OPEN','IN_ANALYSIS','RESPONSE_PENDING','CLOSED','CANCELLED'));
create unique index action_plans_active_safety_event_uidx on public.action_plans(organization_id,unit_id,origin_type,origin_id) where origin_type='SAFETY_EVENT' and deleted_at is null and status<>'CANCELADO';

create or replace function public.read_sensitive_records(p_entity_type text,p_unit_id uuid,p_limit integer,p_device_id uuid,p_purpose text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare domain_name text; authorized_organization_id uuid; result jsonb;
begin
  if p_entity_type not in ('safety_events','ombudsman_cases') or p_unit_id is null or p_limit not between 1 and 50 or length(trim(coalesce(p_purpose,'')))<3 then raise exception 'Invalid sensitive access request' using errcode='22023'; end if;
  domain_name:=case when p_entity_type='safety_events' then 'seguranca' else 'ouvidoria' end;
  select m.organization_id into authorized_organization_id from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE' where m.user_id=auth.uid() and (m.unit_id is null or m.unit_id=p_unit_id) and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) and (m.domains@>array['*']::text[] or domain_name=any(m.domains)) and (m.operations@>array['*']::text[] or 'visualizar'=any(m.operations)) limit 1;
  if authorized_organization_id is null or not app.feature_enabled(authorized_organization_id,p_unit_id,case when p_entity_type='safety_events' then 'safety_events' else 'ombudsman' end) then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_entity_type='safety_events' then select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]'::jsonb) into result from (select * from public.safety_events where organization_id=authorized_organization_id and unit_id=p_unit_id and deleted_at is null order by created_at desc limit p_limit) s;
  else select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc),'[]'::jsonb) into result from (select * from public.ombudsman_cases where organization_id=authorized_organization_id and unit_id=p_unit_id and deleted_at is null order by created_at desc limit p_limit) o; end if;
  insert into public.sensitive_access_log(organization_id,unit_id,actor_id,device_id,entity_type,record_count,purpose) values(authorized_organization_id,p_unit_id,auth.uid(),p_device_id,p_entity_type,jsonb_array_length(result),p_purpose);
  return result;
end; $$;

create or replace function public.analyze_safety_event(p_event_id uuid,p_expected_version integer,p_operation_id uuid,p_contributing_factors text,p_immediate_action text,p_create_plan boolean) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare event public.safety_events; prior jsonb; answer jsonb; plan_id uuid; next_version integer;
begin
 select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();if prior is not null then return prior||jsonb_build_object('duplicate',true);end if;
 select * into event from public.safety_events where id=p_event_id for update;if not found then raise exception 'Safety event not found' using errcode='P0002';end if;
 if not app.feature_enabled(event.organization_id,event.unit_id,'safety_events') or not app.can_access(event.organization_id,event.unit_id,'seguranca','editar') then raise exception 'Forbidden' using errcode='42501';end if;if event.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001';end if;if event.status not in ('REPORTED','IN_ANALYSIS') then raise exception 'Invalid safety event state' using errcode='22023';end if;
 if length(trim(coalesce(p_contributing_factors,'')))<3 or length(trim(coalesce(p_immediate_action,'')))<3 then raise exception 'Analysis fields are required' using errcode='22023';end if;
 if p_create_plan then insert into public.action_plans(organization_id,unit_id,origin_type,origin_id,title,responsible_id,status,created_by,updated_by) values(event.organization_id,event.unit_id,'SAFETY_EVENT',event.id,'Plano de ação do evento de segurança',coalesce(event.analysis_responsible_id,auth.uid()),'NAO_INICIADO',auth.uid(),auth.uid()) on conflict do nothing returning id into plan_id; if plan_id is null then select id into plan_id from public.action_plans where origin_type='SAFETY_EVENT' and origin_id=event.id and deleted_at is null limit 1;end if;end if;
 update public.safety_events set contributing_factors=p_contributing_factors,immediate_action=p_immediate_action,action_plan_id=plan_id,status=case when plan_id is null then 'IN_ANALYSIS' else 'ACTION_PLAN' end,updated_by=auth.uid() where id=event.id returning version into next_version;
 answer:=jsonb_build_object('id',event.id,'status',case when plan_id is null then 'IN_ANALYSIS' else 'ACTION_PLAN' end,'version',next_version,'actionPlanId',plan_id);insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)values(p_operation_id,auth.uid(),event.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer);return answer;
end; $$;

create or replace function public.respond_ombudsman_case(p_case_id uuid,p_expected_version integer,p_operation_id uuid,p_analysis text,p_response text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare case_row public.ombudsman_cases;prior jsonb;answer jsonb;next_version integer;
begin
 select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();if prior is not null then return prior||jsonb_build_object('duplicate',true);end if;select * into case_row from public.ombudsman_cases where id=p_case_id for update;if not found then raise exception 'Ombudsman case not found' using errcode='P0002';end if;
 if not app.feature_enabled(case_row.organization_id,case_row.unit_id,'ombudsman') or not app.can_access(case_row.organization_id,case_row.unit_id,'ouvidoria','encerrar') then raise exception 'Forbidden' using errcode='42501';end if;if case_row.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001';end if;if case_row.status in ('CLOSED','CANCELLED') or length(trim(coalesce(p_analysis,'')))<3 or length(trim(coalesce(p_response,'')))<3 then raise exception 'Invalid response' using errcode='22023';end if;
 update public.ombudsman_cases set analysis=p_analysis,response=p_response,status='CLOSED',updated_by=auth.uid() where id=case_row.id returning version into next_version;answer:=jsonb_build_object('id',case_row.id,'status','CLOSED','version',next_version);insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)values(p_operation_id,auth.uid(),case_row.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer);return answer;
end; $$;

revoke all on function public.read_sensitive_records(text,uuid,integer,uuid,text) from public,anon;grant execute on function public.read_sensitive_records(text,uuid,integer,uuid,text) to authenticated;
revoke all on function public.analyze_safety_event(uuid,integer,uuid,text,text,boolean) from public,anon;grant execute on function public.analyze_safety_event(uuid,integer,uuid,text,text,boolean) to authenticated;
revoke all on function public.respond_ombudsman_case(uuid,integer,uuid,text,text) from public,anon;grant execute on function public.respond_ombudsman_case(uuid,integer,uuid,text,text) to authenticated;
