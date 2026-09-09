create table public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  type text not null check (type in ('PROTOCOL','PROCEDURE','POLICY','STANDARD','MANUAL','GOOD_PRACTICE','LESSON_LEARNED','TEMPLATE','FLOW','FAQ','TECHNICAL_REFERENCE','EXTERNAL_DOCUMENT')),
  title text not null,
  domain text not null,
  subdomain text,
  tags text[] not null default '{}',
  access_level text not null default 'INTERNAL' check (access_level in ('PUBLIC_INSTITUTIONAL','INTERNAL','RESTRICTED')),
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','SUSPENDED','OBSOLETE')),
  responsible_id uuid references public.profiles(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  foreign key (organization_id, unit_id) references public.units(organization_id,id),
  unique(organization_id,unit_id,id)
);
create index knowledge_search_idx on public.knowledge_items using gin ((to_tsvector('portuguese', title)));

create table public.knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  knowledge_item_id uuid not null references public.knowledge_items(id),
  version_number integer not null,
  content jsonb not null,
  references_list jsonb not null default '[]',
  valid_from date,
  valid_until date,
  status text not null default 'DRAFT',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id, unit_id) references public.units(organization_id,id),
  unique(knowledge_item_id,version_number),
  unique(organization_id,unit_id,id)
);

create table public.protocols (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  code text not null,
  title text not null,
  domain text not null,
  subdomain text,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO','EM_REVISAO','APROVADO','PUBLICADO','SUSPENSO','OBSOLETO')),
  responsible_id uuid references public.profiles(id),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  foreign key (organization_id, unit_id) references public.units(organization_id,id),
  unique(organization_id,code),
  unique(organization_id,unit_id,id)
);

create table public.protocol_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  protocol_id uuid not null references public.protocols(id),
  version_number integer not null,
  content jsonb not null,
  valid_from date,
  valid_until date,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO','EM_REVISAO','APROVADO','PUBLICADO','SUSPENSO','OBSOLETO')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id, unit_id) references public.units(organization_id,id),
  unique(protocol_id,version_number),
  unique(organization_id,unit_id,id)
);

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  protocol_version_id uuid references public.protocol_versions(id),
  name text not null,
  version_number integer not null,
  schema jsonb not null,
  evidence_rules jsonb not null default '[]',
  scoring_rule jsonb,
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id, unit_id) references public.units(organization_id,id),
  unique(organization_id,unit_id,id)
);

create table public.executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  protocol_version_id uuid not null references public.protocol_versions(id),
  executor_id uuid not null references public.profiles(id),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','PENDING_SYNC','COMPLETED','REOPENED','CANCELLED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb,
  compliance text,
  notes text,
  accepted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(organization_id,unit_id,id)
);

create table public.execution_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  execution_id uuid not null references public.executions(id),
  field_key text not null,
  value jsonb,
  compliant boolean,
  observation text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(execution_id,field_key),
  unique(organization_id,unit_id,id)
);

create table public.evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid,
  attachment_id uuid not null references public.attachments(id),
  entity_type text not null,
  entity_id uuid not null,
  evidence_kind text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(attachment_id,entity_type,entity_id)
);

create table public.indicators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  code text not null,
  name text not null,
  objective text,
  definition text not null,
  unit text not null,
  periodicity text not null,
  source text not null,
  domain text not null,
  responsible_id uuid references public.profiles(id),
  better_direction text not null check (better_direction in ('HIGHER','LOWER','RANGE','EQUAL')),
  validation_rules jsonb not null default '{}',
  status text not null default 'ACTIVE',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(organization_id,code),
  unique(organization_id,unit_id,id)
);

