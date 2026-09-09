-- Governed automatic treatment of indicator deviations and 5W2H effectiveness.
create unique index nonconformities_active_origin_uidx
on public.nonconformities(organization_id,unit_id,origin_type,origin_id)
where deleted_at is null and status<>'CANCELLED';

create table public.indicator_deviation_policies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), unit_id uuid,
  indicator_id uuid not null references public.indicators(id), auto_open_nonconformity boolean not null default false,
  classification text not null default 'MAJOR' check(classification in ('MINOR','MAJOR','CRITICAL')),
  default_responsible_id uuid references public.profiles(id), due_days integer not null default 15 check(due_days between 1 and 365),
  plan_title text not null default 'Tratamento de desvio do indicador', version integer not null default 1,
  created_at timestamptz not null default now(),created_by uuid references auth.users(id),updated_at timestamptz not null default now(),updated_by uuid references auth.users(id),
  foreign key(organization_id,unit_id) references public.units(organization_id,id),
  unique nulls not distinct(organization_id,unit_id,indicator_id)
);
alter table public.indicator_deviation_policies enable row level security;
create policy indicator_deviation_policies_select on public.indicator_deviation_policies for select to authenticated using(app.can_access(organization_id,unit_id,'indicadores','visualizar'));
create policy indicator_deviation_policies_insert on public.indicator_deviation_policies for insert to authenticated with check(app.can_access(organization_id,unit_id,'indicadores','editar'));
create policy indicator_deviation_policies_update on public.indicator_deviation_policies for update to authenticated using(app.can_access(organization_id,unit_id,'indicadores','editar')) with check(app.can_access(organization_id,unit_id,'indicadores','editar'));
grant select,insert,update on public.indicator_deviation_policies to authenticated;
create trigger indicator_deviation_policies_touch before update on public.indicator_deviation_policies for each row execute function app.touch_version();
create trigger indicator_deviation_policies_scope before insert or update of organization_id,unit_id,indicator_id on public.indicator_deviation_policies for each row execute function app.assert_reference_scope('indicators','indicator_id');
create trigger indicator_deviation_policies_audit after insert or update or delete on public.indicator_deviation_policies for each row execute function app.audit_change('');
create trigger indicator_deviation_policies_outbox after insert or update or delete on public.indicator_deviation_policies for each row execute function app.emit_domain_change('indicadores');

