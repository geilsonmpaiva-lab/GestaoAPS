-- Phase 1 only. No feature flags or clinical catalogs are enabled by this migration.
create table public.esf_teams (
 id uuid primary key, organization_id uuid not null, unit_id uuid not null,
 name text not null check(length(trim(name)) between 2 and 160),
 code text not null check(length(trim(code)) between 1 and 40), area text not null default '' check(length(area)<=160),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 version integer not null default 1, created_at timestamptz not null default now(), created_by uuid references auth.users(id),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id), deleted_at timestamptz,
 foreign key(organization_id,unit_id) references public.units(organization_id,id),
 unique(organization_id,unit_id,id)
);
create unique index esf_team_code on public.esf_teams(organization_id,unit_id,lower(code)) where deleted_at is null;
create table public.esf_team_members (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, team_id uuid not null,
 user_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id), deleted_at timestamptz,
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id),
 unique(team_id,user_id)
);
create table public.esf_production (
 id uuid primary key, organization_id uuid not null, unit_id uuid not null, team_id uuid not null,
 occurred_on date not null check(occurred_on between date '2000-01-01' and date '2100-12-31'),
 procedure_id text not null check(procedure_id in ('med-consulta','med-visita','med-puericultura','med-puerperio','med-prenatal',
 'enf-consulta','enf-visita','enf-puericultura','enf-puerperio','enf-prenatal','educ-enf','educ-aux','educ-med','educ-acs','acs-visita',
 'medio-domicilio','medicamento','pressao','inalacao','pontos','reidratacao','curativo','citopatologico','neonatal','glicemia')),
 quantity integer not null check(quantity between 0 and 1000000), version integer not null default 1,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id), deleted_at timestamptz,
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id)
);
create unique index esf_production_day on public.esf_production(team_id,occurred_on,procedure_id) where deleted_at is null;
create index esf_production_period on public.esf_production(organization_id,unit_id,team_id,occurred_on);
create table public.esf_production_months (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, team_id uuid not null,
 competency text not null check(competency ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'),
 status text not null default 'OPEN' check(status in ('OPEN','IN_REVIEW','CLOSED')),
 revision integer not null default 1, version integer not null default 1, snapshot jsonb,
 closed_at timestamptz, closed_by uuid references auth.users(id), reason text not null default '',
 created_at timestamptz not null default now(), created_by uuid references auth.users(id),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id),
 unique(team_id,competency)
);
create table public.esf_production_revisions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, team_id uuid not null,
 month_id uuid not null references public.esf_production_months(id), revision integer not null,
 snapshot jsonb not null, created_at timestamptz not null default now(), created_by uuid references auth.users(id),
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id), unique(month_id,revision)
);

-- Team association never grants domain/operation permissions on its own.
create function app.esf_access(p_org uuid,p_unit uuid,p_team uuid,p_operation text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_unit is not null and exists(select 1 from public.units u join public.organizations o on o.id=u.organization_id
 where u.id=p_unit and u.organization_id=p_org and u.status='ACTIVE' and u.deleted_at is null and o.status='ACTIVE' and o.deleted_at is null)
 and exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
 where m.user_id=auth.uid() and m.organization_id=p_org and (m.unit_id is null or m.unit_id=p_unit)
 and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
 and ('*'=any(m.domains) or 'esf.producao'=any(m.domains))
 and (p_operation=any(m.operations) or m.role='ADMIN_SISTEMA')
 and (m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS') or exists(
 select 1 from public.esf_team_members tm where tm.user_id=auth.uid() and tm.organization_id=p_org and tm.unit_id=p_unit
 and tm.team_id=p_team and tm.deleted_at is null)))
 and exists(select 1 from public.esf_teams t where t.id=p_team and t.organization_id=p_org and t.unit_id=p_unit and t.deleted_at is null and t.status='ACTIVE');
$$;
revoke all on function app.esf_access(uuid,uuid,uuid,text) from public,anon;
grant execute on function app.esf_access(uuid,uuid,uuid,text) to authenticated;