create table public.indicator_formula_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid,
  indicator_id uuid not null references public.indicators(id),
  version_number integer not null,
  variables jsonb not null default '[]',
  expression_ast jsonb not null,
  valid_from date not null,
  valid_until date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(indicator_id,version_number),
  unique(organization_id,unit_id,id)
);

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  indicator_id uuid not null references public.indicators(id),
  starts_on date not null,
  ends_on date not null,
  comparison text not null check (comparison in ('GTE','LTE','BETWEEN','EQ')),
  target_value numeric,
  minimum_value numeric,
  maximum_value numeric,
  attention_rule jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  check (ends_on >= starts_on),
  unique(organization_id,unit_id,id)
);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  indicator_id uuid not null references public.indicators(id),
  formula_version_id uuid references public.indicator_formula_versions(id),
  competency date not null,
  value numeric,
  status text not null check (status in ('SEM_DADO','DENTRO_META','ATENCAO','FORA_META')),
  origin_type text not null,
  origin_id uuid,
  calculation_inputs jsonb,
  calculated_at timestamptz not null default now(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(indicator_id,unit_id,competency),
  unique(organization_id,unit_id,id)
);

create table public.critical_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  measurement_id uuid not null references public.measurements(id),
  analysis text not null,
  cause text,
  decision text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.nonconformities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  code text not null,
  origin_type text not null,
  origin_id uuid not null,
  classification text not null,
  description text not null,
  responsible_id uuid references public.profiles(id),
  due_at timestamptz,
  status text not null default 'OPEN' check (status in ('OPEN','IN_ANALYSIS','IN_TREATMENT','EFFECTIVENESS_PENDING','CLOSED','CANCELLED')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(organization_id,code),
  unique(organization_id,unit_id,id)
);

create table public.action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  origin_type text not null,
  origin_id uuid not null,
  title text not null,
  responsible_id uuid references public.profiles(id),
  due_at timestamptz,
  status text not null default 'NAO_INICIADO' check (status in ('NAO_INICIADO','EM_ANDAMENTO','BLOQUEADO','CONCLUIDO','CANCELADO')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(organization_id,unit_id,id)
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  action_plan_id uuid not null references public.action_plans(id),
  what text not null,
  why text,
  where_text text,
  when_at timestamptz,
  who_id uuid references public.profiles(id),
  how text,
  how_much numeric,
  status text not null default 'NAO_INICIADO' check (status in ('NAO_INICIADO','EM_ANDAMENTO','BLOQUEADO','CONCLUIDO','CANCELADO')),
  percentage smallint not null default 0 check (percentage between 0 and 100),
  blocked_reason text,
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  check ((status <> 'CONCLUIDO') or completed_at is not null),
  unique(organization_id,unit_id,id)
);

