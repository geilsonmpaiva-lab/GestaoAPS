begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','people-test-a@example.invalid',now(),'{"name":"Test actor"}'),
 ('91000000-0000-4000-8000-000000000002','people-test-b@example.invalid',now(),'{"name":"Test colleague"}'),
 ('91000000-0000-4000-8000-000000000003','people-test-c@example.invalid',now(),'{"name":"Other unit colleague"}'),
 ('91000000-0000-4000-8000-000000000004','people-test-d@example.invalid',now(),'{"name":"Other tenant colleague"}'),
 ('91000000-0000-4000-8000-000000000005','people-test-e@example.invalid',now(),'{"name":"Suspended colleague"}');
update public.profiles set status='SUSPENDED' where id='91000000-0000-4000-8000-000000000005';
insert into public.organizations(id,name) values ('91000000-0000-4000-8000-000000000010','People test org'),('91000000-0000-4000-8000-000000000020','Other people test org');
insert into public.units(id,organization_id,name) values
 ('91000000-0000-4000-8000-000000000011','91000000-0000-4000-8000-000000000010','People test unit'),
 ('91000000-0000-4000-8000-000000000012','91000000-0000-4000-8000-000000000010','Other people test unit'),
 ('91000000-0000-4000-8000-000000000021','91000000-0000-4000-8000-000000000020','Foreign people test unit');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
 ('91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000011','EXECUTOR',array['protocolos'],array['visualizar','executar']),
 ('91000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000011','LEITOR',array['protocolos'],array['visualizar']),
 ('91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000012','LEITOR',array['protocolos'],array['visualizar']),
 ('91000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000021','LEITOR',array['protocolos'],array['visualizar']),
 ('91000000-0000-4000-8000-000000000005','91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000011','LEITOR',array['protocolos'],array['visualizar']);
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select is((select count(*) from public.read_workspace_people('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000011')),2::bigint,'directory includes actor and active colleague only');
select results_eq($$select name from public.read_workspace_people('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000011') order by name$$,$$values('Test actor'::text),('Test colleague'::text)$$,'colleague names are usable without exposing full profiles');
select throws_ok($$select * from public.read_workspace_people('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000012')$$,'42501',null,'unit-scoped actor cannot query another unit directory');
select throws_ok($$select * from public.read_workspace_people('91000000-0000-4000-8000-000000000020','91000000-0000-4000-8000-000000000021')$$,'42501',null,'directory rejects another tenant');
select throws_ok($$select * from public.read_workspace_people('91000000-0000-4000-8000-000000000010',null)$$,'42501',null,'unit actor cannot broaden scope using null unit');
select * from finish();
rollback;
