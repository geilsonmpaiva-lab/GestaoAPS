-- Safe formula evaluation and the execution-to-indicator bridge.
create or replace function app.formula_ast_is_valid(p_node jsonb, p_depth integer default 0)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare child jsonb; count_args integer;
begin
  if p_depth>32 or jsonb_typeof(p_node)<>'object' or not (p_node ? 'type') then return false; end if;
  if p_node->>'type'='literal' then
    return jsonb_typeof(p_node->'value')='number' and (select count(*) from jsonb_object_keys(p_node))=2;
  elsif p_node->>'type'='variable' then
    return (p_node->>'name') ~ '^[a-z][a-z0-9_]{0,63}$' and (select count(*) from jsonb_object_keys(p_node))=2;
  elsif p_node->>'type'='binary' then
    return p_node->>'operator' in ('+','-','*','/')
      and (select count(*) from jsonb_object_keys(p_node))=4
      and app.formula_ast_is_valid(p_node->'left',p_depth+1)
      and app.formula_ast_is_valid(p_node->'right',p_depth+1);
  elsif p_node->>'type'='function' then
    if p_node->>'name' not in ('min','max','round') or jsonb_typeof(p_node->'args')<>'array' or (select count(*) from jsonb_object_keys(p_node))<>3 then return false; end if;
    count_args := jsonb_array_length(p_node->'args');
    if count_args<1 or count_args>32 or (p_node->>'name'='round' and count_args<>1) then return false; end if;
    for child in select * from jsonb_array_elements(p_node->'args') loop
      if not app.formula_ast_is_valid(child,p_depth+1) then return false; end if;
    end loop;
    return true;
  end if;
  return false;
end;
$$;

create or replace function app.evaluate_formula_ast(p_node jsonb, p_variables jsonb, p_depth integer default 0)
returns numeric language plpgsql immutable set search_path = public, pg_temp as $$
declare left_value numeric; right_value numeric; child jsonb; value numeric; aggregate_value numeric; argument_count integer := 0;
begin
  if p_depth>32 or not app.formula_ast_is_valid(p_node,p_depth) then raise exception 'Invalid formula AST' using errcode='22023'; end if;
  if p_node->>'type'='literal' then return (p_node->>'value')::numeric; end if;
  if p_node->>'type'='variable' then
    if not (p_variables ? (p_node->>'name')) or jsonb_typeof(p_variables->(p_node->>'name'))<>'number' then raise exception 'Missing or invalid formula variable %',p_node->>'name' using errcode='22023'; end if;
    return (p_variables->>(p_node->>'name'))::numeric;
  end if;
  if p_node->>'type'='binary' then
    left_value := app.evaluate_formula_ast(p_node->'left',p_variables,p_depth+1);
    right_value := app.evaluate_formula_ast(p_node->'right',p_variables,p_depth+1);
    if p_node->>'operator'='+' then return left_value+right_value;
    elsif p_node->>'operator'='-' then return left_value-right_value;
    elsif p_node->>'operator'='*' then return left_value*right_value;
    elsif right_value=0 then raise exception 'Division by zero' using errcode='22012';
    else return left_value/right_value; end if;
  end if;
  for child in select * from jsonb_array_elements(p_node->'args') loop
    value := app.evaluate_formula_ast(child,p_variables,p_depth+1); argument_count := argument_count+1;
    if aggregate_value is null then aggregate_value := value;
    elsif p_node->>'name'='min' then aggregate_value := least(aggregate_value,value);
    elsif p_node->>'name'='max' then aggregate_value := greatest(aggregate_value,value); end if;
  end loop;
  if argument_count=0 then raise exception 'Formula function requires arguments' using errcode='22023'; end if;
  if p_node->>'name'='round' then return round(aggregate_value); end if;
  return aggregate_value;
end;
$$;

alter table public.indicator_formula_versions
  add constraint indicator_formula_ast_valid check(app.formula_ast_is_valid(expression_ast)),
  add constraint indicator_formula_ast_size check(octet_length(expression_ast::text)<=65536);

