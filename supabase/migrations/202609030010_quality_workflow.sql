-- Wave 4: governed audit models and offline-capable audit executions.
alter table public.audit_model_versions add column version integer not null default 1, add column updated_at timestamptz not null default now(), add column updated_by uuid references auth.users(id), add constraint audit_model_versions_status_check check(status in ('DRAFT','PUBLISHED','OBSOLETE'));

create or replace function app.protect_published_audit_model() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' and old.status='PUBLISHED' then raise exception 'Published audit models are immutable' using errcode='55000'; end if;
  if tg_op='UPDATE' and old.status='PUBLISHED' and not (new.status='OBSOLETE' and new.organization_id=old.organization_id and new.unit_id is not distinct from old.unit_id and new.name=old.name and new.audit_type=old.audit_type and new.domain=old.domain and new.periodicity is not distinct from old.periodicity and new.checklist_schema=old.checklist_schema and new.evidence_rules=old.evidence_rules and new.scoring_rule is not distinct from old.scoring_rule and new.version_number=old.version_number) then raise exception 'Published audit models are immutable' using errcode='55000'; end if;
  return coalesce(new,old);
end; $$;
create trigger audit_model_versions_immutable before update or delete on public.audit_model_versions for each row execute function app.protect_published_audit_model();
create trigger audit_model_versions_touch before update on public.audit_model_versions for each row execute function app.touch_version();
create trigger audit_model_versions_audit after insert or update or delete on public.audit_model_versions for each row execute function app.audit_change('');
create trigger audit_model_versions_outbox after insert or update or delete on public.audit_model_versions for each row execute function app.emit_domain_change('qualidade');

create or replace function public.publish_audit_model(p_model_id uuid,p_expected_version integer,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare model public.audit_model_versions; prior jsonb; answer jsonb; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  select * into model from public.audit_model_versions where id=p_model_id for update; if not found then raise exception 'Audit model not found' using errcode='P0002'; end if;
  if not app.can_access(model.organization_id,model.unit_id,'qualidade','publicar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if model.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if; if model.status<>'DRAFT' then raise exception 'Only draft audit models can be published' using errcode='22023'; end if;
  update public.audit_model_versions set status='OBSOLETE',updated_by=auth.uid() where organization_id=model.organization_id and unit_id is not distinct from model.unit_id and name=model.name and status='PUBLISHED' and id<>model.id;
  update public.audit_model_versions set status='PUBLISHED',updated_by=auth.uid() where id=model.id returning version into next_version;
  answer:=jsonb_build_object('id',model.id,'status','PUBLISHED','version',next_version);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),model.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer); return answer;
end; $$;

create or replace function public.start_audit_execution(p_execution_id uuid,p_expected_version integer,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare execution public.audit_executions; model_status text; prior jsonb; answer jsonb; next_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  select * into execution from public.audit_executions where id=p_execution_id for update; if not found then raise exception 'Audit execution not found' using errcode='P0002'; end if;
  if not app.can_access(execution.organization_id,execution.unit_id,'qualidade','executar') then raise exception 'Forbidden' using errcode='42501'; end if; if execution.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if; if execution.status<>'SCHEDULED' then raise exception 'Audit cannot be started from current state' using errcode='22023'; end if;
  select status into model_status from public.audit_model_versions where id=execution.model_version_id; if model_status<>'PUBLISHED' then raise exception 'Audit model must be published' using errcode='22023'; end if;
  update public.audit_executions set status='IN_PROGRESS',started_at=now(),updated_by=auth.uid() where id=execution.id returning version into next_version;
  answer:=jsonb_build_object('id',execution.id,'status','IN_PROGRESS','version',next_version,'startedAt',now()); insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),execution.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer); return answer;
end; $$;

