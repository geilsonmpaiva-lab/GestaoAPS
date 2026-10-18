-- Local only. Every fixture and command is rolled back.
begin;
select no_plan();
insert into auth.users(id,email) values
('94800000-0000-4000-8000-000000000001','esf-map-admin@example.invalid'),
('94800000-0000-4000-8000-000000000002','esf-map-reader@example.invalid');
update public.profiles set status='ACTIVE' where id in ('94800000-0000-4000-8000-000000000001','94800000-0000-4000-8000-000000000002');
insert into public.organizations(id,name) values('362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] ESF SQL local') on conflict do nothing;
insert into public.units(id,organization_id,name) values
('94800000-0000-4000-8000-000000000011','362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] ESF A'),
('94800000-0000-4000-8000-000000000012','362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] ESF B');
insert into public.esf_teams(id,organization_id,unit_id,name,code) values
('94800000-0000-4000-8000-000000000021','362db1a9-bfdd-4334-9436-46b1c0117eab','94800000-0000-4000-8000-000000000011','Equipe SQL A','ESF-MAP-A'),
('94800000-0000-4000-8000-000000000022','362db1a9-bfdd-4334-9436-46b1c0117eab','94800000-0000-4000-8000-000000000012','Equipe SQL B','ESF-MAP-B');
insert into public.memberships(user_id,organization_id,unit_id,role,domains,operations) values
('94800000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab','94800000-0000-4000-8000-000000000011','GERENTE_UBS',array['*'],array['visualizar','criar','editar','aprovar','encerrar','reabrir','exportar']),
('94800000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab','94800000-0000-4000-8000-000000000012','LEITOR',array['*'],array['visualizar']);
create temp table map_test(key text primary key,req jsonb);
grant all on map_test to authenticated;
create function pg_temp.map_req(form text,body jsonb default '{"headers":{},"sections":{"records":[]}}') returns jsonb language sql as $$
 select jsonb_build_object('action','save','organizationId','362db1a9-bfdd-4334-9436-46b1c0117eab','unitId','94800000-0000-4000-8000-000000000011','teamId','94800000-0000-4000-8000-000000000021','templateId',form,'competency','2028-01',
 'entityId',gen_random_uuid(),'expectedVersion',0,'operationId',gen_random_uuid(),'deviceId',gen_random_uuid(),'localTimestamp',now(),'synthetic',true,'payload',body);
