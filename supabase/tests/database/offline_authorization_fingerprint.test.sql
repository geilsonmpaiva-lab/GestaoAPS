-- Own-actor digest only. Disposable fixtures and all changes roll back.
begin;
select no_plan();
insert into auth.users(id,email) values
 ('97000000-0000-4000-8000-000000000001','offline-fingerprint@example.invalid'),
 ('97000000-0000-4000-8000-000000000002','offline-unrelated@example.invalid');
update public.profiles set status='ACTIVE' where id::text like '97000000%';
insert into public.organizations(id,name) values('362db1a9-bfdd-4334-9436-46b1c0117eab','[HOMOLOGAÇÃO] Offline SQL') on conflict do nothing;
insert into public.units(id,organization_id,name) values
 ('97000000-0000-4000-8000-000000000011','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS A'),
 ('97000000-0000-4000-8000-000000000012','362db1a9-bfdd-4334-9436-46b1c0117eab','[SINTÉTICO] UBS B');
insert into public.esf_teams(id,organization_id,unit_id,name,code) values
 ('97000000-0000-4000-8000-000000000021','362db1a9-bfdd-4334-9436-46b1c0117eab','97000000-0000-4000-8000-000000000011','[SINTÉTICO] Equipe A','FINGERPRINT-A'),
 ('97000000-0000-4000-8000-000000000022','362db1a9-bfdd-4334-9436-46b1c0117eab','97000000-0000-4000-8000-000000000012','[SINTÉTICO] Equipe B','FINGERPRINT-B');
insert into public.memberships(id,user_id,organization_id,unit_id,role,domains,operations) values
 ('97000000-0000-4000-8000-000000000101','97000000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab','97000000-0000-4000-8000-000000000011','EXECUTOR',array['vigilancia.hanseniase'],array['visualizar']),
 ('97000000-0000-4000-8000-000000000102','97000000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab','97000000-0000-4000-8000-000000000011','LEITOR',array['protocolos'],array['visualizar']);
insert into public.memberships(id,user_id,organization_id,unit_id,role,domains,operations,starts_at) values
 ('97000000-0000-4000-8000-000000000103','97000000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab','97000000-0000-4000-8000-000000000012','EXECUTOR',array['protocolos'],array['visualizar'],now()+interval '1 day');
insert into public.esf_team_members(id,organization_id,unit_id,team_id,user_id) values
 ('97000000-0000-4000-8000-000000000301','362db1a9-bfdd-4334-9436-46b1c0117eab','97000000-0000-4000-8000-000000000011','97000000-0000-4000-8000-000000000021','97000000-0000-4000-8000-000000000001');
insert into app.epi_grants_v1(id,user_id,organization_id,unit_id,team_id,areas,nominal) values
 ('97000000-0000-4000-8000-000000000201','97000000-0000-4000-8000-000000000001','362db1a9-bfdd-4334-9436-46b1c0117eab','97000000-0000-4000-8000-000000000011','97000000-0000-4000-8000-000000000021',array['hanseniase'],true),
 ('97000000-0000-4000-8000-000000000202','97000000-0000-4000-8000-000000000002','362db1a9-bfdd-4334-9436-46b1c0117eab','97000000-0000-4000-8000-000000000011',null,array['hanseniase'],false);
