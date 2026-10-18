begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('93600000-0000-4000-8000-000000000001','meeting-manager@example.invalid',now(),'{"name":"Gerente sintético"}'),
 ('93600000-0000-4000-8000-000000000002','meeting-colleague@example.invalid',now(),'{"name":"Colega sintético"}'),
 ('93600000-0000-4000-8000-000000000003','meeting-other-unit@example.invalid',now(),'{"name":"Outra UBS"}'),
 ('93600000-0000-4000-8000-000000000004','meeting-inactive@example.invalid',now(),'{"name":"Inativo"}'),
 ('93600000-0000-4000-8000-000000000005','meeting-expired@example.invalid',now(),'{"name":"Vínculo encerrado"}'),
 ('93600000-0000-4000-8000-000000000006','meeting-reader@example.invalid',now(),'{"name":"Leitor"}');
update public.profiles set status='ACTIVE' where id::text like '93600000%';
update public.profiles set status='SUSPENDED' where id='93600000-0000-4000-8000-000000000004';
insert into public.organizations(id,name) values('93600000-0000-4000-8000-000000000010','Organização sintética local');
insert into public.units(id,organization_id,name) values
 ('93600000-0000-4000-8000-000000000011','93600000-0000-4000-8000-000000000010','UBS A'),
 ('93600000-0000-4000-8000-000000000012','93600000-0000-4000-8000-000000000010','UBS B');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations,starts_at,ends_at) values
 ('93600000-0000-4000-8000-000000000001','93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','GERENTE_UBS',array['reunioes'],array['visualizar','criar','editar'],now()-interval '1 day',null),
 ('93600000-0000-4000-8000-000000000002','93600000-0000-4000-8000-000000000010',null,'GESTOR_ORGANIZACAO',array['reunioes'],array['visualizar'],now()-interval '1 day',null),
 ('93600000-0000-4000-8000-000000000003','93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000012','LEITOR',array['reunioes'],array['visualizar'],now()-interval '1 day',null),
 ('93600000-0000-4000-8000-000000000004','93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','LEITOR',array['reunioes'],array['visualizar'],now()-interval '1 day',null),
 ('93600000-0000-4000-8000-000000000005','93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','LEITOR',array['reunioes'],array['visualizar'],now()-interval '2 days',now()-interval '1 day'),
 ('93600000-0000-4000-8000-000000000006','93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','LEITOR',array['reunioes'],array['visualizar'],now()-interval '1 day',null);
insert into public.meetings(id,organization_id,unit_id,title,starts_at) values('93600000-0000-4000-8000-000000000030','93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','Reunião sintética local',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','93600000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.profiles where id='93600000-0000-4000-8000-000000000002'),0::bigint,'perfil completo do colega continua protegido por RLS');
select lives_ok($$insert into public.meeting_participants(organization_id,unit_id,meeting_id,user_id,attended) values('93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','93600000-0000-4000-8000-000000000030','93600000-0000-4000-8000-000000000002',true)$$,'gerente registra presença de colega municipal autorizado');
select throws_ok($$insert into public.meeting_participants(organization_id,unit_id,meeting_id,user_id,attended) values('93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','93600000-0000-4000-8000-000000000030','93600000-0000-4000-8000-000000000003',true)$$,'23514',null,'colega de outra UBS bloqueado');
select throws_ok($$insert into public.meeting_participants(organization_id,unit_id,meeting_id,user_id,attended) values('93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','93600000-0000-4000-8000-000000000030','93600000-0000-4000-8000-000000000004',true)$$,'23514',null,'perfil inativo bloqueado');
select throws_ok($$insert into public.meeting_participants(organization_id,unit_id,meeting_id,user_id,attended) values('93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','93600000-0000-4000-8000-000000000030','93600000-0000-4000-8000-000000000005',true)$$,'23514',null,'vínculo encerrado bloqueado');
select lives_ok($$insert into public.referrals(organization_id,unit_id,meeting_id,description,responsible_id,due_at) values('93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','93600000-0000-4000-8000-000000000030','Encaminhamento sintético','93600000-0000-4000-8000-000000000002',now()+interval '1 day')$$,'gerente atribui encaminhamento ao colega autorizado');
select set_config('request.jwt.claim.sub','93600000-0000-4000-8000-000000000006',true);
select throws_ok($$insert into public.meeting_participants(organization_id,unit_id,meeting_id,user_id,attended) values('93600000-0000-4000-8000-000000000010','93600000-0000-4000-8000-000000000011','93600000-0000-4000-8000-000000000030','93600000-0000-4000-8000-000000000006',true)$$,'42501',null,'leitor continua sem permissão de escrita');
reset role;
select is((select prosecdef from pg_proc where oid='app.assert_user_membership_scope()'::regprocedure),false,'trigger permanece SECURITY INVOKER');
select * from finish();
rollback;
