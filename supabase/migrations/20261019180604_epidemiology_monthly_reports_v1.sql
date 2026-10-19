-- Additive synthetic-only monthly revisions. Existing RPCs and records are preserved.
create table app.epi_months_v1 (
 organization_id uuid not null check(organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),
 unit_id uuid not null, team_id uuid not null, area text not null, competency text not null,
 version int not null check(version>0), revision int not null check(revision>0),
 status text not null check(status in ('OPEN','CLOSED')),
 primary key(organization_id,unit_id,team_id,area,competency),
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id),
 check(competency ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$')
);
create table app.epi_month_snapshots_v1 (
 organization_id uuid not null, unit_id uuid not null, team_id uuid not null, area text not null, competency text not null,
 revision int not null, snapshot jsonb not null, closed_by uuid not null references auth.users(id), closed_at timestamptz not null default now(),
 primary key(organization_id,unit_id,team_id,area,competency,revision),
 foreign key(organization_id,unit_id,team_id,area,competency) references app.epi_months_v1(organization_id,unit_id,team_id,area,competency)
);
do $$ declare t text; begin
 foreach t in array array['epi_months_v1','epi_month_snapshots_v1'] loop
 execute format('alter table app.%I enable row level security',t);
 execute format('revoke all on app.%I from public,anon,authenticated',t);
 execute format('create policy rpc_only on app.%I for all to authenticated using(false) with check(false)',t);
 end loop;
end $$;
create trigger immutable before update or delete on app.epi_month_snapshots_v1 for each row execute function app.reject_audit_mutation();
create index epi_month_snapshots_v1_actor on app.epi_month_snapshots_v1(closed_by);

create function app.epi_month_lock_v1(org uuid,unit uuid,team uuid,area_key text,month_key text) returns void
language sql set search_path='' as $$ select pg_advisory_xact_lock(hashtextextended('epi-month:'||org::text||unit::text||team::text||area_key||month_key,0)); $$;
revoke all on function app.epi_month_lock_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;
create function app.epi_month_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.organization_id,new.unit_id,new.team_id,new.area,new.competency) is distinct from (old.organization_id,old.unit_id,old.team_id,old.area,old.competency) then
 raise exception 'Não é permitido mover o escopo do registro.' using errcode='22023'; end if;
 perform app.epi_month_lock_v1(new.organization_id,new.unit_id,new.team_id,new.area,new.competency);
 if exists(select 1 from app.epi_months_v1 m where (m.organization_id,m.unit_id,m.team_id,m.area,m.competency)=(new.organization_id,new.unit_id,new.team_id,new.area,new.competency) and m.status='CLOSED') then
 raise exception 'Competência fechada. Solicite reabertura mensal justificada antes de alterar registros.' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function app.epi_month_guard_v1() from public,anon,authenticated;
create trigger epi_month_freeze_v1 before insert or update on app.epi_cases_v1 for each row execute function app.epi_month_guard_v1();