create or replace function app.reject_formula_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$ begin raise exception 'Formula versions are immutable' using errcode='55000'; end; $$;
create trigger indicator_formula_versions_immutable before update or delete on public.indicator_formula_versions
for each row execute function app.reject_formula_mutation();
revoke insert,update,delete on public.indicator_formula_versions from authenticated;
revoke all on function app.evaluate_formula_ast(jsonb,jsonb,integer) from public,anon,authenticated;
revoke all on function app.formula_ast_is_valid(jsonb,integer) from public,anon;
grant execute on function app.formula_ast_is_valid(jsonb,integer) to authenticated;

create table public.protocol_indicator_bindings (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), unit_id uuid,
  protocol_version_id uuid not null references public.protocol_versions(id), indicator_id uuid not null references public.indicators(id),
  formula_version_id uuid not null references public.indicator_formula_versions(id), status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  foreign key(organization_id,unit_id) references public.units(organization_id,id),
  unique nulls not distinct(protocol_version_id,unit_id,indicator_id)
);
alter table public.protocol_indicator_bindings enable row level security;
create policy protocol_indicator_bindings_select on public.protocol_indicator_bindings for select to authenticated using(app.can_access(organization_id,unit_id,'indicadores','visualizar'));
create policy protocol_indicator_bindings_insert on public.protocol_indicator_bindings for insert to authenticated with check(app.can_access(organization_id,unit_id,'indicadores','criar'));
grant select,insert on public.protocol_indicator_bindings to authenticated;
create trigger protocol_indicator_binding_protocol_scope before insert or update of organization_id,unit_id,protocol_version_id on public.protocol_indicator_bindings for each row execute function app.assert_reference_scope('protocol_versions','protocol_version_id');
create trigger protocol_indicator_binding_indicator_scope before insert or update of organization_id,unit_id,indicator_id on public.protocol_indicator_bindings for each row execute function app.assert_reference_scope('indicators','indicator_id');
create trigger protocol_indicator_binding_formula_scope before insert or update of organization_id,unit_id,formula_version_id on public.protocol_indicator_bindings for each row execute function app.assert_reference_scope('indicator_formula_versions','formula_version_id');
create or replace function app.assert_binding_formula_match()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare formula_indicator_id uuid;
begin
  select indicator_id into formula_indicator_id from public.indicator_formula_versions where id=new.formula_version_id;
  if formula_indicator_id is distinct from new.indicator_id then raise exception 'Formula version does not belong to indicator' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger protocol_indicator_binding_formula_match before insert or update of indicator_id,formula_version_id on public.protocol_indicator_bindings for each row execute function app.assert_binding_formula_match();
create trigger protocol_indicator_bindings_outbox after insert or update or delete on public.protocol_indicator_bindings for each row execute function app.emit_domain_change('indicadores');
create trigger protocol_indicator_bindings_audit after insert or update or delete on public.protocol_indicator_bindings for each row execute function app.audit_change('');
revoke insert,update,delete on public.protocol_indicator_bindings from authenticated;

create extension if not exists btree_gist;
alter table public.targets add constraint targets_no_overlapping_periods
  exclude using gist(indicator_id with =,unit_id with =,daterange(starts_on,ends_on,'[]') with &&);

create or replace function app.classify_against_target(p_value numeric,p_comparison text,p_target numeric,p_minimum numeric,p_maximum numeric,p_attention jsonb)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_value is null or p_comparison is null then return 'SEM_DADO'; end if;
  if p_comparison='GTE' then
    if p_value>=p_target then return 'DENTRO_META'; end if;
    if p_attention ? 'value' and p_value>=(p_attention->>'value')::numeric then return 'ATENCAO'; end if;
  elsif p_comparison='LTE' then
    if p_value<=p_target then return 'DENTRO_META'; end if;
    if p_attention ? 'value' and p_value<=(p_attention->>'value')::numeric then return 'ATENCAO'; end if;
  elsif p_comparison='EQ' then
    if p_value=p_target then return 'DENTRO_META'; end if;
  elsif p_comparison='BETWEEN' then
    if p_value between p_minimum and p_maximum then return 'DENTRO_META'; end if;
    if p_attention ?& array['minimum','maximum'] and p_value between (p_attention->>'minimum')::numeric and (p_attention->>'maximum')::numeric then return 'ATENCAO'; end if;
  end if;
  return 'FORA_META';
