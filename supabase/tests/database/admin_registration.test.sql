begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('93200000-0000-4000-8000-000000000001','admin-org@example.invalid',now(),'{"name":"Gestor teste"}'),
 ('93200000-0000-4000-8000-000000000002','admin-unit@example.invalid',now(),'{"name":"Gerente teste"}'),
 ('93200000-0000-4000-8000-000000000003','admin-target@example.invalid',now(),'{"name":"Pessoa teste"}');
insert into public.organizations(id,name) values ('93200000-0000-4000-8000-000000000010','Organização teste'),('93200000-0000-4000-8000-000000000020','Outra organização');
insert into public.units(id,organization_id,name) values
 ('93200000-0000-4000-8000-000000000011','93200000-0000-4000-8000-000000000010','Unidade A'),
 ('93200000-0000-4000-8000-000000000012','93200000-0000-4000-8000-000000000010','Unidade B');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
 ('93200000-0000-4000-8000-000000000001','93200000-0000-4000-8000-000000000010',null,'GESTOR_ORGANIZACAO',array['*'],array['visualizar','criar']),
 ('93200000-0000-4000-8000-000000000002','93200000-0000-4000-8000-000000000010','93200000-0000-4000-8000-000000000011','GERENTE_UBS',array['administracao','protocolos'],array['visualizar','criar']);
set local role authenticated;
select set_config('request.jwt.claim.sub','93200000-0000-4000-8000-000000000002',true);
select is(jsonb_array_length(public.read_admin_catalog('93200000-0000-4000-8000-000000000010')->'units'),1,'gerente vê somente sua UBS');
select is(jsonb_array_length(public.read_admin_catalog('93200000-0000-4000-8000-000000000010')->'users'),1,'gerente não vê vínculos da organização inteira');
select throws_ok($$select public.read_admin_catalog('93200000-0000-4000-8000-000000000020')$$,'42501',null,'outra organização bloqueada');
select throws_ok($$select public.authorize_admin_invite('93200000-0000-4000-8000-000000000010',null,'LEITOR',array['protocolos'],array['visualizar'])$$,'42501',null,'null não amplia escopo');
select throws_ok($$select public.authorize_admin_invite('93200000-0000-4000-8000-000000000010','93200000-0000-4000-8000-000000000012','LEITOR',array['protocolos'],array['visualizar'])$$,'42501',null,'convite em outra UBS bloqueado');
select throws_ok($$select public.authorize_admin_invite('93200000-0000-4000-8000-000000000010','93200000-0000-4000-8000-000000000011','ADMIN_SISTEMA',array['protocolos'],array['visualizar'])$$,'42501',null,'elevação de perfil bloqueada');
select throws_ok($$select public.authorize_admin_invite('93200000-0000-4000-8000-000000000010','93200000-0000-4000-8000-000000000011','LEITOR',array['indicadores'],array['visualizar'])$$,'42501',null,'domínio não detido bloqueado');
select throws_ok($$select public.authorize_admin_invite('93200000-0000-4000-8000-000000000010','93200000-0000-4000-8000-000000000011','LEITOR',array['protocolos'],array['publicar'])$$,'42501',null,'operação não detida bloqueada');
select lives_ok($$select public.provision_invited_membership('93200000-0000-4000-8000-000000000003','93200000-0000-4000-8000-000000000010','93200000-0000-4000-8000-000000000011','LEITOR',array['protocolos'],array['visualizar'])$$,'vínculo autorizado funciona');
select throws_ok($$select public.register_admin_unit('93200000-0000-4000-8000-000000000099','{"organizationId":"93200000-0000-4000-8000-000000000010","name":"Nova UBS","cnes":"1234567","address":{}}')$$,'42501',null,'gerente de UBS não cadastra unidades');
select set_config('request.jwt.claim.sub','93200000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.register_admin_unit('93200000-0000-4000-8000-000000000099','{"organizationId":"93200000-0000-4000-8000-000000000010","name":"Nova UBS","cnes":"1234567","address":{}}')$$,'gestor autorizado cadastra unidade');
select lives_ok($$select public.register_admin_unit('93200000-0000-4000-8000-000000000099','{"organizationId":"93200000-0000-4000-8000-000000000010","name":"Nova UBS","cnes":"1234567","address":{}}')$$,'reenvio é idempotente');
select throws_ok($$select public.register_admin_unit('93200000-0000-4000-8000-000000000099','{"organizationId":"93200000-0000-4000-8000-000000000010","name":"Outro nome","cnes":"1234567","address":{}}')$$,'22023',null,'reuso com outro payload bloqueado');
select throws_ok($$select public.register_admin_unit('93200000-0000-4000-8000-000000000098','{"organizationId":"93200000-0000-4000-8000-000000000010","name":"Duplicada","cnes":"1234567","address":{}}')$$,'23505',null,'CNES duplicado bloqueado');
reset role;
select is((select count(*) from public.units where organization_id='93200000-0000-4000-8000-000000000010' and cnes='1234567'),1::bigint,'apenas uma unidade foi criada');
select is((select count(*) from public.audit_log where entity_type='units' and actor_id='93200000-0000-4000-8000-000000000001'),1::bigint,'cadastro auditado uma vez');
select is((select count(*) from public.domain_events where aggregate_type='administracao' and actor_id='93200000-0000-4000-8000-000000000001' and payload->>'entityType'='units'),1::bigint,'outbox na mesma transação');
select * from finish();
rollback;