-- Locks, permissions and snapshot selection are shared by the screen and both export formats.
create function app.epi_month_report_v1(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 org uuid:=(p_request->>'organizationId')::uuid; unit uuid:=(p_request->>'unitId')::uuid;
 team uuid:=nullif(p_request->>'team','')::uuid; area_key text:=p_request->>'area'; month_key text:=p_request->>'month';
 scope_key text:=coalesce(p_request->>'scope','unit'); nominal boolean:=coalesce((p_request->>'nominal')::boolean,false);
 requested_revision int:=nullif(p_request->>'revision','')::int; t record; m app.epi_months_v1; s app.epi_month_snapshots_v1;
 rows jsonb:='[]'; cases jsonb; counts jsonb; total int; pending int; revision_list jsonb; row_data jsonb;
begin
 if org is distinct from '362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid or unit is null or auth.uid() is null
 or area_key is null or area_key not in ('hanseniase','tuberculose','sifilis','hiv','obitos-infantis','obito-materno','obito-fetal','leishmaniose','dengue')
 or month_key is null or month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or scope_key not in ('team','unit','municipal')
 or (scope_key='team' and team is null) or (nominal and scope_key<>'team') or (requested_revision is not null and (scope_key<>'team' or requested_revision<1)) then
 raise exception 'Revise o recorte do relatório.' using errcode='22023'; end if;
 if scope_key='municipal' and not app.epi_access_v1(org,null,null,area_key,'summary') then raise exception 'Consolidado municipal não autorizado.' using errcode='42501'; end if;
 if scope_key='team' and not app.epi_access_v1(org,unit,team,area_key,case when nominal then 'view' else 'summary' end) then raise exception 'Equipe ou dados nominais não autorizados.' using errcode='42501'; end if;
 for t in select et.id,et.unit_id,et.name,u.name as unit_name from public.esf_teams et join public.units u on u.id=et.unit_id and u.organization_id=et.organization_id
 where et.organization_id=org and (scope_key='municipal' or et.unit_id=unit) and (scope_key<>'team' or et.id=team)
 and app.epi_access_v1(org,et.unit_id,et.id,area_key,'summary') order by et.unit_id,et.id loop
 perform app.epi_month_lock_v1(org,t.unit_id,t.id,area_key,month_key);
 select * into m from app.epi_months_v1 where (organization_id,unit_id,team_id,area,competency)=(org,t.unit_id,t.id,area_key,month_key);
 select * into s from app.epi_month_snapshots_v1 where (organization_id,unit_id,team_id,area,competency)=(org,t.unit_id,t.id,area_key,month_key) and revision=coalesce(requested_revision,case when m.status='CLOSED' then m.revision end);
 if requested_revision is not null and s.revision is null then raise exception 'Revisão fechada não encontrada.' using errcode='P0002'; end if;
 if s.revision is not null then
 row_data:=s.snapshot;
 else
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'version',c.version,'status',c.status,'payload',c.payload) order by c.id),'[]') into cases from app.epi_cases_v1 c
 where (c.organization_id,c.unit_id,c.team_id,c.area,c.competency)=(org,t.unit_id,t.id,area_key,month_key);
 total:=jsonb_array_length(cases);
 select count(*)::int into pending from jsonb_array_elements(cases) c where c->>'status' not in ('VALIDATED','CLOSED');
 select coalesce(jsonb_object_agg(q.status,q.n),'{}') into counts from (select c->>'status' status,count(*) n from jsonb_array_elements(cases) c group by c->>'status') q;
 row_data:=jsonb_build_object('teamId',t.id,'teamName',t.name,'unitId',t.unit_id,'unitName',t.unit_name,'records',cases,'total',total,'pending',pending,'counts',counts,'noActivity',false,'status','OPEN','revision',coalesce(m.revision,0));
 end if;
 if not nominal then row_data:=row_data-'records'-'reason'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('revision',revision,'closedAt',closed_at,'closedBy',closed_by) order by revision desc),'[]') into revision_list
 from app.epi_month_snapshots_v1 where (organization_id,unit_id,team_id,area,competency)=(org,t.unit_id,t.id,area_key,month_key);
 rows:=rows||jsonb_build_array(row_data||jsonb_build_object('version',coalesce(m.version,0),'currentStatus',coalesce(m.status,'OPEN'),'canClose',app.epi_access_v1(org,t.unit_id,t.id,area_key,'close'),'revisions',revision_list));
 end loop;
 if jsonb_array_length(rows)=0 then raise exception 'Nenhuma equipe autorizada.' using errcode='42501'; end if;
 if nominal and coalesce((select sum((r->>'total')::int) from jsonb_array_elements(rows) r),0)>10000 then raise exception 'Relatório excede 10.000 registros. Escolha outra competência.' using errcode='22023'; end if;
 return jsonb_build_object('organizationName',(select name from public.organizations where id=org),'area',area_key,'month',month_key,'scope',scope_key,'nominal',nominal,'generatedAt',now(),'teams',rows,
 'definitive',not exists(select 1 from jsonb_array_elements(rows) r where r->>'status'<>'CLOSED'),
 'total',(select sum((r->>'total')::int) from jsonb_array_elements(rows) r));
end $$;
revoke all on function app.epi_month_report_v1(jsonb) from public,anon,authenticated;