end;
$$;

create or replace function public.complete_execution(p_execution_id uuid, p_expected_version integer, p_operation_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  e public.executions; prior jsonb; answer jsonb; next_version integer; binding public.protocol_indicator_bindings;
  formula public.indicator_formula_versions; target public.targets; measurement_id uuid; measurement_version integer;
  measurement_value numeric; measurement_status text; competency_date date := date_trunc('month',coalesce(nullif(p_payload->>'competency','')::date,current_date))::date;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior || jsonb_build_object('duplicate',true); end if;
  select * into e from public.executions where id=p_execution_id for update;
  if not found then raise exception 'Execution not found' using errcode='P0002'; end if;
  if not app.can_access(e.organization_id,e.unit_id,'protocolos','encerrar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if e.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if e.status not in ('OPEN','IN_PROGRESS','PENDING_SYNC','REOPENED') then raise exception 'Execution cannot be completed from its current state' using errcode='22023'; end if;

  if p_payload ? 'indicatorInputs' then
    select b.* into binding from public.protocol_indicator_bindings b
    where b.protocol_version_id=e.protocol_version_id and b.status='ACTIVE' and (b.unit_id=e.unit_id or b.unit_id is null)
    order by (b.unit_id is not null) desc limit 1;
    if not found then raise exception 'No active indicator binding for this protocol version' using errcode='22023'; end if;
    select f.* into formula from public.indicator_formula_versions f where f.id=binding.formula_version_id and f.indicator_id=binding.indicator_id;
    if not found then raise exception 'Indicator formula does not match binding' using errcode='23514'; end if;
    measurement_value := app.evaluate_formula_ast(formula.expression_ast,p_payload->'indicatorInputs');
    select t.* into target from public.targets t where t.indicator_id=binding.indicator_id and t.unit_id=e.unit_id and competency_date between t.starts_on and t.ends_on order by t.starts_on desc limit 1;
    measurement_status := app.classify_against_target(measurement_value,target.comparison,target.target_value,target.minimum_value,target.maximum_value,target.attention_rule);
    insert into public.measurements(organization_id,unit_id,indicator_id,formula_version_id,competency,value,status,origin_type,origin_id,calculation_inputs,created_by,updated_by)
    values(e.organization_id,e.unit_id,binding.indicator_id,formula.id,competency_date,measurement_value,measurement_status,'EXECUTION',e.id,p_payload->'indicatorInputs',auth.uid(),auth.uid())
    on conflict(indicator_id,unit_id,competency) do update set formula_version_id=excluded.formula_version_id,value=excluded.value,status=excluded.status,origin_type=excluded.origin_type,origin_id=excluded.origin_id,calculation_inputs=excluded.calculation_inputs,updated_by=auth.uid()
    returning id,version into measurement_id,measurement_version;
  end if;

  update public.executions set status='COMPLETED',completed_at=now(),accepted_at=now(),
    result=coalesce(p_payload->'result',result),compliance=coalesce(p_payload->>'compliance',compliance),notes=coalesce(p_payload->>'notes',notes),updated_by=auth.uid()
  where id=e.id returning version into next_version;
  answer := jsonb_build_object('id',e.id,'status','COMPLETED','version',next_version,'completedAt',now(),'measurement',
    case when measurement_id is null then null else jsonb_build_object('id',measurement_id,'version',measurement_version,'value',measurement_value,'status',measurement_status,'formulaVersionId',formula.id) end);
  insert into public.domain_events(organization_id,unit_id,event_type,aggregate_type,aggregate_id,aggregate_version,actor_id,payload)
  values(e.organization_id,e.unit_id,'ExecutionCompleted','protocolos',e.id,next_version,auth.uid(),jsonb_build_object('protocolVersionId',e.protocol_version_id,'measurementId',measurement_id));
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),e.organization_id,encode(digest(p_payload::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;
grant execute on function public.complete_execution(uuid,integer,uuid,jsonb) to authenticated;

create or replace function public.create_indicator_formula_version(p_indicator_id uuid,p_expected_version integer,p_operation_id uuid,p_variables jsonb,p_expression_ast jsonb,p_valid_from date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare i public.indicators; prior jsonb; answer jsonb; formula_id uuid; next_formula_version integer;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior || jsonb_build_object('duplicate',true); end if;
  select * into i from public.indicators where id=p_indicator_id for update;
  if not found then raise exception 'Indicator not found' using errcode='P0002'; end if;
  if not app.can_access(i.organization_id,i.unit_id,'indicadores','editar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if i.version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if jsonb_typeof(p_variables)<>'array' or not app.formula_ast_is_valid(p_expression_ast) or octet_length(p_expression_ast::text)>65536 then raise exception 'Invalid formula definition' using errcode='22023'; end if;
  select coalesce(max(version_number),0)+1 into next_formula_version from public.indicator_formula_versions where indicator_id=i.id;
  insert into public.indicator_formula_versions(organization_id,unit_id,indicator_id,version_number,variables,expression_ast,valid_from,created_by)
  values(i.organization_id,i.unit_id,i.id,next_formula_version,p_variables,p_expression_ast,p_valid_from,auth.uid()) returning id into formula_id;
  answer := jsonb_build_object('id',formula_id,'indicatorId',i.id,'version',next_formula_version,'validFrom',p_valid_from);
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),i.organization_id,encode(digest(jsonb_build_object('indicatorId',i.id,'ast',p_expression_ast,'validFrom',p_valid_from)::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

create or replace function public.bind_protocol_indicator(p_protocol_version_id uuid,p_expected_version integer,p_indicator_id uuid,p_formula_version_id uuid,p_unit_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare pv public.protocol_versions; i public.indicators; f public.indicator_formula_versions; prior jsonb; answer jsonb; binding_id uuid;
begin
  select response into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if prior is not null then return prior || jsonb_build_object('duplicate',true); end if;
  select * into pv from public.protocol_versions where id=p_protocol_version_id for update;
  if not found then raise exception 'Protocol version not found' using errcode='P0002'; end if;
  if pv.version_number<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
  if not app.can_access(pv.organization_id,coalesce(p_unit_id,pv.unit_id),'protocolos','editar') then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into i from public.indicators where id=p_indicator_id;
  select * into f from public.indicator_formula_versions where id=p_formula_version_id;
  if i.id is null or f.id is null or f.indicator_id<>i.id then raise exception 'Formula and indicator do not match' using errcode='23514'; end if;
  insert into public.protocol_indicator_bindings(organization_id,unit_id,protocol_version_id,indicator_id,formula_version_id,created_by)
  values(pv.organization_id,p_unit_id,pv.id,i.id,f.id,auth.uid()) returning id into binding_id;
  answer := jsonb_build_object('id',binding_id,'protocolVersionId',pv.id,'indicatorId',i.id,'formulaVersionId',f.id,'status','ACTIVE');
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response)
  values(p_operation_id,auth.uid(),pv.organization_id,encode(digest(answer::text,'sha256'),'hex'),answer);
  return answer;
end;
$$;

revoke all on function public.create_indicator_formula_version(uuid,integer,uuid,jsonb,jsonb,date) from public,anon;
revoke all on function public.bind_protocol_indicator(uuid,integer,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.create_indicator_formula_version(uuid,integer,uuid,jsonb,jsonb,date) to authenticated;
grant execute on function public.bind_protocol_indicator(uuid,integer,uuid,uuid,uuid,uuid) to authenticated;
