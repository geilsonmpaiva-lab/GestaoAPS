-- Required for service_role to invoke narrowly granted helpers in app.* from
-- constraints and trusted backend jobs. Object-level privileges remain explicit.
grant usage on schema app to service_role;