do $$ declare t text; begin
 foreach t in array array['esf_teams','esf_team_members','esf_production','esf_production_months','esf_production_revisions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('create trigger %I after insert or update on public.%I for each row execute function app.audit_change(''restricted'')',t||'_audit',t);
 execute format('create trigger %I after insert or update on public.%I for each row execute function app.emit_domain_change(''esf.producao'')',t||'_outbox',t);
 end loop;
 foreach t in array array['esf_teams','esf_production','esf_production_months'] loop
 execute format('create trigger %I before update on public.%I for each row execute function app.touch_version()',t||'_touch',t);
 end loop;
end $$;
-- Reads also pass through RPC. No direct client table access, including sync endpoints.
create trigger esf_revisions_immutable before update or delete on public.esf_production_revisions for each row execute function app.reject_audit_mutation();

create function public.read_esf_teams(p_org uuid,p_unit uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'area',area,'status',status) order by name,id)
 from public.esf_teams where organization_id=p_org and unit_id=p_unit and deleted_at is null
 and (app.admin_scope(p_org,p_unit,'visualizar') or app.esf_access(p_org,p_unit,id,'visualizar'))),'[]'::jsonb);
end $$;

create function public.register_esf_team(p_operation_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=(p_input->>'organizationId')::uuid; unit uuid:=(p_input->>'unitId')::uuid; prior public.idempotency_keys; fingerprint text; answer jsonb;
begin
 if not app.admin_scope(org,unit,'criar') or unit is null then raise exception 'Sem permissão para cadastrar equipes.' using errcode='42501'; end if;
 if p_operation_id is null or p_input->>'entityId' is null or length(trim(coalesce(p_input->>'name',''))) not between 2 and 160
 or length(trim(coalesce(p_input->>'code',''))) not between 1 and 40 or length(coalesce(p_input->>'area',''))>160 or octet_length(p_input::text)>2000
 then raise exception 'Equipe inválida.' using errcode='22023'; end if;
 if not exists(select 1 from public.units u join public.organizations o on o.id=u.organization_id where u.id=unit and u.organization_id=org and u.status='ACTIVE' and u.deleted_at is null and o.status='ACTIVE' and o.deleted_at is null) then raise exception 'Unidade indisponível.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_array('register_esf_team',p_input)::text,'sha256'),'hex');
 select * into prior from public.idempotency_keys where operation_id=p_operation_id;
 if found then
 if prior.user_id<>auth.uid() or prior.request_hash<>fingerprint then raise exception 'Operação reutilizada com outros dados.' using errcode='22023'; end if;
 return prior.response; end if;
 insert into public.esf_teams(id,organization_id,unit_id,name,code,area,created_by,updated_by)
 values((p_input->>'entityId')::uuid,org,unit,trim(p_input->>'name'),trim(p_input->>'code'),coalesce(p_input->>'area',''),auth.uid(),auth.uid());
 answer:=jsonb_build_object('id',p_input->>'entityId','version',1);
 insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),org,fingerprint,answer);
 return answer;
end $$;

create function public.save_esf_production(p_operation_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=(p_input->>'organizationId')::uuid; unit uuid:=(p_input->>'unitId')::uuid; team uuid:=(p_input->>'teamId')::uuid;
 entity uuid:=(p_input->>'entityId')::uuid; occurred date:=(p_input->>'occurredOn')::date; expected integer:=(p_input->>'expectedVersion')::integer;
 prior public.idempotency_keys; fingerprint text; answer jsonb; rec public.esf_production; mon public.esf_production_months;
begin
 if not app.esf_access(org,unit,team,case when expected=0 then 'criar' else 'editar' end)
 or not app.feature_enabled(org,unit,'esf.producao') or not app.feature_enabled(org,unit,'esf.producao.catalog_approved')
 then raise exception 'Produção indisponível ou sem autorização.' using errcode='42501'; end if;
 if p_operation_id is null or entity is null or occurred is null or expected is null or expected<0 or octet_length(p_input::text)>2000
 or coalesce(p_input->>'quantity','') !~ '^[0-9]{1,7}$' then raise exception 'Lançamento inválido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_array('save_esf_production',p_input)::text,'sha256'),'hex');
 select * into prior from public.idempotency_keys where operation_id=p_operation_id;
 if found then
 if prior.user_id<>auth.uid() or prior.request_hash<>fingerprint then raise exception 'Operação reutilizada com outros dados.' using errcode='22023'; end if;
 return prior.response; end if;
 insert into public.esf_production_months(organization_id,unit_id,team_id,competency,created_by)
 values(org,unit,team,to_char(occurred,'YYYY-MM'),auth.uid()) on conflict(team_id,competency) do nothing;
 select * into mon from public.esf_production_months where team_id=team and competency=to_char(occurred,'YYYY-MM') for update;
 if mon.status<>'OPEN' then raise exception 'Mapa em revisão ou fechado. Solicite devolução ou reabertura.' using errcode='40001'; end if;
 if expected=0 then
 if exists(select 1 from public.esf_production where team_id=team and occurred_on=occurred and procedure_id=p_input->>'procedureId' and deleted_at is null) then
 raise exception 'Já existe lançamento deste procedimento nesta equipe e data. Abra o registro existente.' using errcode='23505'; end if;
 insert into public.esf_production(id,organization_id,unit_id,team_id,occurred_on,procedure_id,quantity,created_by,updated_by)
 values(entity,org,unit,team,occurred,p_input->>'procedureId',(p_input->>'quantity')::integer,auth.uid(),auth.uid()) returning * into rec;
 else
 select * into rec from public.esf_production where id=entity and organization_id=org and unit_id=unit and team_id=team and deleted_at is null for update;
 if not found then raise exception 'Registro indisponível.' using errcode='P0002'; end if;
 if rec.version<>expected then raise exception 'O registro possui outra versão. Sua edição foi preservada no formulário.' using errcode='40001'; end if;
 if rec.occurred_on<>occurred or rec.procedure_id<>p_input->>'procedureId' then raise exception 'Data, equipe e procedimento não podem mudar na correção.' using errcode='22023'; end if;
 update public.esf_production set quantity=(p_input->>'quantity')::integer where id=entity returning * into rec;
 end if;
 update public.esf_production_months set updated_by=auth.uid() where id=mon.id;
 answer:=jsonb_build_object('id',rec.id,'version',rec.version);
 insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),org,fingerprint,answer);
 return answer;
