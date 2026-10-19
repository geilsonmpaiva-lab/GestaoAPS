-- Synthetic-only additive longitudinal registry. Existing functions and histories stay intact.
-- Version aligned with the applied Supabase migration.
create table app.epi_long_cases_v1 (
 id uuid primary key, organization_id uuid not null check(organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),
 unit_id uuid not null,team_id uuid not null,area text not null check(area in ('hanseniase','tuberculose')),
 initial jsonb not null check(jsonb_typeof(initial)='object'), source_case_id uuid unique references app.epi_cases_v1(id),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(organization_id,unit_id,team_id,area,id),
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id)
);
create index epi_long_cases_scope on app.epi_long_cases_v1(organization_id,unit_id,area,team_id,id);
create index epi_long_cases_actor on app.epi_long_cases_v1(created_by);
create table app.epi_long_visits_v1 (
 id uuid primary key,organization_id uuid not null,unit_id uuid not null,team_id uuid not null,area text not null,
 case_id uuid not null,competency text not null check(competency ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 version int not null check(version>0),status text not null check(status in ('DRAFT','SUBMITTED','REVIEWED','VALIDATED','CLOSED')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=16000),
 headers jsonb not null check(jsonb_typeof(headers)='object' and octet_length(headers::text)<=6000),
 updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id),
 unique(case_id,competency),foreign key(organization_id,unit_id,team_id,area,case_id) references app.epi_long_cases_v1(organization_id,unit_id,team_id,area,id)
);
create index epi_long_visits_month on app.epi_long_visits_v1(organization_id,unit_id,team_id,area,competency,id);
create index epi_long_visits_actor on app.epi_long_visits_v1(updated_by);
create table app.epi_long_events_v1 (
 id bigint generated always as identity primary key, organization_id uuid not null,unit_id uuid not null,
 actor_id uuid not null references auth.users(id),case_id uuid references app.epi_long_cases_v1(id),visit_id uuid references app.epi_long_visits_v1(id),
 action text not null,snapshot jsonb,reason text not null default '',device_id uuid,local_timestamp timestamptz,created_at timestamptz not null default now()
);
create index epi_long_events_case on app.epi_long_events_v1(case_id,id);
create index epi_long_events_visit on app.epi_long_events_v1(visit_id,id);
create index epi_long_events_actor on app.epi_long_events_v1(actor_id,id);
create table app.epi_long_receipts_v1 (
 operation_id uuid primary key,actor_id uuid not null references auth.users(id),request_hash text not null,response jsonb not null,created_at timestamptz not null default now()
);
create index epi_long_receipts_actor on app.epi_long_receipts_v1(actor_id);
do $$ declare t text; begin
 foreach t in array array['epi_long_cases_v1','epi_long_visits_v1','epi_long_events_v1','epi_long_receipts_v1'] loop
 execute format('alter table app.%I enable row level security',t);
 execute format('revoke all on app.%I from public,anon,authenticated',t);
 execute format('create policy rpc_only on app.%I for all to authenticated using(false) with check(false)',t);
 end loop;
 foreach t in array array['epi_long_cases_v1','epi_long_events_v1','epi_long_receipts_v1'] loop
 execute format('create trigger immutable before update or delete on app.%I for each row execute function app.reject_audit_mutation()',t);
 end loop;
end $$;
create trigger epi_long_month_freeze before insert or update on app.epi_long_visits_v1 for each row execute function app.epi_month_guard_v1();
create trigger epi_long_no_delete before delete on app.epi_long_visits_v1 for each row execute function app.reject_audit_mutation();

