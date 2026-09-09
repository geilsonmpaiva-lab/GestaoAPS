-- Identity bootstrap for invite-only users. The invitation itself is issued by a trusted server workflow.
create or replace function app.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles(id,name,email,status)
  values(
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''), split_part(coalesce(new.email,''),'@',1), 'Usuário'),
    coalesce(new.email,''),
    case when new.email_confirmed_at is null then 'INVITED' else 'ACTIVE' end
  )
  on conflict(id) do update set email=excluded.email,
    status=case when profiles.status='SUSPENDED' then profiles.status else excluded.status end,
    updated_at=now();
  return new;
end;
$$;

drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile after insert or update of email,email_confirmed_at on auth.users
for each row execute function app.handle_new_auth_user();

-- Published content stays immutable; only lifecycle closure is allowed.
create or replace function app.prevent_published_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status in ('PUBLISHED','PUBLICADO') then
    if tg_op = 'DELETE' then
      raise exception 'Published versions cannot be deleted' using errcode = '55000';
    end if;
    if (to_jsonb(new) - array['status','valid_until']) is distinct from (to_jsonb(old) - array['status','valid_until'])
       or new.status not in ('SUSPENDED','SUSPENSO','OBSOLETE','OBSOLETO') then
      raise exception 'Published version content is immutable' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

-- Make audit records append-only even to elevated application roles.
create or replace function app.reject_audit_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Audit log is append-only' using errcode = '55000';
end;
$$;
create trigger audit_log_append_only before update or delete on public.audit_log
for each row execute function app.reject_audit_mutation();

-- Reject references that cross organization or UBS boundaries. Organization-wide parents may be reused by their UBS.
create or replace function app.assert_reference_scope()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  reference_id uuid;
  parent_organization_id uuid;
  parent_unit_id uuid;
begin
  reference_id := nullif(to_jsonb(new)->>tg_argv[1],'')::uuid;
  if reference_id is null then return new; end if;
  execute format('select organization_id, unit_id from public.%I where id = $1', tg_argv[0])
    into parent_organization_id, parent_unit_id using reference_id;
  if not found then raise exception 'Referenced % not found', tg_argv[0] using errcode='23503'; end if;
  if parent_organization_id is distinct from new.organization_id
     or (parent_unit_id is not null and parent_unit_id is distinct from new.unit_id) then
    raise exception 'Cross-organization or cross-UBS reference is not allowed' using errcode='23514';
  end if;
  return new;
end;
$$;

do $$
declare r record;
begin
  for r in select * from (values
    ('knowledge_versions','knowledge_items','knowledge_item_id'),
    ('protocol_versions','protocols','protocol_id'),
    ('form_versions','protocol_versions','protocol_version_id'),
    ('executions','protocol_versions','protocol_version_id'),
    ('execution_responses','executions','execution_id'),
    ('evidence_links','attachments','attachment_id'),
    ('indicator_formula_versions','indicators','indicator_id'),
    ('targets','indicators','indicator_id'),
    ('measurements','indicators','indicator_id'),
    ('measurements','indicator_formula_versions','formula_version_id'),
    ('critical_analyses','measurements','measurement_id'),
    ('actions','action_plans','action_plan_id'),
    ('effectiveness_checks','action_plans','action_plan_id'),
    ('effectiveness_checks','attachments','evidence_attachment_id'),
    ('meeting_agenda_items','meetings','meeting_id'),
    ('meeting_participants','meetings','meeting_id'),
    ('referrals','meetings','meeting_id'),
    ('referrals','meeting_agenda_items','agenda_item_id'),
    ('audit_executions','audit_model_versions','model_version_id'),
    ('shifts','professionals','professional_id'),
    ('people_events','professionals','professional_id'),
    ('asset_movements','assets','asset_id'),
    ('maintenance_orders','assets','asset_id'),
    ('stock_batches','inventory_items','inventory_item_id'),
    ('stock_movements','inventory_items','inventory_item_id'),
    ('stock_movements','stock_batches','batch_id')
  ) as x(child_table,parent_table,fk_column)
  loop
    execute format(
      'create trigger %I before insert or update of organization_id,unit_id,%I on public.%I for each row execute function app.assert_reference_scope(%L,%L)',
      r.child_table || '_' || r.fk_column || '_scope', r.fk_column, r.child_table, r.parent_table, r.fk_column
    );
  end loop;
end $$;

