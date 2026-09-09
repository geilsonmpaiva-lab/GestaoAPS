-- The validator is used by a CHECK constraint, so trusted backend inserts must
-- also be able to execute it. This function only inspects its JSON arguments.
grant execute on function app.formula_ast_is_valid(jsonb, integer) to service_role;
