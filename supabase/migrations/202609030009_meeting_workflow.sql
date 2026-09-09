-- Complete the meeting workflow from agenda and attendance to tracked action.
create unique index action_plans_active_referral_uidx
on public.action_plans(organization_id,unit_id,origin_type,origin_id)
where origin_type='MEETING_REFERRAL' and deleted_at is null and status<>'CANCELADO';

create or replace function app.assert_user_membership_scope()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare referenced_user uuid;
begin
  referenced_user:=nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;
  if referenced_user is null then return new; end if;
  if not exists(
    select 1 from public.memberships m
    join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
    where m.user_id=referenced_user and m.organization_id=new.organization_id
      and (m.unit_id is null or m.unit_id=new.unit_id)
      and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
  ) then raise exception 'Referenced user has no active membership in this scope' using errcode='23514'; end if;
  return new;
end;
$$;

create trigger meeting_participants_user_scope before insert or update of organization_id,unit_id,user_id on public.meeting_participants for each row execute function app.assert_user_membership_scope('user_id');
create trigger referrals_responsible_scope before insert or update of organization_id,unit_id,responsible_id on public.referrals for each row execute function app.assert_user_membership_scope('responsible_id');
create trigger meeting_agenda_items_audit after insert or update or delete on public.meeting_agenda_items for each row execute function app.audit_change('');
create trigger meeting_participants_audit after insert or update or delete on public.meeting_participants for each row execute function app.audit_change('');
create trigger referrals_audit after insert or update or delete on public.referrals for each row execute function app.audit_change('');

create or replace function public.start_meeting(p_meeting_id uuid,p_expected_version integer,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.meetings; prior jsonb; answer jsonb; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if not found then raise exception 'Meeting not found' using errcode='P0002'; end if;
  if not app.can_access(m.organization_id,m.unit_id,'reunioes','executar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if m.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if m.status<>'SCHEDULED' then raise exception 'Meeting cannot be started from current state' using errcode='22023'; end if;
  update public.meetings set status='IN_PROGRESS',updated_by=auth.uid() where id=m.id returning version into next_version;
  answer:=jsonb_build_object('id',m.id,'status','IN_PROGRESS','version',next_version,'startedAt',now());
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),m.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

create or replace function public.convert_referral_to_action(p_referral_id uuid,p_expected_version integer,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.referrals; prior jsonb; answer jsonb; plan_id uuid; action_id uuid; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  select * into r from public.referrals where id=p_referral_id for update;
  if not found then raise exception 'Referral not found' using errcode='P0002'; end if;
  if not app.can_access(r.organization_id,r.unit_id,'reunioes','editar') or not app.can_access(r.organization_id,r.unit_id,'melhoria','editar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if r.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if r.status in ('COMPLETED','CANCELLED') then raise exception 'Referral cannot be converted from current state' using errcode='22023'; end if;
  select id into plan_id from public.action_plans where organization_id=r.organization_id and unit_id=r.unit_id and origin_type='MEETING_REFERRAL' and origin_id=r.id and deleted_at is null limit 1;
  if plan_id is null then
    insert into public.action_plans(organization_id,unit_id,origin_type,origin_id,title,responsible_id,due_at,status,created_by,updated_by)
    values(r.organization_id,r.unit_id,'MEETING_REFERRAL',r.id,'Encaminhamento: '||left(r.description,180),coalesce(r.responsible_id,auth.uid()),r.due_at,'EM_ANDAMENTO',auth.uid(),auth.uid()) returning id into plan_id;
  end if;
  select id into action_id from public.actions where action_plan_id=plan_id and deleted_at is null order by created_at limit 1;
  if action_id is null then
    insert into public.actions(organization_id,unit_id,action_plan_id,what,why,where_text,when_at,who_id,how,status,created_by,updated_by)
    values(r.organization_id,r.unit_id,plan_id,r.description,'Decisão registrada em reunião','UBS',r.due_at,coalesce(r.responsible_id,auth.uid()),'Executar conforme deliberação da ata','NAO_INICIADO',auth.uid(),auth.uid()) returning id into action_id;
  end if;
  update public.referrals set status='IN_PROGRESS',action_plan_id=plan_id,updated_by=auth.uid() where id=r.id returning version into next_version;
  answer:=jsonb_build_object('id',r.id,'status','IN_PROGRESS','version',next_version,'actionPlanId',plan_id,'actionId',action_id);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),r.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

revoke all on function public.start_meeting(uuid,integer,uuid) from public,anon;
revoke all on function public.convert_referral_to_action(uuid,integer,uuid) from public,anon;
grant execute on function public.start_meeting(uuid,integer,uuid) to authenticated;
grant execute on function public.convert_referral_to_action(uuid,integer,uuid) to authenticated;