create or replace function public.complete_audit_execution(p_execution_id uuid,p_expected_version integer,p_operation_id uuid,p_result jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare execution public.audit_executions; prior jsonb; answer jsonb; next_version integer; failed integer; nc_id uuid; plan_id uuid; criterion jsonb; evidence jsonb;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid(); if prior is not null then return prior||jsonb_build_object('duplicate',true); end if;
  if jsonb_typeof(p_result)<>'object' or jsonb_typeof(p_result->'criteria')<>'array' then raise exception 'Audit result must contain a criteria array' using errcode='22023'; end if;
  if jsonb_array_length(p_result->'criteria')=0 or exists(select 1 from jsonb_array_elements(p_result->'criteria') c where jsonb_typeof(c)<>'object' or jsonb_typeof(c->'compliant')<>'boolean' or coalesce(c->>'id','')='') then raise exception 'Each criterion requires id and boolean compliant' using errcode='22023'; end if;
  select * into execution from public.audit_executions where id=p_execution_id for update; if not found then raise exception 'Audit execution not found' using errcode='P0002'; end if;
  if not app.can_access(execution.organization_id,execution.unit_id,'qualidade','encerrar') then raise exception 'Forbidden' using errcode='42501'; end if; if execution.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if; if execution.status not in ('IN_PROGRESS','REOPENED') then raise exception 'Audit cannot be completed from current state' using errcode='22023'; end if;
  select count(*) into failed from jsonb_array_elements(p_result->'criteria') criterion where coalesce((criterion->>'compliant')::boolean,false)=false;
  update public.audit_executions set status='COMPLETED',completed_at=now(),result=p_result,updated_by=auth.uid() where id=execution.id returning version into next_version;
  for criterion in select value from jsonb_array_elements(p_result->'criteria') loop
    if criterion ? 'evidenceAttachmentIds' and jsonb_typeof(criterion->'evidenceAttachmentIds')<>'array' then raise exception 'Evidence attachment ids must be an array' using errcode='22023'; end if;
    for evidence in select value from jsonb_array_elements(coalesce(criterion->'evidenceAttachmentIds','[]'::jsonb)) loop
      insert into public.evidence_links(organization_id,unit_id,attachment_id,entity_type,entity_id,evidence_kind,created_by)
      values(execution.organization_id,execution.unit_id,(evidence#>>'{}')::uuid,'audit_executions',execution.id,'AUDIT_CRITERION:'||(criterion->>'id'),auth.uid()) on conflict do nothing;
    end loop;
  end loop;
  if failed>0 then
    insert into public.nonconformities(organization_id,unit_id,code,origin_type,origin_id,classification,description,responsible_id,created_by,updated_by) values(execution.organization_id,execution.unit_id,'NC-AUD-'||upper(substr(replace(execution.id::text,'-',''),1,8)),'AUDIT_EXECUTION',execution.id,'MAJOR',failed||' critério(s) não conforme(s) na auditoria',execution.auditor_id,auth.uid(),auth.uid()) on conflict do nothing returning id into nc_id;
    if nc_id is null then select id into nc_id from public.nonconformities where organization_id=execution.organization_id and unit_id=execution.unit_id and origin_type='AUDIT_EXECUTION' and origin_id=execution.id and deleted_at is null limit 1; end if;
    select id into plan_id from public.action_plans where organization_id=execution.organization_id and unit_id=execution.unit_id and origin_type='NONCONFORMITY' and origin_id=nc_id and deleted_at is null limit 1;
    if plan_id is null then insert into public.action_plans(organization_id,unit_id,origin_type,origin_id,title,responsible_id,status,created_by,updated_by) values(execution.organization_id,execution.unit_id,'NONCONFORMITY',nc_id,'Tratar não conformidades da auditoria',execution.auditor_id,'NAO_INICIADO',auth.uid(),auth.uid()) returning id into plan_id; end if;
  end if;
  answer:=jsonb_build_object('id',execution.id,'status','COMPLETED','version',next_version,'failedCriteria',failed,'nonconformityId',nc_id,'actionPlanId',plan_id); insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),execution.organization_id,encode(digest(p_result::text,'sha256'),'hex'),answer); return answer;
end; $$;

revoke all on function public.publish_audit_model(uuid,integer,uuid) from public,anon;
revoke all on function public.start_audit_execution(uuid,integer,uuid) from public,anon;
revoke all on function public.complete_audit_execution(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function public.publish_audit_model(uuid,integer,uuid) to authenticated;
grant execute on function public.start_audit_execution(uuid,integer,uuid) to authenticated;
grant execute on function public.complete_audit_execution(uuid,integer,uuid,jsonb) to authenticated;