create function app.epi_month_command_v1(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 org uuid:=(p_request->>'organizationId')::uuid; unit uuid:=(p_request->>'unitId')::uuid; team uuid:=(p_request->>'team')::uuid;
 area_key text:=p_request->>'area'; month_key text:=p_request->>'month'; a text:=p_request->>'action';
 operation uuid; expected int; fingerprint text; receipt app.epi_receipts_v1; m app.epi_months_v1; answer jsonb; row_data jsonb; reason text:=trim(coalesce(p_request->>'reason',''));
begin
 if a in ('load','report') then
 answer:=app.epi_month_report_v1(p_request);
 insert into app.epi_events_v1(organization_id,unit_id,actor_id,action,reason) values(org,unit,auth.uid(),case when a='report' then 'MONTH_EXPORT' else 'MONTH_READ' end,jsonb_build_object('area',area_key,'month',month_key,'scope',answer->'scope','nominal',answer->'nominal','revision',p_request->'revision')::text);
 return answer;
 end if;
 -- Permission checked before receipt lookup, including on replay after revocation.
 if a is null or a not in ('close','reopen') or team is null or not app.epi_access_v1(org,unit,team,area_key,'close') then raise exception 'Fechamento mensal não autorizado.' using errcode='42501'; end if;
 if p_request->'synthetic' is distinct from 'true'::jsonb or length(reason)>500 or (p_request->>'deviceId')::uuid is null or (p_request->>'localTimestamp')::timestamptz is null then raise exception 'Envelope inválido.' using errcode='22023'; end if;
 operation:=(p_request->>'operationId')::uuid; expected:=(p_request->>'expectedVersion')::int;
 if operation is null or expected is null or expected<0 then raise exception 'Operação e versão obrigatórias.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(operation::text,0));
 fingerprint:=encode(extensions.digest(p_request::text,'sha256'),'hex');
 select * into receipt from app.epi_receipts_v1 where operation_id=operation;
 if found then
 if receipt.actor_id<>auth.uid() or receipt.request_hash<>fingerprint then raise exception 'Operação reutilizada.' using errcode='22023'; end if;
 return receipt.response;
 end if;
 -- Validates scope/area/month and locks the same key as the old record RPC trigger.
 answer:=app.epi_month_report_v1(p_request||jsonb_build_object('scope','team','nominal',true)-'revision'); row_data:=answer->'teams'->0;
 select * into m from app.epi_months_v1 where (organization_id,unit_id,team_id,area,competency)=(org,unit,team,area_key,month_key);
 if expected<>coalesce(m.version,0) then raise exception 'Fechamento alterado. Atualize antes de tentar novamente.' using errcode='PT409'; end if;
 if a='close' then
 if m.status='CLOSED' then raise exception 'Competência já fechada.' using errcode='22023'; end if;
 if (row_data->>'pending')::int>0 then raise exception 'Existem registros sem validação técnica. Revise e valide todos antes de fechar.' using errcode='22023'; end if;
 if (row_data->>'total')::int=0 and (p_request->'noActivity' is distinct from 'true'::jsonb or length(reason)<10) then raise exception 'Sem lançamentos: confirme ausência de atividade e justifique, ou mantenha pendente.' using errcode='22023'; end if;
 insert into app.epi_months_v1(organization_id,unit_id,team_id,area,competency,version,revision,status) values(org,unit,team,area_key,month_key,1,1,'CLOSED')
 on conflict(organization_id,unit_id,team_id,area,competency) do update set status='CLOSED',version=app.epi_months_v1.version+1,revision=app.epi_months_v1.revision+1 returning * into m;
 row_data:=(row_data-'revisions'-'canClose'-'currentStatus')||jsonb_build_object('status','CLOSED','revision',m.revision,'version',m.version,'closedAt',now(),'closedBy',auth.uid(),'reason',reason,'noActivity',(row_data->>'total')::int=0);
 insert into app.epi_month_snapshots_v1(organization_id,unit_id,team_id,area,competency,revision,snapshot,closed_by) values(org,unit,team,area_key,month_key,m.revision,row_data,auth.uid());
 else
 if m.status is distinct from 'CLOSED' or length(reason)<10 then raise exception 'Reabertura exige competência fechada e justificativa de pelo menos 10 caracteres.' using errcode='22023'; end if;
 update app.epi_months_v1 set status='OPEN',version=version+1 where (organization_id,unit_id,team_id,area,competency)=(org,unit,team,area_key,month_key) returning * into m;
 end if;
 answer:=jsonb_build_object('status',m.status,'version',m.version,'revision',m.revision);
 insert into app.epi_events_v1(organization_id,unit_id,actor_id,action,snapshot,reason,device_id,local_timestamp) values(org,unit,auth.uid(),'MONTH_'||upper(a),answer||jsonb_build_object('team',team,'area',area_key,'month',month_key),reason,(p_request->>'deviceId')::uuid,(p_request->>'localTimestamp')::timestamptz);
 insert into app.epi_receipts_v1(operation_id,actor_id,request_hash,response) values(operation,auth.uid(),fingerprint,answer);
 return answer;
end $$;
revoke all on function app.epi_month_command_v1(jsonb) from public,anon,authenticated;
create function public.staging_epidemiology_monthly_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app.epi_month_command_v1(p_request); $$;
revoke all on function public.staging_epidemiology_monthly_v1(jsonb) from public,anon;
grant execute on function app.epi_month_command_v1(jsonb),public.staging_epidemiology_monthly_v1(jsonb) to authenticated;
