create extension if not exists pgcrypto;
create schema if not exists app;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  cnpj text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  deleted_at timestamptz, deleted_by uuid references auth.users(id)
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) between 2 and 160),
  cnes text,
  address jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  deleted_at timestamptz, deleted_by uuid references auth.users(id),
  unique (organization_id, id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  status text not null default 'INVITED' check (status in ('INVITED','ACTIVE','SUSPENDED')),
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  role text not null check (role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS','RESPONSAVEL_DOMINIO','EXECUTOR','AUDITOR','LEITOR')),
  domains text[] not null default array['*']::text[],
  operations text[] not null default array['visualizar']::text[],
  starts_at timestamptz not null default now(), ends_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  constraint membership_unit_tenant_fk foreign key (organization_id, unit_id) references public.units(organization_id, id),
  unique nulls not distinct (user_id, organization_id, unit_id, role)
);

create index memberships_user_scope_idx on public.memberships(user_id, organization_id, unit_id) where ends_at is null;

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  key text not null,
  enabled boolean not null default false,
  reason text,
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  constraint feature_flag_unit_tenant_fk foreign key (organization_id, unit_id) references public.units(organization_id, id),
  unique nulls not distinct (organization_id, unit_id, key)
);

create table public.devices (
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  organization_id uuid not null references public.organizations(id),
  label text,
  platform text,
  last_verified_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  bucket text not null default 'evidence',
  object_path text not null,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  classification text not null default 'INTERNAL' check (classification in ('PUBLIC_INSTITUTIONAL','INTERNAL','RESTRICTED')),
  description text,
  status text not null default 'PENDING' check (status in ('PENDING','AVAILABLE','QUARANTINED','DELETED')),
  version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  deleted_at timestamptz, deleted_by uuid references auth.users(id),
  constraint attachment_unit_tenant_fk foreign key (organization_id, unit_id) references public.units(organization_id, id),
  unique (bucket, object_path)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  actor_id uuid references auth.users(id),
  device_id uuid,
  session_id text,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  changed_fields text[] not null default '{}',
  before_value jsonb,
  after_value jsonb,
  occurred_at timestamptz not null default now(),
  request_ip inet,
  constraint audit_unit_tenant_fk foreign key (organization_id, unit_id) references public.units(organization_id, id)
);
create index audit_log_scope_time_idx on public.audit_log(organization_id, unit_id, occurred_at desc);
revoke update, delete, truncate on public.audit_log from anon, authenticated;

create table public.domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  aggregate_version integer not null,
  actor_id uuid references auth.users(id),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  constraint domain_event_unit_tenant_fk foreign key (organization_id, unit_id) references public.units(organization_id, id)
);
create index domain_events_outbox_idx on public.domain_events(occurred_at) where processed_at is null;
create index domain_events_sync_idx on public.domain_events(organization_id, unit_id, occurred_at, id);

create table public.idempotency_keys (
  operation_id uuid primary key,
  user_id uuid not null references auth.users(id),
  organization_id uuid not null references public.organizations(id),
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  operation_id uuid not null,
  expected_version integer not null,
  server_version integer not null,
  client_payload jsonb not null,
  server_payload jsonb not null,
  status text not null default 'OPEN' check (status in ('OPEN','RESOLVED')),
  resolution text,
  justification text,
  resolved_by uuid references auth.users(id), resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sync_conflict_unit_tenant_fk foreign key (organization_id, unit_id) references public.units(organization_id, id)
);

create or replace function app.can_access(p_organization_id uuid, p_unit_id uuid, p_domain text, p_operation text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.memberships m
    join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
    where m.user_id = auth.uid()
      and m.organization_id = p_organization_id
      and (m.unit_id is null or p_unit_id is null or m.unit_id = p_unit_id)
      and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
      and ('*' = any(m.domains) or p_domain = any(m.domains))
      and (p_operation = any(m.operations) or m.role = 'ADMIN_SISTEMA')
  );
$$;

create or replace function app.touch_version()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function app.audit_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  source_row jsonb := coalesce(new_row, old_row);
  restricted boolean := coalesce(tg_argv[0], '') = 'restricted';
begin
  if restricted then
    old_row := old_row - array['description','content','payload','response','analysis','notes','address','before_value','after_value'];
    new_row := new_row - array['description','content','payload','response','analysis','notes','address','before_value','after_value'];
  end if;
  insert into public.audit_log(organization_id, unit_id, actor_id, entity_type, entity_id, action, changed_fields, before_value, after_value)
  values (
    (source_row->>'organization_id')::uuid,
    nullif(source_row->>'unit_id','')::uuid,
    auth.uid(), tg_table_name, (source_row->>'id')::uuid, tg_op,
    case when tg_op = 'UPDATE' then array(select key from jsonb_each(new_row) n where n.value is distinct from old_row->n.key) else array[]::text[] end,
    old_row, new_row
  );
  return coalesce(new, old);
end;
$$;

alter table public.organizations enable row level security;
alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.feature_flags enable row level security;
alter table public.devices enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_log enable row level security;
alter table public.domain_events enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.sync_conflicts enable row level security;

create policy organizations_select on public.organizations for select to authenticated using (app.can_access(id, null, 'administracao', 'visualizar'));
create policy units_select on public.units for select to authenticated using (app.can_access(organization_id, id, 'administracao', 'visualizar'));
create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());
create policy memberships_self on public.memberships for select to authenticated using (user_id = auth.uid() or app.can_access(organization_id, unit_id, 'administracao', 'visualizar'));
create policy feature_flags_select on public.feature_flags for select to authenticated using (app.can_access(organization_id, unit_id, 'administracao', 'visualizar'));
create policy devices_self_select on public.devices for select to authenticated using (user_id = auth.uid());
create policy attachments_select on public.attachments for select to authenticated using (app.can_access(organization_id, unit_id, 'evidencias', 'visualizar'));
create policy attachments_insert on public.attachments for insert to authenticated with check (created_by = auth.uid() and app.can_access(organization_id, unit_id, 'evidencias', 'criar'));
create policy audit_log_select on public.audit_log for select to authenticated using (app.can_access(organization_id, unit_id, 'auditoria', 'visualizar'));
create policy domain_events_select on public.domain_events for select to authenticated using (app.can_access(organization_id, unit_id, aggregate_type, 'visualizar'));
create policy idempotency_self on public.idempotency_keys for select to authenticated using (user_id = auth.uid());
create policy sync_conflicts_select on public.sync_conflicts for select to authenticated using (app.can_access(organization_id, unit_id, entity_type, 'visualizar'));

grant usage on schema public, app to authenticated;
grant select on public.organizations, public.units, public.profiles, public.memberships, public.feature_flags, public.audit_log, public.domain_events, public.sync_conflicts to authenticated;
grant select on public.devices to authenticated;
grant select, insert, update on public.attachments to authenticated;
grant execute on function app.can_access(uuid,uuid,text,text) to authenticated;
