-- Synthetic sandbox only. No existing table, function, record or flag is changed.
create table app.epi_grants_v1 (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 organization_id uuid not null check(organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),
 unit_id uuid, team_id uuid, areas text[] not null,
 nominal boolean not null default false, can_write boolean not null default false,
 can_review boolean not null default false, can_validate boolean not null default false, can_close boolean not null default false,
 municipal boolean not null default false, enabled boolean not null default true,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id),
 foreign key(organization_id,unit_id) references public.units(organization_id,id),
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id),
 check((municipal and unit_id is null and team_id is null) or (not municipal and unit_id is not null)),
 check(areas <@ array['hanseniase','tuberculose','sifilis','hiv','obitos-infantis','obito-materno','obito-fetal','leishmaniose','dengue']::text[] and cardinality(areas)>0),
 check(nominal or not (can_write or can_review or can_validate or can_close))
);
create table app.epi_cases_v1 (
 id uuid primary key, organization_id uuid not null check(organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),
 unit_id uuid not null, team_id uuid not null, area text not null,
 competency text not null check(competency ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 version integer not null default 1, status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','REVIEWED','VALIDATED','CLOSED')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<12000),
 synthetic boolean not null default true check(synthetic),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id),
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id)
);
create index epi_cases_v1_scope on app.epi_cases_v1(organization_id,unit_id,team_id,area,competency,id);
create table app.epi_events_v1 (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, unit_id uuid not null,
 case_id uuid references app.epi_cases_v1(id),actor_id uuid not null references auth.users(id),
 action text not null,version integer, snapshot jsonb,reason text not null default '',
 device_id uuid,local_timestamp timestamptz,created_at timestamptz not null default now()
);
create table app.epi_receipts_v1 (
 operation_id uuid primary key,actor_id uuid not null references auth.users(id),request_hash text not null,
 response jsonb not null,created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['epi_grants_v1','epi_cases_v1','epi_events_v1','epi_receipts_v1'] loop
 execute format('alter table app.%I enable row level security',t);
 execute format('revoke all on app.%I from public,anon,authenticated',t);
 execute format('create policy rpc_only on app.%I for all to authenticated using(false) with check(false)',t);
 end loop;
 foreach t in array array['epi_events_v1','epi_receipts_v1'] loop
 execute format('create trigger immutable before update or delete on app.%I for each row execute function app.reject_audit_mutation()',t);
 end loop;
end $$;

create function app.epi_access_v1(org uuid,unit uuid,team uuid,area_key text,op text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and org='362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid
 and exists(select 1 from public.organizations o where o.id=org and o.status='ACTIVE' and o.deleted_at is null)
 and exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
 where m.user_id=auth.uid() and m.organization_id=org and (m.unit_id is null or m.unit_id=unit)
 and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
 and ('*'=any(m.domains) or 'vigilancia.'||area_key=any(m.domains)) and ('visualizar'=any(m.operations) or m.role='ADMIN_SISTEMA'))
 and (unit is null or exists(select 1 from public.units u where u.id=unit and u.organization_id=org and u.status='ACTIVE' and u.deleted_at is null))
 and (team is null or exists(select 1 from public.esf_teams t where t.id=team and t.organization_id=org and t.unit_id=unit and t.status='ACTIVE' and t.deleted_at is null))
 and exists(select 1 from app.epi_grants_v1 g where g.user_id=auth.uid() and g.organization_id=org and g.enabled and area_key=any(g.areas)
 and ((unit is null and g.municipal) or (unit is not null and (g.municipal or g.unit_id=unit) and (g.team_id is null or g.team_id=team)))
 and case op when 'summary' then true when 'view' then g.nominal when 'save' then g.can_write when 'submit' then g.can_write
 when 'review' then g.can_review when 'validate' then g.can_validate when 'close' then g.can_close when 'return' then g.can_review or g.can_validate
 when 'reopen' then g.can_close else false end);
$$;
revoke all on function app.epi_access_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;

create function app.epi_payload_v1(area_key text,body jsonb) returns void language plpgsql set search_path='' as $$
declare allowed text[]; entry record; ds date;
begin
 allowed:=case area_key
 when 'hanseniase' then array['sinan','name','date','classification','contacts']
 when 'tuberculose' then array['sinan','name','date','classification','contacts']
 when 'sifilis' then array['sinan','name','date','classification']
 when 'hiv' then array['sinan','name','date']
 when 'obitos-infantis' then array['sinan','name','date','age','ageUnit','place','cause']
 when 'obito-materno' then array['name','date','age','ageUnit','place','cause']
 when 'obito-fetal' then array['name','date','gestationalWeeks','place','cause']
 when 'leishmaniose' then array['name','date','notifyingService','birthDate','address','result']
 when 'dengue' then array['name','date','address','sinan'] end;
 if allowed is null or body is null or jsonb_typeof(body)<>'object' or octet_length(body::text)>12000 or coalesce(body->>'name','') not like '[SINTÉTICO]%' then raise exception 'Use somente campos conhecidos e nome sintético identificado.' using errcode='22023'; end if;
 for entry in select * from jsonb_each(body) loop
 if not entry.key=any(allowed) then raise exception 'Campo desconhecido.' using errcode='22023'; end if;
 if entry.key in ('age','contacts','gestationalWeeks') then
 if jsonb_typeof(entry.value)<>'number' or (entry.value::text)::numeric<0 or (entry.value::text)::numeric>1000000 or trunc((entry.value::text)::numeric)<>(entry.value::text)::numeric then raise exception 'Quantidade inteira inválida.' using errcode='22023'; end if;
 else
 if jsonb_typeof(entry.value)<>'string' or length(entry.value#>>'{}')>1000 then raise exception 'Texto inválido.' using errcode='22023'; end if;
 if entry.key in ('date','birthDate') then
 if (entry.value#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data inválida.' using errcode='22023'; end if;
 ds:=(entry.value#>>'{}')::date;
 end if;
 end if;
 end loop;
 if (body ? 'age') <> (body ? 'ageUnit') or (body ? 'ageUnit' and body->>'ageUnit' not in ('Horas','Dias','Meses','Anos')) then raise exception 'Idade exige unidade explícita.' using errcode='22023'; end if;
end $$;
revoke all on function app.epi_payload_v1(text,jsonb) from public,anon,authenticated;

create function app.epi_summary_v1(org uuid,unit uuid,area_key text,month_key text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q) order by q."unitName",q."teamName"),'[]'::jsonb) from (
 select u.id as "unitId",u.name as "unitName",t.id as "teamId",t.name as "teamName",count(c.id)::int as total,
 count(c.id) filter(where c.status<>'DRAFT')::int as submitted,
 count(c.id) filter(where c.status in ('VALIDATED','CLOSED'))::int as validated,
 count(c.id) filter(where c.status='CLOSED')::int as closed
 from public.esf_teams t join public.units u on u.id=t.unit_id and u.organization_id=t.organization_id
 left join app.epi_cases_v1 c on c.team_id=t.id and c.organization_id=org and c.area=area_key and c.competency=month_key
 where t.organization_id=org and (unit is null or t.unit_id=unit) and app.epi_access_v1(org,t.unit_id,t.id,area_key,'summary')
 group by u.id,u.name,t.id,t.name) q;
$$;
revoke all on function app.epi_summary_v1(uuid,uuid,text,text) from public,anon,authenticated;

create function app.epi_command_v1(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=(p_request->>'organizationId')::uuid; unit uuid:=(p_request->>'unitId')::uuid; team uuid;
 area_key text:=p_request->>'area'; action_key text:=p_request->>'action'; month_key text:=coalesce(p_request->>'month',p_request->>'competency');
 rec app.epi_cases_v1; receipt app.epi_receipts_v1; entity uuid; operation uuid; expected integer; fingerprint text; answer jsonb;
 next_state text; pg integer; chosen jsonb; history jsonb; teams jsonb; records jsonb; total bigint; municipal boolean;
begin
 if org is distinct from '362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid or unit is null or auth.uid() is null then raise exception 'Homologação sintética não autorizada.' using errcode='42501'; end if;
 if action_key='discover' then
 return (select coalesce(jsonb_agg(a),'[]'::jsonb) from unnest(array['hanseniase','tuberculose','sifilis','hiv','obitos-infantis','obito-materno','obito-fetal','leishmaniose','dengue']) a
 where exists(select 1 from public.esf_teams t where t.organization_id=org and t.unit_id=unit and app.epi_access_v1(org,unit,t.id,a,'summary')));
 end if;
 if month_key is null or month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or area_key is null or area_key not in ('hanseniase','tuberculose','sifilis','hiv','obitos-infantis','obito-materno','obito-fetal','leishmaniose','dengue') or octet_length(p_request::text)>16000 then raise exception 'Filtros inválidos.' using errcode='22023'; end if;
 if action_key='load' then
 team:=(p_request->>'team')::uuid; entity:=(p_request->>'record')::uuid; pg:=coalesce((p_request->>'page')::int,1);
 if pg<1 or pg>100000 or (p_request ? 'status' and p_request->>'status' not in ('DRAFT','SUBMITTED','REVIEWED','VALIDATED','CLOSED')) then raise exception 'Página ou situação inválida.' using errcode='22023'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'permissions',jsonb_build_object(
 'view',app.epi_access_v1(org,unit,t.id,area_key,'view'),'save',app.epi_access_v1(org,unit,t.id,area_key,'save'),
 'review',app.epi_access_v1(org,unit,t.id,area_key,'review'),'validate',app.epi_access_v1(org,unit,t.id,area_key,'validate'),'close',app.epi_access_v1(org,unit,t.id,area_key,'close'))) order by t.name,t.id),'[]'::jsonb)
 into teams from public.esf_teams t where t.organization_id=org and t.unit_id=unit and app.epi_access_v1(org,unit,t.id,area_key,'summary');
 if jsonb_array_length(teams)=0 or (team is not null and not exists(select 1 from jsonb_array_elements(teams) x where x->>'id'=team::text)) then raise exception 'Sem acesso a esta área/equipe.' using errcode='42501'; end if;
 select count(*) into total from app.epi_cases_v1 c where c.organization_id=org and c.unit_id=unit and c.area=area_key and c.competency=month_key and (team is null or c.team_id=team) and (not p_request ? 'status' or c.status=p_request->>'status') and app.epi_access_v1(org,unit,c.team_id,area_key,'view');
 select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc,q.id),'[]'::jsonb) into records from (
 select c.* from app.epi_cases_v1 c where c.organization_id=org and c.unit_id=unit and c.area=area_key and c.competency=month_key and (team is null or c.team_id=team) and (not p_request ? 'status' or c.status=p_request->>'status') and app.epi_access_v1(org,unit,c.team_id,area_key,'view') order by c.updated_at desc,c.id limit 25 offset (pg-1)*25) q;
 if entity is not null then
 select * into rec from app.epi_cases_v1 c where c.id=entity and c.organization_id=org and c.unit_id=unit and c.area=area_key and c.competency=month_key and (team is null or c.team_id=team);
 if not found or not app.epi_access_v1(org,unit,rec.team_id,area_key,'view') then raise exception 'Registro não autorizado.' using errcode='42501'; end if;
 chosen:=to_jsonb(rec);
 select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'created_at',e.created_at,'version',e.version,'reason',e.reason) order by e.created_at,e.id),'[]'::jsonb) into history from app.epi_events_v1 e where e.case_id=entity and e.version is not null;
 end if;
 municipal:=app.epi_access_v1(org,null,null,area_key,'summary');
 insert into app.epi_events_v1(organization_id,unit_id,case_id,actor_id,action) values(org,unit,entity,auth.uid(),case when entity is null then 'LIST' else 'READ' end);
 return jsonb_build_object('teams',teams,'municipal',municipal,'records',records,'total',total,'selected',chosen,'history',coalesce(history,'[]'::jsonb),
 'unitSummary',app.epi_summary_v1(org,unit,area_key,month_key),'municipalSummary',case when municipal then app.epi_summary_v1(org,null,area_key,month_key) else '[]'::jsonb end);
 end if;
 team:=(p_request->>'teamId')::uuid;
 if not app.epi_access_v1(org,unit,team,area_key,action_key) then raise exception 'Comando não autorizado.' using errcode='42501'; end if;
 if p_request->'synthetic' is distinct from 'true'::jsonb then raise exception 'Confirme dados sintéticos.' using errcode='22023'; end if;
 entity:=(p_request->>'entityId')::uuid; operation:=(p_request->>'operationId')::uuid; expected:=(p_request->>'expectedVersion')::int;
 if entity is null or operation is null or expected is null or expected<0 or (p_request->>'deviceId')::uuid is null or (p_request->>'localTimestamp')::timestamptz is null or length(coalesce(p_request->>'reason',''))>500 then raise exception 'Envelope inválido.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(operation::text,0));
 fingerprint:=encode(extensions.digest(p_request::text,'sha256'),'hex');
 select * into receipt from app.epi_receipts_v1 where operation_id=operation;
 if found then
 if receipt.actor_id<>auth.uid() or receipt.request_hash<>fingerprint then raise exception 'Operação reutilizada com outros dados.' using errcode='22023'; end if;
 return receipt.response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(entity::text,0));
 select * into rec from app.epi_cases_v1 where id=entity for update;
 if found and (rec.organization_id<>org or rec.unit_id<>unit or rec.team_id<>team or rec.area<>area_key or rec.competency<>month_key) then raise exception 'Registro não autorizado.' using errcode='42501'; end if;
 if coalesce(rec.version,0)<>expected then raise exception 'Versão alterada. Suas edições foram preservadas; recarregue antes de tentar.' using errcode='PT409'; end if;
 if action_key='save' then
 if rec.id is not null and rec.status<>'DRAFT' then raise exception 'Devolva ou reabra antes de editar.' using errcode='22023'; end if;
 perform app.epi_payload_v1(area_key,p_request->'payload');
 if rec.id is null then
 insert into app.epi_cases_v1(id,organization_id,unit_id,team_id,area,competency,payload,created_by,updated_by) values(entity,org,unit,team,area_key,month_key,p_request->'payload',auth.uid(),auth.uid()) returning * into rec;
 else
 update app.epi_cases_v1 set payload=p_request->'payload',version=version+1,updated_at=now(),updated_by=auth.uid() where id=entity returning * into rec;
 end if;
 else
 if rec.id is null then raise exception 'Salve o registro primeiro.' using errcode='22023'; end if;
 next_state:=case
 when action_key='submit' and rec.status='DRAFT' then 'SUBMITTED'
 when action_key='review' and rec.status='SUBMITTED' then 'REVIEWED'
 when action_key='validate' and rec.status='REVIEWED' then 'VALIDATED'
 when action_key='close' and rec.status='VALIDATED' then 'CLOSED'
 when action_key='return' and rec.status in ('SUBMITTED','REVIEWED','VALIDATED') then 'DRAFT'
 when action_key='reopen' and rec.status='CLOSED' then 'DRAFT' end;
 if next_state is null then raise exception 'Transição indisponível.' using errcode='22023'; end if;
 if action_key in ('return','reopen') and length(trim(coalesce(p_request->>'reason','')))<10 then raise exception 'Informe justificativa com pelo menos 10 caracteres.' using errcode='22023'; end if;
 if action_key='submit' and nullif(rec.payload->>'date','') is null then raise exception 'Informe a data antes de enviar.' using errcode='22023'; end if;
 update app.epi_cases_v1 set status=next_state,version=version+1,updated_at=now(),updated_by=auth.uid() where id=entity returning * into rec;
 end if;
 insert into app.epi_events_v1(organization_id,unit_id,case_id,actor_id,action,version,snapshot,reason,device_id,local_timestamp)
 values(org,unit,entity,auth.uid(),action_key,rec.version,to_jsonb(rec),coalesce(p_request->>'reason',''),(p_request->>'deviceId')::uuid,(p_request->>'localTimestamp')::timestamptz);
 answer:=to_jsonb(rec);
 insert into app.epi_receipts_v1(operation_id,actor_id,request_hash,response) values(operation,auth.uid(),fingerprint,answer);
 return answer;
end $$;
revoke all on function app.epi_command_v1(jsonb) from public,anon,authenticated;
create function public.staging_epidemiology_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app.epi_command_v1(p_request); $$;
revoke all on function public.staging_epidemiology_v1(jsonb) from public,anon;
grant execute on function app.epi_command_v1(jsonb),public.staging_epidemiology_v1(jsonb) to authenticated;