create function app.epi_long_payload_v1(area_key text,body jsonb,head jsonb) returns void language plpgsql set search_path='' as $$
declare allowed text[]; k text; v jsonb; date_keys text[]:=array['notificationDate','lastAttendance','assessmentDate','dischargeDate','treatmentChangedOn','closedOn','followUpDate','reportDate']; ds date;
begin
 allowed:=array['caseReference','name','notificationDate','sinan','classification','contacts','followUpDate']||case area_key
 when 'hanseniase' then array['notificationNumber','residenceCity','lastAttendance','examinedContacts','operationalClassification','disability','assessmentDate','dischargeType','dischargeDate']
 when 'tuberculose' then array['smear1','smear2','smear3','smear4','smear5','smear6','treatmentChangedOn','examinedContacts','status9','status12','closureStatus','closedOn','sputumCulture','otherCulture','hiv','histopathology','observedTreatment'] end;
 if allowed is null or body is null or head is null or jsonb_typeof(body)<>'object' or jsonb_typeof(head)<>'object' or coalesce(body->>'name','') not like '[SINTÉTICO]%' or octet_length(body::text)>16000 or octet_length(head::text)>6000 then raise exception 'Revise os campos sintéticos.' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(body) loop
 if not k=any(allowed) then raise exception 'Campo desconhecido.' using errcode='22023'; end if;
 if k in ('examinedContacts','contacts') then
 if jsonb_typeof(v)<>'number' or v::text !~ '^\d+$' or v::text::numeric>1000000 then raise exception 'Quantidade inteira inválida.' using errcode='22023'; end if;
 elsif jsonb_typeof(v)<>'string' or length(v#>>'{}')>1000 then raise exception 'Texto inválido.' using errcode='22023';
 end if;
 if k=any(date_keys) then if v#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida.' using errcode='22023'; end if; ds:=(v#>>'{}')::date; end if;
 end loop;
 for k,v in select * from jsonb_each(head) loop
 if not k=any(case when area_key='hanseniase' then array['reportDate','filledBy','regional','municipality','technicalOwner'] else array['reportDate','filledBy'] end) or jsonb_typeof(v)<>'string' or length(v#>>'{}')>1000 then raise exception 'Cabeçalho inválido.' using errcode='22023'; end if;
 if k='reportDate' then if v#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida.' using errcode='22023'; end if; ds:=(v#>>'{}')::date; end if;
 end loop;
end $$;
revoke all on function app.epi_long_payload_v1(text,jsonb,jsonb) from public,anon,authenticated;

-- Open reports project old entries plus new visits without copying or changing old rows.
-- Explicit linkage suppresses only that same source entry in that same month.
create function app.epi_long_report_v1(req jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare answer jsonb; rows jsonb:='[]'; row_data jsonb; cases jsonb; counts jsonb; org uuid:=(req->>'organizationId')::uuid; unit uuid;
 area_key text:=req->>'area'; month_key text:=req->>'month'; nominal boolean:=coalesce((req->>'nominal')::boolean,false); head jsonb; header_count int;
begin
 if area_key not in ('hanseniase','tuberculose') or area_key is null then raise exception 'Área longitudinal inválida.' using errcode='22023'; end if;
 answer:=app.epi_month_report_v1(req);
 for row_data in select * from jsonb_array_elements(answer->'teams') loop
 unit:=(row_data->>'unitId')::uuid;
 if row_data->>'status'<>'CLOSED' then
 select coalesce(jsonb_agg(q.item order by q.id),'[]'::jsonb) into cases from (
 select c.id,jsonb_build_object('id',c.id,'caseId',c.id,'version',c.version,'status',c.status,'payload',c.payload,'origin','legacy') item
 from app.epi_cases_v1 c where (c.organization_id,c.unit_id,c.team_id,c.area,c.competency)=(org,unit,(row_data->>'teamId')::uuid,area_key,month_key)
 and not exists(select 1 from app.epi_long_visits_v1 v join app.epi_long_cases_v1 lc on lc.id=v.case_id where lc.source_case_id=c.id and v.competency=c.competency)
 union all
 select v.id,jsonb_build_object('id',v.id,'caseId',v.case_id,'version',v.version,'status',v.status,'payload',v.payload,'headers',v.headers,'origin','longitudinal')
 from app.epi_long_visits_v1 v where (v.organization_id,v.unit_id,v.team_id,v.area,v.competency)=(org,unit,(row_data->>'teamId')::uuid,area_key,month_key)
 ) q;
 select count(distinct v.headers),min(v.headers::text)::jsonb into header_count,head from app.epi_long_visits_v1 v where (v.organization_id,v.unit_id,v.team_id,v.area,v.competency)=(org,unit,(row_data->>'teamId')::uuid,area_key,month_key);
 select coalesce(jsonb_object_agg(q.status,q.n),'{}') into counts from (select x->>'status' status,count(*) n from jsonb_array_elements(cases) x group by x->>'status') q;
 row_data:=row_data||jsonb_build_object('records',cases,'total',jsonb_array_length(cases),'pending',(select count(*) from jsonb_array_elements(cases) x where x->>'status' not in ('VALIDATED','CLOSED')),'counts',counts,'headers',case when header_count=1 then head else '{}'::jsonb end,'headerConflict',header_count>1,'longitudinalVersion',1);
 end if;
 if not nominal then row_data:=row_data-'records'-'headers'-'reason'; end if;
 rows:=rows||jsonb_build_array(row_data);
 end loop;
 if nominal and (select sum((x->>'total')::int) from jsonb_array_elements(rows) x)>10000 then raise exception 'Limite nominal excedido.' using errcode='22023'; end if;
 return answer||jsonb_build_object('teams',rows,'total',(select sum((x->>'total')::int) from jsonb_array_elements(rows) x));
end $$;
revoke all on function app.epi_long_report_v1(jsonb) from public,anon,authenticated;

-- An old client cannot freeze a partial snapshot omitting the new visits.
create function app.epi_long_snapshot_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from app.epi_long_visits_v1 v where (v.organization_id,v.unit_id,v.team_id,v.area,v.competency)=(new.organization_id,new.unit_id,new.team_id,new.area,new.competency)) and new.snapshot->'longitudinalVersion' is distinct from '1'::jsonb then
 raise exception 'Use o fechamento longitudinal para incluir todos os acompanhamentos.' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function app.epi_long_snapshot_guard_v1() from public,anon,authenticated;
create trigger epi_long_snapshot_complete before insert on app.epi_month_snapshots_v1 for each row execute function app.epi_long_snapshot_guard_v1();

create function app.epi_long_command_v1(req jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=(req->>'organizationId')::uuid; unit uuid:=(req->>'unitId')::uuid; area_key text:=req->>'area'; a text:=req->>'action'; month_key text:=req->>'month'; team uuid; cid uuid; entity uuid; source_id uuid; operation uuid; expected int; page_no int;
 c app.epi_long_cases_v1; v app.epi_long_visits_v1; source app.epi_cases_v1; receipt app.epi_long_receipts_v1; m app.epi_months_v1;
 teams jsonb; chosen jsonb; sources jsonb; registry jsonb; visits jsonb; revisions jsonb; selected_visit jsonb; answer jsonb; row_data jsonb; request_hash text; new_state text; reason text:=trim(coalesce(req->>'reason','')); total bigint; source_total bigint;
begin
 if auth.uid() is null or org is distinct from '362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid or unit is null then raise exception 'Homologação não autorizada.' using errcode='42501'; end if;
 if area_key is null or area_key not in ('hanseniase','tuberculose') or month_key is null or month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or octet_length(req::text)>26000 then raise exception 'Recorte inválido.' using errcode='22023'; end if;
 if a in ('report','summary') then
 answer:=app.epi_long_report_v1(req);
 insert into app.epi_long_events_v1(organization_id,unit_id,actor_id,action,reason) values(org,unit,auth.uid(),case when a='report' then 'EXPORT' else 'SUMMARY' end,jsonb_build_object('area',area_key,'month',month_key,'scope',req->'scope','nominal',req->'nominal','revision',req->'revision')::text);
 return answer;
 end if;
 if a='load' then
 team:=nullif(req->>'team','')::uuid;cid:=nullif(req->>'case','')::uuid;source_id:=nullif(req->>'source','')::uuid;page_no:=coalesce((req->>'page')::int,1);
 if page_no not between 1 and 100000 then raise exception 'Página inválida.' using errcode='22023'; end if;
 teams:=app.epi_command_v1(req||jsonb_build_object('action','load')-'case'-'source')->'teams';
 if team is not null and not app.epi_access_v1(org,unit,team,area_key,'summary') then raise exception 'Equipe não autorizada.' using errcode='42501'; end if;
 select count(*) into total from app.epi_long_cases_v1 x where x.organization_id=org and x.unit_id=unit and x.area=area_key and (team is null or x.team_id=team) and app.epi_access_v1(org,unit,x.team_id,area_key,'view');
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into registry from (select x.* from app.epi_long_cases_v1 x where x.organization_id=org and x.unit_id=unit and x.area=area_key and (team is null or x.team_id=team) and app.epi_access_v1(org,unit,x.team_id,area_key,'view') order by x.created_at desc,x.id limit 25 offset (page_no-1)*25) q;
 select count(*) into source_total from app.epi_cases_v1 x where x.organization_id=org and x.unit_id=unit and x.area=area_key and (team is null or x.team_id=team) and app.epi_access_v1(org,unit,x.team_id,area_key,'view') and not exists(select 1 from app.epi_long_cases_v1 lc where lc.source_case_id=x.id);
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),'[]') into sources from (select x.id,x.team_id,x.competency,x.payload,x.created_at from app.epi_cases_v1 x where x.organization_id=org and x.unit_id=unit and x.area=area_key and (team is null or x.team_id=team) and app.epi_access_v1(org,unit,x.team_id,area_key,'view') and not exists(select 1 from app.epi_long_cases_v1 lc where lc.source_case_id=x.id) order by x.created_at desc,x.id limit 25 offset(page_no-1)*25) q;
 if cid is not null then
 select * into c from app.epi_long_cases_v1 where id=cid and organization_id=org and unit_id=unit and area=area_key and (team is null or team_id=team);
 if not found or not app.epi_access_v1(org,unit,c.team_id,area_key,'view') then raise exception 'Caso não autorizado.' using errcode='42501'; end if;
 chosen:=to_jsonb(c);
 select to_jsonb(x) into selected_visit from app.epi_long_visits_v1 x where x.case_id=cid and x.competency=month_key;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.competency,x.version),'[]') into visits from app.epi_long_visits_v1 x where x.case_id=cid;
 select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'createdAt',e.created_at,'reason',e.reason,'snapshot',e.snapshot) order by e.id),'[]') into revisions from app.epi_long_events_v1 e where e.case_id=cid and e.snapshot is not null;
 end if;
 if source_id is not null then
 select * into source from app.epi_cases_v1 where id=source_id and organization_id=org and unit_id=unit and area=area_key and (team is null or team_id=team);
 if not found or not app.epi_access_v1(org,unit,source.team_id,area_key,'view') then raise exception 'Origem não autorizada.' using errcode='42501'; end if;
 end if;
 insert into app.epi_long_events_v1(organization_id,unit_id,actor_id,case_id,action) values(org,unit,auth.uid(),cid,'READ');
 return jsonb_build_object('teams',teams,'municipal',app.epi_access_v1(org,null,null,area_key,'summary'),'cases',registry,'total',total,'sources',sources,'sourceTotal',source_total,'selected',chosen,'visit',selected_visit,'history',coalesce(visits,'[]'),'revisions',coalesce(revisions,'[]'),'source',case when source.id is not null then to_jsonb(source) else null end);
 end if;
 team:=(req->>'teamId')::uuid;
 if a is null or a not in ('save','submit','review','validate','close','return','reopen','month-close','month-reopen') or not app.epi_access_v1(org,unit,team,area_key,case when a like 'month-%' then 'close' else a end) then raise exception 'Comando não autorizado.' using errcode='42501'; end if;
 operation:=(req->>'operationId')::uuid;expected:=(req->>'expectedVersion')::int;cid:=(req->>'caseId')::uuid;entity:=(req->>'entityId')::uuid;source_id:=nullif(req->>'sourceId','')::uuid;
 if req->'synthetic' is distinct from 'true'::jsonb or operation is null or expected is null or expected<0 or cid is null or entity is null or (req->>'deviceId')::uuid is null or (req->>'localTimestamp')::timestamptz is null or length(reason)>500 then raise exception 'Envelope inválido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('epi-long-operation:'||operation::text,0));
 request_hash:=encode(extensions.digest(req::text,'sha256'),'hex');
 select * into receipt from app.epi_long_receipts_v1 where operation_id=operation;
 if found then
 if receipt.actor_id<>auth.uid() or receipt.request_hash<>request_hash then raise exception 'Operação reutilizada.' using errcode='22023'; end if;
 return receipt.response;
 end if;
 perform app.epi_month_lock_v1(org,unit,team,area_key,month_key);
 if a like 'month-%' then
 answer:=app.epi_long_report_v1(req||jsonb_build_object('scope','team','team',team,'nominal',true)-'revision');row_data:=answer->'teams'->0;
 select * into m from app.epi_months_v1 where (organization_id,unit_id,team_id,area,competency)=(org,unit,team,area_key,month_key);
 if expected<>coalesce(m.version,0) then raise exception 'Versão mensal alterada.' using errcode='PT409'; end if;
 if a='month-close' then
 if m.status='CLOSED' or (row_data->>'pending')::int>0 or row_data->'headerConflict'='true'::jsonb then raise exception 'Revise pendências e cabeçalhos antes de fechar.' using errcode='22023'; end if;
 if (row_data->>'total')::int=0 and (req->'noActivity' is distinct from 'true'::jsonb or length(reason)<10) then raise exception 'Ausência exige declaração explícita e justificativa.' using errcode='22023'; end if;
 insert into app.epi_months_v1(organization_id,unit_id,team_id,area,competency,version,revision,status) values(org,unit,team,area_key,month_key,1,1,'CLOSED') on conflict(organization_id,unit_id,team_id,area,competency) do update set status='CLOSED',version=app.epi_months_v1.version+1,revision=app.epi_months_v1.revision+1 returning * into m;
 row_data:=(row_data-'revisions'-'canClose'-'currentStatus')||jsonb_build_object('status','CLOSED','version',m.version,'revision',m.revision,'closedAt',now(),'closedBy',auth.uid(),'noActivity',(row_data->>'total')::int=0,'reason',reason,'longitudinalVersion',1);
 insert into app.epi_month_snapshots_v1(organization_id,unit_id,team_id,area,competency,revision,snapshot,closed_by) values(org,unit,team,area_key,month_key,m.revision,row_data,auth.uid());
 else
 if m.status is distinct from 'CLOSED' or length(reason)<10 then raise exception 'Reabertura exige justificativa.' using errcode='22023'; end if;
 update app.epi_months_v1 set status='OPEN',version=version+1 where (organization_id,unit_id,team_id,area,competency)=(org,unit,team,area_key,month_key) returning * into m;
 end if;
 answer:=jsonb_build_object('status',m.status,'version',m.version,'revision',m.revision);
 else
 if exists(select 1 from app.epi_months_v1 where (organization_id,unit_id,team_id,area,competency)=(org,unit,team,area_key,month_key) and status='CLOSED') then raise exception 'Competência fechada. Solicite reabertura mensal.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('epi-long-case:'||cid::text,0));
 select * into c from app.epi_long_cases_v1 where id=cid;
 if found and (c.organization_id,c.unit_id,c.team_id,c.area) is distinct from (org,unit,team,area_key) then raise exception 'Caso fora do escopo.' using errcode='42501'; end if;
 if c.id is null then
 if a<>'save' or expected<>0 then raise exception 'Salve o caso primeiro.' using errcode='22023'; end if;
 perform app.epi_long_payload_v1(area_key,req->'payload',req->'headers');
 if source_id is not null then
 perform pg_advisory_xact_lock(hashtextextended('epi-long-source:'||source_id::text,0));
 select * into source from app.epi_cases_v1 where id=source_id and (organization_id,unit_id,team_id,area)=(org,unit,team,area_key);
 if not found or not app.epi_access_v1(org,unit,team,area_key,'view') then raise exception 'Origem fora do escopo.' using errcode='42501'; end if;
 if exists(select 1 from app.epi_long_cases_v1 where source_case_id=source_id) then raise exception 'A origem já possui um caso longitudinal. Abra esse caso.' using errcode='PT409'; end if;
 end if;
 insert into app.epi_long_cases_v1(id,organization_id,unit_id,team_id,area,initial,source_case_id,created_by) values(cid,org,unit,team,area_key,req->'payload',source_id,auth.uid()) returning * into c;
 elsif source_id is not null and source_id is distinct from c.source_case_id then raise exception 'Origem imutável.' using errcode='22023'; end if;
 select * into v from app.epi_long_visits_v1 where case_id=cid and competency=month_key for update;
 if exists(select 1 from app.epi_long_visits_v1 x where x.id=entity and (x.case_id<>cid or x.competency<>month_key)) then raise exception 'Identificador de outro caso ou competência não autorizado.' using errcode='42501'; end if;
 if v.id is not null and v.id<>entity then raise exception 'Já existe acompanhamento deste caso na competência.' using errcode='PT409'; end if;
 if coalesce(v.version,0)<>expected then raise exception 'Acompanhamento alterado. Preserve as edições e atualize a versão.' using errcode='PT409'; end if;
 if a='save' then
 if v.id is not null and v.status<>'DRAFT' then raise exception 'Devolva ou reabra antes de editar.' using errcode='22023'; end if;
 perform app.epi_long_payload_v1(area_key,req->'payload',req->'headers');
 insert into app.epi_long_visits_v1(id,organization_id,unit_id,team_id,area,case_id,competency,version,status,payload,headers,updated_by) values(entity,org,unit,team,area_key,cid,month_key,1,'DRAFT',req->'payload',req->'headers',auth.uid())
 on conflict(id) do update set payload=excluded.payload,headers=excluded.headers,version=app.epi_long_visits_v1.version+1,updated_at=now(),updated_by=auth.uid() returning * into v;
 else
 new_state:=case when a='submit' and v.status='DRAFT' then 'SUBMITTED' when a='review' and v.status='SUBMITTED' then 'REVIEWED' when a='validate' and v.status='REVIEWED' then 'VALIDATED' when a='close' and v.status='VALIDATED' then 'CLOSED' when a='return' and v.status in ('SUBMITTED','REVIEWED','VALIDATED') then 'DRAFT' when a='reopen' and v.status='CLOSED' then 'DRAFT' end;
 if new_state is null or a in ('return','reopen') and length(reason)<10 then raise exception 'Transição ou justificativa inválida.' using errcode='22023'; end if;
 if a='submit' and (nullif(v.payload->>'notificationDate','') is null or nullif(v.payload->>'followUpDate','') is null) then raise exception 'Informe as datas da notificação e do acompanhamento.' using errcode='22023'; end if;
 update app.epi_long_visits_v1 set status=new_state,version=version+1,updated_at=now(),updated_by=auth.uid() where id=entity returning * into v;
 end if;
 answer:=to_jsonb(v);
 end if;
 insert into app.epi_long_events_v1(organization_id,unit_id,actor_id,case_id,visit_id,action,snapshot,reason,device_id,local_timestamp) values(org,unit,auth.uid(),case when a like 'month-%' then null else cid end,case when a like 'month-%' then null else entity end,a,answer,reason,(req->>'deviceId')::uuid,(req->>'localTimestamp')::timestamptz);
 insert into app.epi_long_receipts_v1(operation_id,actor_id,request_hash,response) values(operation,auth.uid(),request_hash,answer);
 return answer;
end $$;
revoke all on function app.epi_long_command_v1(jsonb) from public,anon;
grant execute on function app.epi_long_command_v1(jsonb) to authenticated;
create function public.staging_epidemiology_longitudinal_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app.epi_long_command_v1(p_request); $$;
revoke all on function public.staging_epidemiology_longitudinal_v1(jsonb) from public,anon;
grant execute on function public.staging_epidemiology_longitudinal_v1(jsonb) to authenticated;
