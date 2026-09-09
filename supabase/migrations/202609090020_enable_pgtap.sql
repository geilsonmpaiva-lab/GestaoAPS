-- Keep database acceptance tests reproducible in local, CI and hosted validation environments.
create extension if not exists pgtap with schema extensions;