create or replace function app.ensure_measurement_deviation_plan(p_measurement_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.measurements; i public.indicators; policy public.indicator_deviation_policies; nc_id uuid; plan_id uuid; responsible uuid; nc_code text;
begin
  select * into m from public.measurements where id=p_measurement_id;
  if not found or m.status<>'FORA_META' then return null; end if;
  select * into policy from public.indicator_deviation_policies p where p.indicator_id=m.indicator_id and (p.unit_id=m.unit_id or p.unit_id is null) order by (p.unit_id is not null) desc limit 1;
  if not found or not policy.auto_open_nonconformity then return null; end if;
  select * into i from public.indicators where id=m.indicator_id;
  responsible := coalesce(policy.default_responsible_id,i.responsible_id,auth.uid());
  nc_code := 'NC-'||to_char(now(),'YYYY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.nonconformities(organization_id,unit_id,code,origin_type,origin_id,classification,description,responsible_id,due_at,created_by,updated_by)
  values(m.organization_id,m.unit_id,nc_code,'MEASUREMENT',m.id,policy.classification,'Desvio automático do indicador '||i.name||' na competência '||to_char(m.competency,'MM/YYYY'),responsible,now()+make_interval(days=>policy.due_days),auth.uid(),auth.uid())
  on conflict do nothing returning id into nc_id;
  if nc_id is null then select id into nc_id from public.nonconformities where organization_id=m.organization_id and unit_id=m.unit_id and origin_type='MEASUREMENT' and origin_id=m.id and deleted_at is null limit 1; end if;
  select id into plan_id from public.action_plans where organization_id=m.organization_id and unit_id=m.unit_id and origin_type='NONCONFORMITY' and origin_id=nc_id and deleted_at is null limit 1;
  if plan_id is null then
    insert into public.action_plans(organization_id,unit_id,origin_type,origin_id,title,responsible_id,due_at,created_by,updated_by)
    values(m.organization_id,m.unit_id,'NONCONFORMITY',nc_id,policy.plan_title||' — '||i.name,responsible,now()+make_interval(days=>policy.due_days),auth.uid(),auth.uid()) returning id into plan_id;
  end if;
  if responsible is not null then
    insert into public.notifications(organization_id,unit_id,user_id,kind,severity,source_type,source_id,title,due_at,fingerprint)
    values(m.organization_id,m.unit_id,responsible,'INDICATOR_DEVIATION',case when policy.classification='CRITICAL' then 'CRITICAL' else 'ATTENTION' end,'measurements',m.id,'Indicador fora da meta: '||i.name,now()+make_interval(days=>policy.due_days),'measurement-deviation:'||m.id)
    on conflict(user_id,fingerprint) do update set resolved_at=null,due_at=excluded.due_at;
  end if;
  return jsonb_build_object('measurementId',m.id,'nonconformityId',nc_id,'actionPlanId',plan_id,'automatic',true);
end;
$$;

create or replace function app.auto_open_measurement_deviation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status='FORA_META' and (tg_op='INSERT' or old.status is distinct from new.status) then perform app.ensure_measurement_deviation_plan(new.id); end if;
  return new;
end;
$$;
create trigger measurements_auto_deviation after insert or update of status on public.measurements for each row execute function app.auto_open_measurement_deviation();

create or replace function public.complete_action(p_action_id uuid,p_expected_version integer,p_operation_id uuid,p_evidence_attachment_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.actions; plan public.action_plans; prior jsonb; answer jsonb; next_version integer; remaining integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  select * into a from public.actions where id=p_action_id for update;
  if not found then raise exception 'Action not found' using errcode='P0002'; end if;
  if not app.can_access(a.organization_id,a.unit_id,'melhoria','encerrar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if a.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if a.status in ('CONCLUIDO','CANCELADO') then raise exception 'Action cannot be completed from current state' using errcode='22023'; end if;
  update public.actions set status='CONCLUIDO',percentage=100,completed_at=now(),updated_by=auth.uid() where id=a.id returning version into next_version;
  if p_evidence_attachment_id is not null then
    insert into public.evidence_links(organization_id,unit_id,attachment_id,entity_type,entity_id,evidence_kind,created_by)
    values(a.organization_id,a.unit_id,p_evidence_attachment_id,'actions',a.id,'COMPLETION',auth.uid()) on conflict do nothing;
  end if;
  select count(*) into remaining from public.actions where action_plan_id=a.action_plan_id and status not in ('CONCLUIDO','CANCELADO') and deleted_at is null;
  if remaining=0 then
    update public.action_plans set status='CONCLUIDO',updated_by=auth.uid() where id=a.action_plan_id;
    select * into plan from public.action_plans where id=a.action_plan_id;
    if plan.origin_type='NONCONFORMITY' then update public.nonconformities set status='EFFECTIVENESS_PENDING',updated_by=auth.uid() where id=plan.origin_id; end if;
  end if;
  answer := jsonb_build_object('id',a.id,'status','CONCLUIDO','version',next_version,'planReadyForEffectiveness',remaining=0);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),a.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

create or replace function public.record_plan_effectiveness(p_action_plan_id uuid,p_expected_version integer,p_operation_id uuid,p_effective boolean,p_notes text,p_evidence_attachment_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare plan public.action_plans; prior jsonb; answer jsonb; check_id uuid; incomplete integer; has_actions boolean;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  select * into plan from public.action_plans where id=p_action_plan_id for update;
  if not found then raise exception 'Action plan not found' using errcode='P0002'; end if;
  if not app.can_access(plan.organization_id,plan.unit_id,'melhoria','encerrar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if plan.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  select exists(select 1 from public.actions where action_plan_id=plan.id and deleted_at is null),count(*) filter(where status not in ('CONCLUIDO','CANCELADO')) into has_actions,incomplete from public.actions where action_plan_id=plan.id and deleted_at is null;
  if not has_actions or incomplete>0 then raise exception 'All plan actions must be completed before effectiveness review' using errcode='22023'; end if;
  insert into public.effectiveness_checks(organization_id,unit_id,action_plan_id,effective,evaluated_at,evaluator_id,evidence_attachment_id,requires_new_action,notes,created_by)
  values(plan.organization_id,plan.unit_id,plan.id,p_effective,now(),auth.uid(),p_evidence_attachment_id,not p_effective,p_notes,auth.uid()) returning id into check_id;
  update public.action_plans set status=case when p_effective then 'CONCLUIDO' else 'EM_ANDAMENTO' end,updated_by=auth.uid() where id=plan.id;
  if plan.origin_type='NONCONFORMITY' then update public.nonconformities set status=case when p_effective then 'CLOSED' else 'IN_TREATMENT' end,updated_by=auth.uid() where id=plan.origin_id; end if;
  answer := jsonb_build_object('id',check_id,'actionPlanId',plan.id,'effective',p_effective,'status',case when p_effective then 'CLOSED' else 'REOPENED' end);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),plan.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

revoke all on function app.ensure_measurement_deviation_plan(uuid) from public,anon,authenticated;
revoke all on function public.complete_action(uuid,integer,uuid,uuid) from public,anon;
revoke all on function public.record_plan_effectiveness(uuid,integer,uuid,boolean,text,uuid) from public,anon;
grant execute on function public.complete_action(uuid,integer,uuid,uuid) to authenticated;
grant execute on function public.record_plan_effectiveness(uuid,integer,uuid,boolean,text,uuid) to authenticated;