create temp table fingerprint_data(key text primary key,value jsonb);grant all on fingerprint_data to authenticated;
create function pg_temp.own_fingerprint() returns jsonb language sql as $$select public.staging_own_offline_authorization_v1('362db1a9-bfdd-4334-9436-46b1c0117eab');$$;
set local role anon;
select throws_ok($$select pg_temp.own_fingerprint()$$,'42501',null,'anonymous callers cannot read fingerprints');
set local role authenticated;
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.staging_own_offline_authorization_v1('97000000-0000-4000-8000-000000000099')$$,'42501',null,'other organizations are excluded');
insert into fingerprint_data values('baseline',pg_temp.own_fingerprint());
select is(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'unchanged authorization returns a stable digest');
select is(length(pg_temp.own_fingerprint()->>'digest'),64,'SHA256 digest has fixed length');
select is(pg_temp.own_fingerprint()->>'userId','97000000-0000-4000-8000-000000000001','actor is determined by JWT, never requested target');
select ok(not exists(select 1 from jsonb_object_keys(pg_temp.own_fingerprint()) k where k not in ('version','userId','organizationId','digest')),'only own scope and digest leave the RPC');
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000002',true);
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'another actor receives only its own digest');
select set_config('request.jwt.claim.sub','97000000-0000-4000-8000-000000000001',true);
reset role;
update app.epi_grants_v1 set enabled=false where id='97000000-0000-4000-8000-000000000202';
select is(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'unrelated actor grants do not change this digest');
update public.units set name='[SINTÉTICO] Nome atualizado' where id='97000000-0000-4000-8000-000000000011';
select is(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'names are not part of authorization metadata');
update app.epi_grants_v1 set nominal=false where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'nominal revocation changes digest without a membership edit');
update app.epi_grants_v1 set nominal=true,enabled=false where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'disabled grant changes digest');
update app.epi_grants_v1 set enabled=true,can_write=true where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'write grant changes digest');
update app.epi_grants_v1 set can_write=false,can_review=true where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'review grant changes digest');
update app.epi_grants_v1 set can_review=false,can_validate=true where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'validation grant changes digest');
update app.epi_grants_v1 set can_validate=false,can_close=true where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'close grant changes digest');
update app.epi_grants_v1 set can_close=false,areas=array['dengue'] where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'area assignment changes digest');
update app.epi_grants_v1 set areas=array['hanseniase'],unit_id='97000000-0000-4000-8000-000000000012',team_id='97000000-0000-4000-8000-000000000022' where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'unit and team scope changes digest');
update app.epi_grants_v1 set municipal=true,unit_id=null,team_id=null where id='97000000-0000-4000-8000-000000000201';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'municipal scope changes digest');
update app.epi_grants_v1 set municipal=false,unit_id='97000000-0000-4000-8000-000000000011',team_id='97000000-0000-4000-8000-000000000021' where id='97000000-0000-4000-8000-000000000201';
select is(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'restoring exactly the same grant metadata restores digest');
update public.esf_teams set status='INACTIVE' where id='97000000-0000-4000-8000-000000000021';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'team inactivity changes digest');
update public.esf_teams set status='ACTIVE' where id='97000000-0000-4000-8000-000000000021';
update public.units set status='INACTIVE' where id='97000000-0000-4000-8000-000000000011';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'UBS inactivity changes digest');
update public.units set status='ACTIVE' where id='97000000-0000-4000-8000-000000000011';
update public.esf_team_members set deleted_at=now() where id='97000000-0000-4000-8000-000000000301';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'removed team participation changes digest');
update public.esf_team_members set deleted_at=null where id='97000000-0000-4000-8000-000000000301';
update public.memberships set starts_at=now() where id='97000000-0000-4000-8000-000000000103';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'membership activation and startsAt are included');
update public.memberships set starts_at=now()+interval '1 day' where id='97000000-0000-4000-8000-000000000103';
update public.memberships set ends_at=now()+interval '1 day' where id='97000000-0000-4000-8000-000000000101';
select isnt(pg_temp.own_fingerprint(),(select value from fingerprint_data where key='baseline'),'membership endsAt is included even while still active');
update public.memberships set ends_at=now() where id='97000000-0000-4000-8000-000000000101';
set local role authenticated;
select throws_ok($$select pg_temp.own_fingerprint()$$,'42501',null,'no active membership cannot renew a vault');
reset role;
select ok(not has_function_privilege('anon','public.staging_own_offline_authorization_v1(uuid)','execute'),'anonymous execution is revoked');
select * from finish();
rollback;
