-- EXECUTE does not update PL/pgSQL's FOUND flag. Use ROW_COUNT so valid
-- references are accepted while cross-organization and cross-UBS links remain
-- blocked.
create or replace function app.assert_reference_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  reference_id uuid;
  parent_organization_id uuid;
  parent_unit_id uuid;
  matched_rows bigint;
begin
  reference_id := nullif(to_jsonb(new)->>tg_argv[1], '')::uuid;
  if reference_id is null then
    return new;
  end if;

  execute format(
    'select organization_id, unit_id from public.%I where id = $1',
    tg_argv[0]
  )
    into parent_organization_id, parent_unit_id
    using reference_id;
  get diagnostics matched_rows = row_count;

  if matched_rows = 0 then
    raise exception 'Referenced % not found', tg_argv[0] using errcode = '23503';
  end if;

  if parent_organization_id is distinct from new.organization_id
     or (parent_unit_id is not null and parent_unit_id is distinct from new.unit_id) then
    raise exception 'Cross-organization or cross-UBS reference is not allowed' using errcode = '23514';
  end if;

  return new;
end;
$$;
