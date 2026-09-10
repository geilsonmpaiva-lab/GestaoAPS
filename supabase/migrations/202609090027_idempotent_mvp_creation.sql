create or replace function public.create_mvp_record(p_resource text,p_operation_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid; unit uuid; domain_name text; table_name text; row_data jsonb; prior public.idempotency_keys; answer jsonb; fingerprint text; colnames text; selectors text;
begin
  if auth.uid() is null or p_operation_id is null then raise exception 'Forbidden' using errcode='42501'; end if;
  org:=(p_input->>'organizationId')::uuid; unit:=nullif(p_input->>'unitId','')::uuid;
  domain_name:=case p_resource when 'knowledge' then 'conhecimento' when 'protocols' then 'protocolos' when 'indicators' then 'indicadores' when 'meetings' then 'reunioes' when 'action-plans' then 'melhoria' end;
  if domain_name is null or org is null or not app.can_access(org,unit,domain_name,'criar') then raise exception 'Forbidden' using errcode='42501'; end if;
  if p_resource in ('meetings','action-plans') and unit is null then raise exception 'Unit required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  fingerprint:=encode(extensions.digest(jsonb_build_array('create_mvp_record',p_resource,p_input)::text,'sha256'),'hex');
  select * into prior from public.idempotency_keys where operation_id=p_operation_id and user_id=auth.uid();
  if found then
    if prior.request_hash<>fingerprint then raise exception 'Operation payload changed' using errcode='22023'; end if;
    return prior.response;
  end if;
  if octet_length(p_input::text)>20000 or length(trim(coalesce(p_input->>'title',p_input->>'name',''))) not between 3 and 240 then raise exception 'Invalid draft' using errcode='22023'; end if;
  if p_resource in ('knowledge','protocols','indicators') and length(trim(coalesce(p_input->>'domain',''))) not between 2 and 80 then raise exception 'Invalid domain' using errcode='22023'; end if;
  if p_resource='knowledge' then
    table_name:='knowledge_items'; row_data:=jsonb_build_object('title',p_input->>'title','type',p_input->>'type','domain',p_input->>'domain','access_level',coalesce(p_input->>'accessLevel','INTERNAL'),'responsible_id',auth.uid());
  elsif p_resource='protocols' then
    table_name:='protocols'; row_data:=jsonb_build_object('title',p_input->>'title','code',p_input->>'code','domain',p_input->>'domain','responsible_id',auth.uid());
  elsif p_resource='indicators' then
    table_name:='indicators'; row_data:=jsonb_build_object('name',p_input->>'name','code',p_input->>'code','definition',p_input->>'definition','unit',p_input->>'unit','periodicity',p_input->>'periodicity','source',p_input->>'source','domain',p_input->>'domain','better_direction',p_input->>'betterDirection','responsible_id',auth.uid());
  elsif p_resource='meetings' then
    table_name:='meetings'; row_data:=jsonb_build_object('title',p_input->>'title','starts_at',p_input->>'startsAt','location',p_input->>'location','organizer_id',auth.uid());
  else
    table_name:='action_plans'; row_data:=jsonb_build_object('title',p_input->>'title','due_at',p_input->>'dueAt','origin_type','MANUAL','origin_id',p_operation_id,'responsible_id',auth.uid());
  end if;
  row_data:=row_data||jsonb_build_object('organization_id',org,'unit_id',unit,'created_by',auth.uid(),'updated_by',auth.uid());
  select string_agg(format('%I',key),',' order by key),string_agg(format('r.%I',key),',' order by key) into colnames,selectors from jsonb_object_keys(row_data) as keys(key);
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',table_name,colnames,selectors,table_name,table_name) into answer using row_data;
  insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),org,fingerprint,answer);
  return answer;
end; $$;
revoke all on function public.create_mvp_record(text,uuid,jsonb) from public,anon;
grant execute on function public.create_mvp_record(text,uuid,jsonb) to authenticated;