end $$;

create function public.command_esf_production_month(p_operation_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid:=(p_input->>'organizationId')::uuid; unit uuid:=(p_input->>'unitId')::uuid; team uuid:=(p_input->>'teamId')::uuid;
 v_competency text:=p_input->>'competency'; action text:=p_input->>'action'; next_status text; mon public.esf_production_months;
 prior public.idempotency_keys; fingerprint text; answer jsonb; totals jsonb;
begin
 if action is null or action not in ('submit','return','close','reopen') then raise exception 'Comando inválido.' using errcode='22023'; end if;
 if not app.esf_access(org,unit,team,case action when 'submit' then 'criar' when 'reopen' then 'reabrir' when 'close' then 'encerrar' else 'aprovar' end)
 or (action<>'submit' and not app.admin_scope(org,unit,'visualizar'))
 or not app.feature_enabled(org,unit,'esf.producao') or not app.feature_enabled(org,unit,'esf.producao.catalog_approved')
 then raise exception 'Sem autorização para esta transição.' using errcode='42501'; end if;
 if p_operation_id is null or v_competency is null or v_competency !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
 or p_input->>'expectedVersion' is null or octet_length(p_input::text)>2000 or length(coalesce(p_input->>'reason',''))>500
 or (action in ('return','reopen') and length(trim(coalesce(p_input->>'reason','')))<10)
 then raise exception 'Competência, versão ou justificativa inválida.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_array('command_esf_production_month',p_input)::text,'sha256'),'hex');
 select * into prior from public.idempotency_keys where operation_id=p_operation_id;
 if found then
 if prior.user_id<>auth.uid() or prior.request_hash<>fingerprint then raise exception 'Operação reutilizada com outros dados.' using errcode='22023'; end if;
 return prior.response; end if;
 select * into mon from public.esf_production_months m where m.team_id=team and m.competency=v_competency for update;
 if not found then raise exception 'Nenhum mapa iniciado nesta competência.' using errcode='P0002'; end if;
 if mon.version<>(p_input->>'expectedVersion')::integer then raise exception 'O mapa mudou. Recarregue antes de confirmar.' using errcode='40001'; end if;
 next_status:=case when mon.status='OPEN' and action='submit' then 'IN_REVIEW' when mon.status='IN_REVIEW' and action='return' then 'OPEN'
 when mon.status='IN_REVIEW' and action='close' then 'CLOSED' when mon.status='CLOSED' and action='reopen' then 'OPEN' else null end;
 if next_status is null then raise exception 'Transição indisponível.' using errcode='22023'; end if;
 if action='close' then
 select coalesce(jsonb_agg(jsonb_build_object('procedureId',procedure_id,'quantity',quantity) order by procedure_id),'[]'::jsonb) into totals
 from (select procedure_id,sum(quantity) as quantity from public.esf_production where team_id=team and to_char(occurred_on,'YYYY-MM')=v_competency and deleted_at is null group by procedure_id) s;
 insert into public.esf_production_revisions(organization_id,unit_id,team_id,month_id,revision,snapshot,created_by) values(org,unit,team,mon.id,mon.revision,totals,auth.uid());
 end if;
 update public.esf_production_months set status=next_status, reason=coalesce(p_input->>'reason',''),
 revision=revision+case when action='reopen' then 1 else 0 end,
 snapshot=case when action='close' then totals when action='reopen' then null else snapshot end,
 closed_at=case when action='close' then now() when action='reopen' then null else closed_at end,
 closed_by=case when action='close' then auth.uid() when action='reopen' then null else closed_by end where id=mon.id returning * into mon;
 answer:=jsonb_build_object('id',mon.id,'status',mon.status,'version',mon.version,'revision',mon.revision);
 insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),org,fingerprint,answer);
 return answer;