-- Atomic confirmation of a validated spreadsheet preview.
create or replace function public.commit_import_job(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  job public.import_jobs;
  item jsonb;
  imported integer := 0;
  profile_id uuid;
  target_unit_id uuid;
  organization_name text;
begin
  select * into job from public.import_jobs where id=p_job_id for update;
  if not found then raise exception 'Import preview not found' using errcode='P0002'; end if;
  if not app.can_access(job.organization_id,job.unit_id,'administracao','criar') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if job.status='COMMITTED' then
    return jsonb_build_object('id',job.id,'status',job.status,'importedRows',coalesce((job.summary->>'importedRows')::integer,0),'duplicate',true);
  end if;
  if job.status<>'READY' then raise exception 'Only a READY preview can be committed' using errcode='22023'; end if;

  select name into organization_name from public.organizations where id=job.organization_id;
  for item in select * from jsonb_array_elements(coalesce(job.summary->'data','[]'::jsonb)) loop
    if job.template_type='organizacoes-ubs' then
      if trim(item->>'organizacao')<>organization_name then raise exception 'Organization name does not match the selected tenant'; end if;
      insert into public.units(organization_id,name,cnes,timezone,created_by,updated_by)
      values(job.organization_id,item->>'ubs',nullif(item->>'cnes',''),coalesce(nullif(item->>'timezone',''),'America/Sao_Paulo'),auth.uid(),auth.uid())
      on conflict do nothing;
    elsif job.template_type='usuarios' then
      select id into profile_id from public.profiles where lower(email)=lower(item->>'email');
      if profile_id is null then raise exception 'User % must be invited before importing the membership', item->>'email'; end if;
      select id into target_unit_id from public.units where organization_id=job.organization_id and lower(name)=lower(item->>'ubs') and deleted_at is null;
      if target_unit_id is null then raise exception 'UBS % was not found', item->>'ubs'; end if;
      insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations,created_by)
      values(profile_id,job.organization_id,target_unit_id,item->>'perfil',string_to_array(coalesce(nullif(item->>'dominios',''),'*'),';'),
        case
          when item->>'perfil' in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS')
            then array['visualizar','criar','editar','excluir_logicamente','aprovar','publicar','executar','encerrar','reabrir','exportar']::text[]
          when item->>'perfil'='RESPONSAVEL_DOMINIO'
            then array['visualizar','criar','editar','aprovar','publicar','executar','encerrar','reabrir','exportar']::text[]
          when item->>'perfil' in ('EXECUTOR','AUDITOR')
            then array['visualizar','criar','editar','executar','encerrar','exportar']::text[]
          else array['visualizar','exportar']::text[]
        end,auth.uid())
      on conflict do nothing;
    elsif job.template_type='conhecimento' then
      insert into public.knowledge_items(organization_id,unit_id,type,title,domain,tags,access_level,created_by,updated_by)
      values(job.organization_id,job.unit_id,item->>'tipo',item->>'titulo',item->>'dominio',string_to_array(coalesce(item->>'tags',''),';'),item->>'nivel_acesso',auth.uid(),auth.uid());
    elsif job.template_type='protocolos' then
      select id into profile_id from public.profiles where lower(email)=lower(item->>'responsavel_email');
      if profile_id is null then raise exception 'Responsible user % must be invited before importing the protocol', item->>'responsavel_email'; end if;
      insert into public.protocols(organization_id,unit_id,code,title,domain,responsible_id,created_by,updated_by)
      values(job.organization_id,job.unit_id,item->>'codigo',item->>'titulo',item->>'dominio',profile_id,auth.uid(),auth.uid());
    elsif job.template_type='indicadores' then
      insert into public.indicators(organization_id,unit_id,code,name,definition,unit,periodicity,source,domain,better_direction,created_by,updated_by)
      values(job.organization_id,job.unit_id,item->>'codigo',item->>'nome',item->>'definicao',item->>'unidade',item->>'periodicidade',item->>'fonte',item->>'dominio',item->>'melhor_direcao',auth.uid(),auth.uid());
    else
      raise exception 'Unsupported import template %', job.template_type using errcode='22023';
    end if;
    imported := imported + 1;
  end loop;

  update public.import_jobs set status='COMMITTED', committed_at=now(), summary=(summary - 'data') || jsonb_build_object('importedRows',imported)
  where id=job.id;
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(job.organization_id,job.unit_id,'ImportCommitted','administracao',job.id,1,auth.uid(),jsonb_build_object('templateType',job.template_type,'rows',imported));
  return jsonb_build_object('id',job.id,'status','COMMITTED','importedRows',imported);
end;
$$;
revoke all on function public.commit_import_job(uuid) from public, anon;
grant execute on function public.commit_import_job(uuid) to authenticated;

-- Device registration cannot revive a device revoked by an administrator.
create or replace function public.register_device(p_device_id uuid, p_label text, p_platform text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  membership_organization_id uuid;
  existing public.devices;
begin
  select organization_id into membership_organization_id
  from public.memberships m
  join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
  where m.user_id=auth.uid() and starts_at<=now() and (ends_at is null or ends_at>now())
  order by (unit_id is null) desc, starts_at
  limit 1;
  if membership_organization_id is null then raise exception 'No active membership' using errcode='42501'; end if;

  select * into existing from public.devices where id=p_device_id for update;
  if found then
    if existing.user_id<>auth.uid() or existing.organization_id<>membership_organization_id or existing.revoked_at is not null then
      raise exception 'Device is not authorized' using errcode='42501';
    end if;
    update public.devices set label=left(p_label,120), platform=left(p_platform,240), last_verified_at=now() where id=p_device_id;
  else
    insert into public.devices(id,user_id,organization_id,label,platform,last_verified_at)
    values(p_device_id,auth.uid(),membership_organization_id,left(p_label,120),left(p_platform,240),now());
  end if;
  return jsonb_build_object('id',p_device_id,'organizationId',membership_organization_id,'verifiedAt',now());
end;
$$;
revoke all on function public.register_device(uuid,text,text) from public, anon;
grant execute on function public.register_device(uuid,text,text) to authenticated;
