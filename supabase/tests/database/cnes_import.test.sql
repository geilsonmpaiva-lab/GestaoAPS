begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('93500000-0000-4000-8000-000000000001','cnes-admin@example.invalid',now(),'{"name":"Gestor CNES teste"}'),
 ('93500000-0000-4000-8000-000000000002','cnes-reader@example.invalid',now(),'{"name":"Leitor CNES teste"}');
insert into public.organizations(id,name) values ('93500000-0000-4000-8000-000000000010','Organização CNES teste'),('93500000-0000-4000-8000-000000000020','Outra organização CNES');
insert into public.units(id,organization_id,name,cnes) values ('93500000-0000-4000-8000-000000000011','93500000-0000-4000-8000-000000000010','Nome local preservado','3657973');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
 ('93500000-0000-4000-8000-000000000001','93500000-0000-4000-8000-000000000010',null,'GESTOR_ORGANIZACAO',array['administracao'],array['visualizar','criar']),
 ('93500000-0000-4000-8000-000000000002','93500000-0000-4000-8000-000000000010','93500000-0000-4000-8000-000000000011','GERENTE_UBS',array['administracao'],array['visualizar','criar']);
set local role authenticated;
select set_config('request.jwt.claim.sub','93500000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.import_cnes_units('93500000-0000-4000-8000-000000000099','93500000-0000-4000-8000-000000000010','230020','CE','2',array['0808792'],null)$$,'42501',null,'gerente restrito à UBS não importa');
select set_config('request.jwt.claim.sub','93500000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.import_cnes_units('93500000-0000-4000-8000-000000000099','93500000-0000-4000-8000-000000000020','230020','CE','2',array['0808792'],null)$$,'42501',null,'outra organização bloqueada');
select is(public.import_cnes_units('93500000-0000-4000-8000-000000000099','93500000-0000-4000-8000-000000000010','230020','CE','2',array['0808792','3657973'],null),null::jsonb,'consulta prévia não cria unidades');
select lives_ok($$select public.import_cnes_units('93500000-0000-4000-8000-000000000099','93500000-0000-4000-8000-000000000010','230020','CE','2',array['0808792','3657973'],
 '[{"cnes":"0808792","name":"UBS importada teste","municipality":"230020","type":"2","sourceUpdatedAt":"2025-09-03","address":{"street":"Rua A","city":"ACARAU","state":"CE","postalCode":"62580000"}},
 {"cnes":"3657973","name":"Nome na fonte","municipality":"230020","type":"2","address":{"city":"ACARAU","state":"CE"}}]')$$,'importa novo CNES e ignora existente');
select is(jsonb_array_length(public.import_cnes_units('93500000-0000-4000-8000-000000000099','93500000-0000-4000-8000-000000000010','230020','CE','2',array['3657973','0808792'],null)->'created'),1,'reenvio retorna resultado original, independente da ordem');
select is(jsonb_array_length(public.import_cnes_units('93500000-0000-4000-8000-000000000099','93500000-0000-4000-8000-000000000010','230020','CE','2',array['0808792','3657973'],null)->'skipped'),1,'resultado registra existente preservada');
select throws_ok($$select public.import_cnes_units('93500000-0000-4000-8000-000000000099','93500000-0000-4000-8000-000000000010','230020','CE','2',array['0808792'],null)$$,'22023',null,'operação não pode ser reutilizada para outra seleção');
select throws_ok($$select public.import_cnes_units('93500000-0000-4000-8000-000000000098','93500000-0000-4000-8000-000000000010','230020','SP','2',array['0808792'],null)$$,'22023',null,'UF incompatível bloqueada');
select throws_ok($$select public.import_cnes_units('93500000-0000-4000-8000-000000000097','93500000-0000-4000-8000-000000000010','230020','CE','2',array['0000001','0000002'],
 '[{"cnes":"0000001","name":"Não pode persistir","municipality":"230020","type":"2","address":{"city":"ACARAU","state":"CE"}},
 {"cnes":"0000002","name":"Outro município inválido","municipality":"230030","type":"2","address":{"city":"ACARAU","state":"CE"}}]')$$,'22023',null,'erro na segunda linha desfaz lote inteiro');
select set_config('request.jwt.claim.sub','93500000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.import_cnes_units('93500000-0000-4000-8000-000000000099','93500000-0000-4000-8000-000000000010','230020','CE','2',array['0808792','3657973'],null)$$,'42501',null,'reenvio não vaza resultado para perfil sem autorização');
reset role;
select is((select name from public.units where id='93500000-0000-4000-8000-000000000011'),'Nome local preservado','não sobrescreve nome existente');
select is((select count(*) from public.units where organization_id='93500000-0000-4000-8000-000000000010' and cnes='0808792'),1::bigint,'preserva zero à esquerda e evita duplicação');
select is((select count(*) from public.units where organization_id='93500000-0000-4000-8000-000000000010' and cnes in ('0000001','0000002')),0::bigint,'rollback não deixa cadastro parcial');
select is((select count(*) from public.audit_log where entity_type='units' and actor_id='93500000-0000-4000-8000-000000000001'),1::bigint,'auditoria de criação única');
select is((select count(*) from public.domain_events where aggregate_type='administracao' and actor_id='93500000-0000-4000-8000-000000000001' and payload->>'entityType'='units'),1::bigint,'outbox na transação');
select * from finish();
rollback;