end $$;

create function public.read_esf_production(p_org uuid,p_unit uuid,p_team uuid,p_competency text,p_page integer default 1,p_search text default '')
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; first_day date; after_day date;
begin
 if not app.esf_access(p_org,p_unit,p_team,'visualizar') or not app.feature_enabled(p_org,p_unit,'esf.producao') then raise exception 'Sem acesso à produção desta equipe.' using errcode='42501'; end if;
 if p_competency is null or p_competency !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$' or p_page is null or p_page not between 1 and 100000 or length(p_search)>80 then raise exception 'Filtros inválidos.' using errcode='22023'; end if;
 first_day:=(p_competency||'-01')::date; after_day:=(first_day+interval '1 month')::date;
 select jsonb_build_object('demo',false,'teams',public.read_esf_teams(p_org,p_unit),
 'records',coalesce((select jsonb_agg(to_jsonb(s)) from (select id,team_id,occurred_on,procedure_id,quantity,version from public.esf_production where team_id=p_team and occurred_on>=first_day and occurred_on<after_day and deleted_at is null and (p_search='' or procedure_id=p_search) order by occurred_on desc,id limit 25 offset (p_page-1)*25) s),'[]'::jsonb),
 'total',(select count(*) from public.esf_production where team_id=p_team and occurred_on>=first_day and occurred_on<after_day and deleted_at is null and (p_search='' or procedure_id=p_search)),
 'summary',coalesce((select jsonb_agg(jsonb_build_object('procedureId',procedure_id,'quantity',quantity)) from (select procedure_id,sum(quantity) quantity from public.esf_production where team_id=p_team and occurred_on>=first_day and occurred_on<after_day and deleted_at is null group by procedure_id) s),'[]'::jsonb),
 'annual',coalesce((select jsonb_agg(jsonb_build_object('competency',competency,'procedureId',procedure_id,'quantity',quantity)) from (select to_char(occurred_on,'YYYY-MM') competency,procedure_id,sum(quantity) quantity from public.esf_production where team_id=p_team and occurred_on>=date_trunc('year',first_day)::date and occurred_on<(date_trunc('year',first_day)+interval '1 year')::date and deleted_at is null group by to_char(occurred_on,'YYYY-MM'),procedure_id) s),'[]'::jsonb),
 'monthly',(select to_jsonb(m) from public.esf_production_months m where team_id=p_team and competency=p_competency),
 'canCreate',app.esf_access(p_org,p_unit,p_team,'criar') and app.feature_enabled(p_org,p_unit,'esf.producao.catalog_approved'),
 'canEdit',app.esf_access(p_org,p_unit,p_team,'editar') and app.feature_enabled(p_org,p_unit,'esf.producao.catalog_approved'),
 'canReview',app.esf_access(p_org,p_unit,p_team,'aprovar') and app.admin_scope(p_org,p_unit,'visualizar'),
 'canClose',app.esf_access(p_org,p_unit,p_team,'encerrar') and app.admin_scope(p_org,p_unit,'visualizar'),
 'canReopen',app.esf_access(p_org,p_unit,p_team,'reabrir') and app.admin_scope(p_org,p_unit,'visualizar'),
 'canExport',app.esf_access(p_org,p_unit,p_team,'exportar')) into result;
 return result;
end $$;

revoke all on function public.read_esf_teams(uuid,uuid) from public,anon;
revoke all on function public.register_esf_team(uuid,jsonb) from public,anon;
revoke all on function public.save_esf_production(uuid,jsonb) from public,anon;
revoke all on function public.command_esf_production_month(uuid,jsonb) from public,anon;
revoke all on function public.read_esf_production(uuid,uuid,uuid,text,integer,text) from public,anon;
grant execute on function public.read_esf_teams(uuid,uuid), public.register_esf_team(uuid,jsonb), public.save_esf_production(uuid,jsonb), public.command_esf_production_month(uuid,jsonb), public.read_esf_production(uuid,uuid,uuid,text,integer,text) to authenticated;
