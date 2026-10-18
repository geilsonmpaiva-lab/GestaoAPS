-- The participant picker already uses read_workspace_people, whose private
-- membership lookup validates the actor, active profiles, tenant and UBS.
-- Reuse that directory instead of joining profiles under the writer's RLS:
-- a manager may legitimately assign a colleague whose full profile is hidden.
-- Keep this trigger SECURITY INVOKER; no new privileges, policies or row edits.
create or replace function app.assert_user_membership_scope()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare referenced_user uuid;
begin
  referenced_user := nullif(to_jsonb(new)->>tg_argv[0],'')::uuid;
  if referenced_user is null then return new; end if;
  if not exists (
    select 1 from public.read_workspace_people(new.organization_id,new.unit_id) person
    where person.id=referenced_user
  ) then
    raise exception 'Referenced user has no active membership in this scope' using errcode='23514';
  end if;
  return new;
end;
$$;