$$;
select set_config('request.jwt.claim.sub','94800000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into map_test values('base',pg_temp.map_req('medicamentos','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000031","values":{"itemId":"[SINTÉTICO] Item SQL","previousBalance":10,"pharmacyEntry":5,"otherEntry":0,"dispensed":2,"transferred":0,"losses":0,"served":2,"unserved":1}}]}}'));
select lives_ok($$select public.staging_esf_maps_v1(req) from map_test where key='base'$$,'manager saves only in synthetic organization');
select lives_ok($$select public.staging_esf_maps_v1(req) from map_test where key='base'$$,'exact retry returns receipt');
select is((select public.staging_esf_maps_v1(req)->>'version' from map_test where key='base'),'1','retry did not increment version');
select throws_ok($$select public.staging_esf_maps_v1(req || '{"synthetic":false}') from map_test where key='base'$$,'22023',null,'synthetic acknowledgement mandatory');
select throws_ok($$select public.staging_esf_maps_v1(jsonb_set(req,'{organizationId}','"94800000-0000-4000-8000-000000000099"')) from map_test where key='base'$$,'42501',null,'other organizations forbidden before replay');
select throws_ok($$select public.staging_esf_maps_v1(jsonb_set(req,'{unitId}','"94800000-0000-4000-8000-000000000012"')) from map_test where key='base'$$,'42501',null,'cross-unit request forbidden');
select throws_ok($$select * from app.esf_maps_v1$$,'42501',null,'direct table reads denied');
select throws_ok($$select app.esf_map_spec_v1('medicamentos')$$,'42501',null,'private schema helper not callable');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('medicamentos','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000032","values":{"currentBalance":99}}]}}'))$$,'22023',null,'client cannot forge calculated balance');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('hanseniase','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000032","values":{"name":"Real name forbidden"}}]}}'))$$,'22023',null,'nominal fields require synthetic prefix');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('testes-rapidos','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000032","values":{"entry":1.5}}]}}'))$$,'22023',null,'rapid-test quantities are integer tests, not boxes');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('materiais','{"headers":{},"sections":{"headers":[]}}'))$$,'22023',null,'section cannot shadow validated headers');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('materiais','{"headers":{"filledBy":{}},"sections":{"records":[]}}'))$$,'22023',null,'nested arbitrary data rejected');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('obitos','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000032","values":{"birthDate":"2000-01-01","age":28,"ageUnit":"Anos"}}]}}'))$$,'22023',null,'birth date and alternate age mutually exclusive');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('nascidos-vivos','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000032","values":{"weight":3000}}]}}'))$$,'22023',null,'weight requires explicit unit');
select lives_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('materiais','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000032","values":{"entry":0,"exit":"Não se aplica"}}]}}'))$$,'zero and not applicable remain distinct');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('materiais') || '{"action":"submit","expectedVersion":1}')$$,'22023',null,'empty map cannot be submitted through direct RPC');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('materiais','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000032","values":{"entry":0}}]}}') || '{"action":"submit","expectedVersion":1}')$$,'22023',null,'identity mandatory even through direct RPC');
select lives_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('obitos','{"headers":{},"sections":{"records":[{"id":"94800000-0000-4000-8000-000000000032","values":{"name":"[SINTÉTICO] Pessoa adulta","birthDate":"1950-01-01","deathDate":"2028-01-01"}}]}}'))$$,'adult birth dates are supported');
insert into map_test values('v2',(select req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',1) from map_test where key='base'));
select lives_ok($$select public.staging_esf_maps_v1(req) from map_test where key='v2'$$,'update confirms optimistic version');
select throws_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('operationId',gen_random_uuid())) from map_test where key='base'$$,'PT409',null,'stale version conflicts without overwriting');
insert into map_test values('submit',(select req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',2,'action','submit') from map_test where key='base'));
select is((select public.staging_esf_maps_v1(req)->>'status' from map_test where key='submit'),'IN_REVIEW','explicit submit');
select throws_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',3)) from map_test where key='base'$$,'22023',null,'editing is blocked during review');
select is((select public.staging_esf_maps_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'action','close','expectedVersion',3))->>'status' from map_test where key='base'),'CLOSED','explicit synthetic close');
select throws_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'action','reopen','expectedVersion',4)) from map_test where key='base'$$,'22023',null,'reopen requires justification');
select is((select public.staging_esf_maps_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'action','reopen','expectedVersion',4,'reason','Revisão sintética justificada'))->>'revision' from map_test where key='base'),'2','reopen increments revision');
select lives_ok($$select public.staging_esf_maps_v1(req || '{"action":"export"}') from map_test where key='base'$$,'authorized export is audited');
insert into map_test values('insulin',pg_temp.map_req('insulinas','{"headers":{},"sections":{"deliveries":[],"supplies":[],"insulinStock":[]}}'));
select lives_ok($$select public.staging_esf_maps_v1(req) from map_test where key='insulin'$$,'empty insulin draft can be saved before uploading synthetic proof');
select throws_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('operationId',gen_random_uuid(),'expectedVersion',1,'payload',jsonb_build_object('headers','{}'::jsonb,'sections',jsonb_build_object('deliveries',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'values',jsonb_build_object('patientName','[SINTÉTICO] SQL','receiptId',gen_random_uuid()))))))) from map_test where key='insulin'$$,'42501',null,'receipt must belong to current map');
reset role;
insert into storage.objects(bucket_id,name,owner_id,metadata) select 'esf-synthetic-receipts', '362db1a9-bfdd-4334-9436-46b1c0117eab/94800000-0000-4000-8000-000000000011/'||(req->>'entityId')||'/94800000-0000-4000-8000-000000000041','94800000-0000-4000-8000-000000000001','{"size":20,"mimetype":"application/pdf"}' from map_test where key='insulin';
set local role authenticated;
select lives_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('action','file-register','expectedVersion',1,'fileId','94800000-0000-4000-8000-000000000041','byteSize',20,'contentType','application/pdf','sha256',repeat('a',64))) from map_test where key='insulin'$$,'uploaded synthetic proof metadata registered');
select lives_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('action','file-register','expectedVersion',1,'fileId','94800000-0000-4000-8000-000000000041','byteSize',20,'contentType','application/pdf','sha256',repeat('a',64))) from map_test where key='insulin'$$,'same proof registration is idempotent');
select throws_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('action','file-register','expectedVersion',1,'fileId','94800000-0000-4000-8000-000000000041','byteSize',20,'contentType','application/pdf','sha256',repeat('b',64))) from map_test where key='insulin'$$,'22023',null,'proof hash cannot be changed');
select lives_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('action','file-read','fileId','94800000-0000-4000-8000-000000000041')) from map_test where key='insulin'$$,'proof download metadata is scoped and audited');
reset role;
select is((select count(*)::integer from app.esf_map_receipts_v1 where operation_id=(select (req->>'operationId')::uuid from map_test where key='base')),1,'one receipt for exact replay');
select is((select count(*)::integer from app.esf_map_revisions_v1 where map_id=(select (req->>'entityId')::uuid from map_test where key='base')),5,'all versions retained, including closure before reopen');
select is((select status from app.esf_map_revisions_v1 where map_id=(select (req->>'entityId')::uuid from map_test where key='base') and version=4),'CLOSED','closed historical version not changed');
select throws_ok($$update app.esf_map_revisions_v1 set status='OPEN'$$,'55000',null,'snapshots append-only');
select throws_ok($$delete from app.esf_map_events_v1$$,'55000',null,'access audit append-only');
select set_config('request.jwt.claim.sub','94800000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.staging_esf_maps_v1(req || '{"action":"read"}') from map_test where key='base'$$,'42501',null,'reader B cannot read unit A');
select throws_ok($$select public.staging_esf_maps_v1(req) from map_test where key='base'$$,'42501',null,'another actor cannot replay manager receipt');
select throws_ok($$select public.staging_esf_maps_v1(req || jsonb_build_object('action','file-read','fileId','94800000-0000-4000-8000-000000000041')) from map_test where key='insulin'$$,'42501',null,'reader B cannot read unit A proofs');
select is((select count(*)::integer from storage.objects where bucket_id='esf-synthetic-receipts'),0,'Storage RLS also blocks direct cross-unit access');
select throws_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('hanseniase') || '{"unitId":"94800000-0000-4000-8000-000000000012","teamId":"94800000-0000-4000-8000-000000000022","action":"list"}')$$,'42501',null,'reader has no nominal access even within B');
select lives_ok($$select public.staging_esf_maps_v1(pg_temp.map_req('materiais') || '{"unitId":"94800000-0000-4000-8000-000000000012","teamId":"94800000-0000-4000-8000-000000000022","action":"list"}')$$,'reader may list authorized non-nominal B maps');
reset role;
select set_config('request.jwt.claim.sub','94800000-0000-4000-8000-000000000001',true);
update public.memberships set ends_at=now() where user_id='94800000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.staging_esf_maps_v1(req) from map_test where key='base'$$,'42501',null,'revoked membership denied before idempotent replay');
reset role;
select * from finish();
rollback;
