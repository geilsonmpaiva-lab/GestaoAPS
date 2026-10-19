-- Only disposable fixtures. No patient records are created or queried.
begin;
select no_plan();
insert into auth.users(id,email) values
 ('96000000-0000-4000-8000-000000000001','metadata-admin@example.invalid'),
 ('96000000-0000-4000-8000-000000000002','metadata-manager@example.invalid'),
 ('96000000-0000-4000-8000-000000000003','metadata-reader@example.invalid'),
 ('96000000-0000-4000-8000-000000000004','metadata-target@example.invalid'),
 ('96000000-0000-4000-8000-000000000005','metadata-unit-b@example.invalid');
update public.profiles set status='ACTIVE' where id::text like '96000000%';
insert into public.organizations(id,name) values('362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] Metadados SQL') on conflict do nothing;
insert into public.units(id,organization_id,name) values
 ('96000000-0000-4000-8000-000000000011','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS A'),
 ('96000000-0000-4000-8000-000000000012','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS B');
insert into public.memberships(id,user_id,organization_id,unit_id,role,domains,operations) values
 ('96000000-0000-4000-8000-000000000101','96000000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab',null,'ADMIN_SISTEMA',array['*'],array['visualizar']),
 ('96000000-0000-4000-8000-000000000102','96000000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000011','GERENTE_UBS',array['administracao'],array['visualizar']),
 ('96000000-0000-4000-8000-000000000103','96000000-0000-4000-8000-000000000003','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000011','LEITOR',array['administracao'],array['visualizar']),
 ('96000000-0000-4000-8000-000000000104','96000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000011','EXECUTOR',array['protocolos'],array['visualizar']),
 ('96000000-0000-4000-8000-000000000105','96000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000012','EXECUTOR',array['protocolos'],array['visualizar']),
 ('96000000-0000-4000-8000-000000000106','96000000-0000-4000-8000-000000000005','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000012','LEITOR',array['protocolos'],array['visualizar']);
insert into public.esf_teams(id,organization_id,unit_id,name,code) values
 ('96000000-0000-4000-8000-000000000021','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000011','[SINTÉTICO] Equipe A','META-A'),
 ('96000000-0000-4000-8000-000000000022','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000012','[SINTÉTICO] Equipe B','META-B');
insert into public.esf_team_members(organization_id,unit_id,team_id,user_id) values
 ('362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000021','96000000-0000-4000-8000-000000000004'),
 ('362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000012','96000000-0000-4000-8000-000000000022','96000000-0000-4000-8000-000000000004');
insert into app.epi_grants_v1(user_id,organization_id,unit_id,team_id,areas,nominal,can_write,municipal,enabled) values
 ('96000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000011','96000000-0000-4000-8000-000000000021',array['hanseniase'],false,false,false,true),
 ('96000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab','96000000-0000-4000-8000-000000000012','96000000-0000-4000-8000-000000000022',array['tuberculose'],true,true,false,false),
 ('96000000-0000-4000-8000-000000000004','362db1a9-bfdd-4334-9436-46b1c0117eab',null,null,array['dengue'],false,false,true,true);
create temp table metadata_data(key text primary key,value jsonb); grant all on metadata_data to authenticated;
insert into metadata_data values('grants-before',(select jsonb_agg(to_jsonb(g) order by g.id) from app.epi_grants_v1 g where user_id='96000000-0000-4000-8000-000000000004'));
create function pg_temp.metadata_request(target_id uuid default '96000000-0000-4000-8000-000000000004') returns jsonb language sql as $$
 select jsonb_build_object('organizationId','362db1a9-bfdd-4334-9436-46b1c0117eab','userId',target_id); $$;

set local role anon;
select throws_ok($$select public.staging_read_aps_access_v1(pg_temp.metadata_request())$$,'42501',null,'anonymous metadata is forbidden');
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.staging_read_aps_access_v1(pg_temp.metadata_request())$$,'42501',null,'reader cannot inspect other access grants');
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.staging_read_aps_access_v1(pg_temp.metadata_request('96000000-0000-4000-8000-000000000005'))$$,'42501',null,'manager cannot inspect a person belonging only to another UBS');
select throws_ok($$select public.staging_read_aps_access_v1(pg_temp.metadata_request()||'{"organizationId":"96000000-0000-4000-8000-000000000099"}')$$,'42501',null,'institutional and other organizations are excluded');
select throws_ok($$select public.staging_read_aps_access_v1(pg_temp.metadata_request()||'{"includePatients":true}')$$,'22023',null,'unknown read options cannot request clinical fields');
insert into metadata_data values('manager',public.staging_read_aps_access_v1(pg_temp.metadata_request()));
select is((select jsonb_array_length(value->'teams') from metadata_data where key='manager'),1,'manager sees only the explicit team in its UBS');
select is((select value#>>'{teams,0,unitId}' from metadata_data where key='manager'),'96000000-0000-4000-8000-000000000011','team metadata is scoped to UBS A');
select is((select jsonb_array_length(value->'epidemiology') from metadata_data where key='manager'),1,'manager sees neither other-UBS nor municipal grants');
select is((select value#>'{epidemiology,0,nominal}' from metadata_data where key='manager'),'false'::jsonb,'nominal=false is preserved exactly');
select is((select value#>'{epidemiology,0,canWrite}' from metadata_data where key='manager'),'false'::jsonb,'write is not inferred from profile or membership');
select is((select value->'canManageGrants' from metadata_data where key='manager'),'false'::jsonb,'metadata inspection grants no delegation authority');
select throws_ok($$select * from app.epi_grants_v1$$,'42501',null,'specific grant table remains private');
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
insert into metadata_data values('admin',public.staging_read_aps_access_v1(pg_temp.metadata_request()));
select is((select jsonb_array_length(value->'teams') from metadata_data where key='admin'),2,'org administrator sees both authorized teams');
select is((select jsonb_array_length(value->'epidemiology') from metadata_data where key='admin'),3,'org administrator sees scoped and municipal grants');
select ok((select exists(select 1 from jsonb_array_elements(value->'epidemiology') g where g->'enabled'='false'::jsonb and g->'nominal'='true'::jsonb) from metadata_data where key='admin'),'disabled assignment is explicit, not presented as active access');
select ok((select not exists(select 1 from jsonb_object_keys(value) k where k not in ('userId','accountActive','canManageGrants','teams','epidemiology')) from metadata_data where key='admin'),'response contains only allowlisted administrative metadata');
select is((select value->'canManageGrants' from metadata_data where key='admin'),'false'::jsonb,'admin role also grants no nominal-edit control');
reset role;
select is((select jsonb_agg(to_jsonb(g) order by g.id) from app.epi_grants_v1 g where user_id='96000000-0000-4000-8000-000000000004'),(select value from metadata_data where key='grants-before'),'reads preserve every existing grant field');
update public.profiles set status='SUSPENDED' where id='96000000-0000-4000-8000-000000000004';
set local role authenticated;
select is(public.staging_read_aps_access_v1(pg_temp.metadata_request())->'accountActive','false'::jsonb,'inactive target account is explicit');
reset role;
update public.memberships set ends_at=now() where id='96000000-0000-4000-8000-000000000102';
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.staging_read_aps_access_v1(pg_temp.metadata_request())$$,'42501',null,'revocation is checked again on the next read');
reset role;
select ok(not has_function_privilege('anon','public.staging_read_aps_access_v1(jsonb)','execute'),'anonymous wrapper execute is revoked');
select * from finish();
rollback;
