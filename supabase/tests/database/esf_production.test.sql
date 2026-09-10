begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('93300000-0000-4000-8000-000000000001','esf-manager@example.invalid',now(),'{"name":"Gerente sintético"}'),
 ('93300000-0000-4000-8000-000000000002','esf-executor@example.invalid',now(),'{"name":"Executor sintético"}');
update public.profiles set status='ACTIVE' where id in ('93300000-0000-4000-8000-000000000001','93300000-0000-4000-8000-000000000002');
insert into public.organizations(id,name) values('93300000-0000-4000-8000-000000000010','Organização sintética');
insert into public.units(id,organization_id,name) values
 ('93300000-0000-4000-8000-000000000011','93300000-0000-4000-8000-000000000010','UBS A'),
 ('93300000-0000-4000-8000-000000000012','93300000-0000-4000-8000-000000000010','UBS B');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
 ('93300000-0000-4000-8000-000000000001','93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000011','GERENTE_UBS',array['administracao','esf.producao'],array['visualizar','criar','editar','aprovar','encerrar','reabrir','exportar']),
 ('93300000-0000-4000-8000-000000000002','93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000011','EXECUTOR',array['esf.producao'],array['visualizar','criar']);
insert into public.esf_teams(id,organization_id,unit_id,name,code) values
 ('93300000-0000-4000-8000-000000000021','93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000011','Equipe A','001'),
 ('93300000-0000-4000-8000-000000000022','93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000011','Equipe B','002'),
 ('93300000-0000-4000-8000-000000000023','93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000012','Equipe C','003');
insert into public.esf_team_members(organization_id,unit_id,team_id,user_id) values
 ('93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000011','93300000-0000-4000-8000-000000000021','93300000-0000-4000-8000-000000000002');
select set_config('test.esf_input','{"organizationId":"93300000-0000-4000-8000-000000000010","unitId":"93300000-0000-4000-8000-000000000011","teamId":"93300000-0000-4000-8000-000000000021","entityId":"93300000-0000-4000-8000-000000000041","occurredOn":"2026-09-09","procedureId":"med-consulta","quantity":0,"expectedVersion":0}',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','93300000-0000-4000-8000-000000000002',true);
select is(jsonb_array_length(public.read_esf_teams('93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000011')),1,'executor vê somente sua equipe');
select is(jsonb_array_length(public.read_esf_teams('93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000012')),0,'outra UBS bloqueada');
select ok(not has_table_privilege('authenticated','public.esf_production','SELECT'),'sem leitura direta que contorne RPC');
select ok(not has_table_privilege('authenticated','public.esf_production','INSERT'),'sem escrita direta');
select throws_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000051',current_setting('test.esf_input')::jsonb)$$,'42501',null,'feature flag desligada impede gravação');
reset role;
insert into public.feature_flags(organization_id,unit_id,key,enabled) values
 ('93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000011','esf.producao',true);
set local role authenticated;
select throws_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000051',current_setting('test.esf_input')::jsonb)$$,'42501',null,'catálogo não aprovado impede gravação');
reset role;
insert into public.feature_flags(organization_id,unit_id,key,enabled) values
 ('93300000-0000-4000-8000-000000000010','93300000-0000-4000-8000-000000000011','esf.producao.catalog_approved',true);
set local role authenticated;
select lives_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000051',current_setting('test.esf_input')::jsonb)$$,'produção zero confirmada');
select lives_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000051',current_setting('test.esf_input')::jsonb)$$,'reenvio retorna o mesmo resultado');
select throws_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000051',current_setting('test.esf_input')::jsonb||'{"quantity":2}')$$,'22023',null,'mesma operação com dados diferentes bloqueada');
select throws_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000052',current_setting('test.esf_input')::jsonb||'{"teamId":"93300000-0000-4000-8000-000000000022"}')$$,'42501',null,'ID de outra equipe não concede acesso');
select throws_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000053',current_setting('test.esf_input')::jsonb)$$,'23505',null,'não duplica equipe/data/procedimento');
select set_config('request.jwt.claim.sub','93300000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000054',current_setting('test.esf_input')::jsonb||'{"expectedVersion":9}')$$,'40001',null,'conflito otimista não sobrescreve registro');
select set_config('test.esf_month','{"organizationId":"93300000-0000-4000-8000-000000000010","unitId":"93300000-0000-4000-8000-000000000011","teamId":"93300000-0000-4000-8000-000000000021","competency":"2026-09","action":"submit","expectedVersion":2,"reason":""}',true);
select lives_ok($$select public.command_esf_production_month('93300000-0000-4000-8000-000000000055',current_setting('test.esf_month')::jsonb)$$,'envia mapa à revisão');
select throws_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000056',current_setting('test.esf_input')::jsonb||'{"expectedVersion":1,"quantity":2}')$$,'40001',null,'revisão bloqueia correção');
select lives_ok($$select public.command_esf_production_month('93300000-0000-4000-8000-000000000057',current_setting('test.esf_month')::jsonb||'{"action":"close","expectedVersion":3}')$$,'fecha versão revisada');
select lives_ok($$select public.command_esf_production_month('93300000-0000-4000-8000-000000000058',current_setting('test.esf_month')::jsonb||'{"action":"reopen","expectedVersion":4,"reason":"Correção institucional aprovada"}')$$,'reabertura cria nova revisão');
reset role;
select is((select revision from public.esf_production_months where team_id='93300000-0000-4000-8000-000000000021'),2,'revisão incrementada');
select is((select count(*) from public.esf_production_revisions where team_id='93300000-0000-4000-8000-000000000021'),1::bigint,'snapshot anterior preservado');
select throws_ok($$update public.esf_production_revisions set snapshot='[]' where team_id='93300000-0000-4000-8000-000000000021'$$,null,null,'snapshot imutável');
select is((select count(*) from public.esf_production where team_id='93300000-0000-4000-8000-000000000021'),1::bigint,'idempotência sem dupla gravação');
select is((select count(*) from public.domain_events where aggregate_type='esf.producao' and payload->>'entityType'='esf_production' and aggregate_id='93300000-0000-4000-8000-000000000041'),1::bigint,'outbox única para o lançamento');
update public.esf_team_members set deleted_at=now() where user_id='93300000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','93300000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.save_esf_production('93300000-0000-4000-8000-000000000051',current_setting('test.esf_input')::jsonb)$$,'42501',null,'revogação bloqueia até repetição de operação antiga');
reset role;
select * from finish();
rollback;