create table public.effectiveness_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid not null,
  action_plan_id uuid not null references public.action_plans(id),
  effective boolean not null,
  evaluated_at timestamptz not null,
  evaluator_id uuid not null references public.profiles(id),
  evidence_attachment_id uuid references public.attachments(id),
  requires_new_action boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  unit_id uuid,
  user_id uuid not null references public.profiles(id),
  kind text not null,
  severity text not null check (severity in ('INFORMATION','ATTENTION','CRITICAL')),
  source_type text not null,
  source_id uuid not null,
  title text not null,
  due_at timestamptz,
  read_at timestamptz,
  resolved_at timestamptz,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,unit_id) references public.units(organization_id,id),
  unique(user_id,fingerprint)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null,
  title text not null, starts_at timestamptz not null, ends_at timestamptz, location text, organizer_id uuid references public.profiles(id),
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','IN_PROGRESS','MINUTES_PENDING','COMPLETED','CANCELLED')),
  minutes text, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id), deleted_at timestamptz,
  foreign key (organization_id,unit_id) references public.units(organization_id,id), unique(organization_id,unit_id,id)
);
create table public.meeting_agenda_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, meeting_id uuid not null references public.meetings(id),
  position integer not null, title text not null, description text, decision text, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id), unique(meeting_id,position)
);
create table public.meeting_participants (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, meeting_id uuid not null references public.meetings(id),
  user_id uuid not null references public.profiles(id), attended boolean, created_at timestamptz not null default now(),
  foreign key (organization_id,unit_id) references public.units(organization_id,id), unique(meeting_id,user_id)
);
create table public.referrals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, meeting_id uuid not null references public.meetings(id),
  agenda_item_id uuid references public.meeting_agenda_items(id), description text not null, responsible_id uuid references public.profiles(id), due_at timestamptz, priority text not null default 'NORMAL',
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')), action_plan_id uuid references public.action_plans(id), completed_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.audit_model_versions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid,
  name text not null, audit_type text not null check (audit_type in ('INTERNAL','EXTERNAL')), domain text not null, periodicity text,
  checklist_schema jsonb not null, evidence_rules jsonb not null default '[]', scoring_rule jsonb, version_number integer not null, status text not null default 'DRAFT',
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);
create table public.audit_executions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, model_version_id uuid not null references public.audit_model_versions(id),
  auditor_id uuid not null references public.profiles(id), scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','IN_PROGRESS','COMPLETED','REOPENED','CANCELLED')), result jsonb, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.professionals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, name text not null, category text not null, role_name text,
  employment_type text, weekly_hours numeric, starts_on date, ends_on date, status text not null default 'ACTIVE', version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id), deleted_at timestamptz,
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);
create table public.shifts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, professional_id uuid not null references public.professionals(id),
  starts_at timestamptz not null, ends_at timestamptz not null, function_name text, location text, notes text, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id), check (ends_at > starts_at)
);
create table public.people_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, professional_id uuid not null references public.professionals(id),
  event_type text not null, starts_at timestamptz not null, ends_at timestamptz, notes text, status text not null default 'ACTIVE', version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.assets (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, asset_code text not null, name text not null, category text,
  location text, condition text, status text not null default 'AVAILABLE', version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id), deleted_at timestamptz,
  foreign key (organization_id,unit_id) references public.units(organization_id,id), unique(organization_id,asset_code)
);
create table public.asset_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, asset_id uuid not null references public.assets(id),
  movement_type text not null, from_location text, to_location text, reason text, occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);
create table public.maintenance_orders (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, asset_id uuid not null references public.assets(id),
  description text not null, status text not null default 'OPEN', opened_at timestamptz not null default now(), due_at timestamptz, completed_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, code text not null, name text not null, category text,
  minimum_stock numeric not null default 0, unit_of_measure text not null, status text not null default 'ACTIVE', version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id), deleted_at timestamptz,
  foreign key (organization_id,unit_id) references public.units(organization_id,id), unique(organization_id,unit_id,code)
);
create table public.stock_batches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, inventory_item_id uuid not null references public.inventory_items(id),
  batch_code text, expires_on date, quantity numeric not null default 0, version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null, inventory_item_id uuid not null references public.inventory_items(id),
  batch_id uuid references public.stock_batches(id), movement_type text not null check (movement_type in ('ENTRY','EXIT','ADJUSTMENT','LOSS')),
  quantity numeric not null check (quantity > 0), occurred_at timestamptz not null default now(), reason text,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.safety_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null,
  event_at timestamptz not null, notified_at timestamptz not null default now(), location text, event_type text not null,
  description text not null, harm_classification text, contributing_factors text, immediate_action text,
  analysis_responsible_id uuid references public.profiles(id), status text not null default 'REPORTED', action_plan_id uuid references public.action_plans(id), version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id), deleted_at timestamptz,
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.ombudsman_cases (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null,
  channel text not null, received_at timestamptz not null default now(), manifestation_type text not null, subject text not null,
  description text not null, priority text not null default 'NORMAL', responsible_id uuid references public.profiles(id),
  due_at timestamptz, status text not null default 'OPEN', analysis text, response text, action_plan_id uuid references public.action_plans(id), version integer not null default 1,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id), deleted_at timestamptz,
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid,
  template_type text not null, file_name text not null, status text not null default 'VALIDATING' check (status in ('VALIDATING','INVALID','READY','COMMITTED','FAILED')),
  summary jsonb not null default '{}', validation_errors jsonb not null default '[]', committed_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  foreign key (organization_id,unit_id) references public.units(organization_id,id)
);
