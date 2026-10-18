-- Additive, synthetic-only map sandbox. No changes to existing functions or records.
create table app.esf_maps_v1 (
 id uuid primary key, organization_id uuid not null check(organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),
 unit_id uuid not null, team_id uuid not null, template_id text not null,
 competency text not null check(competency ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'),
 version integer not null default 1, revision integer not null default 1,
 status text not null default 'OPEN' check(status in ('OPEN','IN_REVIEW','CLOSED')),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=500000),
 synthetic boolean not null default true check(synthetic), calculation_version integer not null default 1 check(calculation_version=1),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id),closed_at timestamptz,
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id),
 unique(organization_id,unit_id,id)
);
create index esf_maps_v1_scope on app.esf_maps_v1(organization_id,unit_id,team_id,template_id,competency,updated_at desc,id);
create table app.esf_map_revisions_v1 (
 id uuid primary key default gen_random_uuid(), map_id uuid not null references app.esf_maps_v1(id), version integer not null,
 status text not null, payload jsonb not null, created_at timestamptz not null default now(), actor_id uuid not null references auth.users(id),
 unique(map_id,version)
);
create table app.esf_map_receipts_v1 (
 operation_id uuid primary key, actor_id uuid not null references auth.users(id), organization_id uuid not null,unit_id uuid not null,
 request_hash text not null,response jsonb not null,created_at timestamptz not null default now()
);
create table app.esf_map_events_v1 (
 id uuid primary key default gen_random_uuid(),map_id uuid references app.esf_maps_v1(id),organization_id uuid not null,unit_id uuid not null,
 actor_id uuid not null references auth.users(id),action text not null,previous_version integer,new_version integer,
 device_id_claim uuid,local_timestamp timestamptz,reason text not null default '',created_at timestamptz not null default now()
);
create table app.esf_map_files_v1 (
 id uuid primary key, map_id uuid not null references app.esf_maps_v1(id), object_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), byte_size integer not null check(byte_size between 1 and 2097152),
 content_type text not null check(content_type in ('application/pdf','image/png','image/jpeg')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['esf_maps_v1','esf_map_revisions_v1','esf_map_receipts_v1','esf_map_events_v1','esf_map_files_v1'] loop
 execute format('alter table app.%I enable row level security',t);
 execute format('revoke all on app.%I from public,anon,authenticated',t);
 execute format('create policy rpc_only on app.%I for all to authenticated using(false) with check(false)',t);
 end loop;
 foreach t in array array['esf_map_revisions_v1','esf_map_receipts_v1','esf_map_events_v1','esf_map_files_v1'] loop
 execute format('create trigger immutable before update or delete on app.%I for each row execute function app.reject_audit_mutation()',t);
 end loop;
end $$;

create function app.esf_map_access_v1(org uuid,unit uuid,team uuid,form text,op text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and org='362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid and unit is not null
 and form in ('frequencia','hanseniase','tuberculose','nascidos-vivos','obitos','testes-rapidos','medicamentos','materiais','insulinas')
 and app.can_access(org,unit,'esf.'||form,op)
 and exists(select 1 from public.esf_teams t join public.units u on u.id=t.unit_id and u.organization_id=t.organization_id
 join public.organizations o on o.id=u.organization_id where t.id=team and t.organization_id=org and t.unit_id=unit and t.status='ACTIVE' and t.deleted_at is null
 and u.status='ACTIVE' and u.deleted_at is null and o.status='ACTIVE' and o.deleted_at is null)
 and exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.organization_id=org and (m.unit_id is null or m.unit_id=unit)
 and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()) and
 (m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO','GERENTE_UBS') or (m.role='LEITOR' and op='visualizar' and form in ('testes-rapidos','medicamentos','materiais')) or
 (exists(select 1 from public.esf_team_members tm where tm.user_id=auth.uid() and tm.team_id=team and tm.deleted_at is null) and m.role<>'LEITOR')));
$$;
revoke all on function app.esf_map_access_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('esf-synthetic-receipts','esf-synthetic-receipts',false,2097152,array['application/pdf','image/png','image/jpeg']);
create function app.esf_map_file_access_v1(path text,op text) returns boolean language plpgsql security definer set search_path='' as $$
declare parts text[]:=string_to_array(path,'/'); m app.esf_maps_v1;
begin
 if array_length(parts,1)<>4 or op not in ('criar','visualizar') then return false; end if;
 select * into m from app.esf_maps_v1 where id=parts[3]::uuid and organization_id=parts[1]::uuid and unit_id=parts[2]::uuid and template_id='insulinas';
 if not found or not app.esf_map_access_v1(m.organization_id,m.unit_id,m.team_id,'insulinas',op) or (op='criar' and m.status<>'OPEN') then return false; end if;
 perform parts[4]::uuid;
 return true;
exception when invalid_text_representation then return false;
end $$;
revoke all on function app.esf_map_file_access_v1(text,text) from public,anon;
grant execute on function app.esf_map_file_access_v1(text,text) to authenticated;
create policy esf_synthetic_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='esf-synthetic-receipts' and app.esf_map_file_access_v1(name,'criar'));
create policy esf_synthetic_receipt_select on storage.objects for select to authenticated using(bucket_id='esf-synthetic-receipts' and app.esf_map_file_access_v1(name,'visualizar'));

-- Field specification is generated from the reviewed application dictionary below.
create function app.esf_map_spec_v1(form text) returns jsonb language sql immutable set search_path='' as $$
 select $spec${"frequencia":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"},"administrativeAddress":{"type":"text"},"informationDate":{"type":"date"},"planningDate":{"type":"date"},"informationOwner":{"type":"reference"},"unitSecretary":{"type":"reference"},"planningSecretary":{"type":"reference"},"reviewDate":{"type":"date"}},"sections":{"records":{"professionalId":{"type":"text"},"referenceId":{"type":"text"},"registration":{"type":"text"},"position":{"type":"text"},"function":{"type":"text"},"secondment":{"type":"text"},"level":{"type":"text"},"hours":{"type":"decimal"},"employmentStatus":{"type":"select"},"shift":{"type":"text"},"attendance":{"type":"select"},"notes":{"type":"text"},"occurrenceDate":{"type":"date"},"absent":{"type":"select","options":["Sim","Não","Não informado"]},"absences":{"type":"calculated"}}}},"hanseniase":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"},"regional":{"type":"text"},"municipality":{"type":"text"},"technicalOwner":{"type":"reference"}},"sections":{"records":{"caseReference":{"type":"text"},"notificationNumber":{"type":"text"},"name":{"type":"text"},"residenceCity":{"type":"text"},"notificationDate":{"type":"date"},"lastAttendance":{"type":"date"},"examinedContacts":{"type":"integer"},"classification":{"type":"select"},"disability":{"type":"select"},"dischargeType":{"type":"select"},"assessmentDate":{"type":"date"},"dischargeDate":{"type":"date"},"followUpDate":{"type":"date"}}}},"tuberculose":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"}},"sections":{"records":{"caseReference":{"type":"text"},"name":{"type":"text"},"notificationDate":{"type":"date"},"smear1":{"type":"select"},"smear2":{"type":"select"},"smear3":{"type":"select"},"smear4":{"type":"select"},"smear5":{"type":"select"},"smear6":{"type":"select"},"treatmentChangedOn":{"type":"date"},"closedOn":{"type":"date"},"examinedContacts":{"type":"integer"},"status9":{"type":"select"},"status12":{"type":"select"},"closureStatus":{"type":"select"},"sputumCulture":{"type":"select"},"otherCulture":{"type":"select"},"hiv":{"type":"select"},"histopathology":{"type":"select"},"observedTreatment":{"type":"select"},"followUpDate":{"type":"date"}}}},"nascidos-vivos":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"},"segment":{"type":"text"},"area":{"type":"text"}},"sections":{"records":{"familyNumber":{"type":"text"},"motherName":{"type":"text"},"address":{"type":"text"},"residenceCity":{"type":"text"},"sex":{"type":"select"},"birthPlace":{"type":"select"},"weight":{"type":"decimal"},"birthDate":{"type":"date"},"occurrenceCity":{"type":"text"},"agentId":{"type":"reference"},"weightUnit":{"type":"select","options":["g","kg","Não informado"]}}}},"obitos":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"}},"sections":{"records":{"name":{"type":"text"},"declarationNumber":{"type":"text"},"address":{"type":"text"},"birthDate":{"type":"date"},"deathDate":{"type":"date"},"age":{"type":"integer"},"ageUnit":{"type":"select","options":["Dias","Meses","Anos"]},"place":{"type":"text"},"city":{"type":"text"},"agentId":{"type":"reference"}}}},"testes-rapidos":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"},"serviceType":{"type":"select"},"regional":{"type":"text"},"contact":{"type":"text"},"sisloglab":{"type":"text"},"serviceOther":{"type":"text"},"technicalOwner":{"type":"text"}},"sections":{"records":{"sourceLine":{"type":"text"},"occurredOn":{"type":"date"},"itemId":{"type":"reference"},"batchId":{"type":"reference"},"expiresOn":{"type":"date"},"entry":{"type":"integer"},"exit":{"type":"integer"},"previousBalance":{"type":"integer"},"currentBalance":{"type":"calculated"},"pregnancyUse":{"type":"integer"},"otherUse":{"type":"integer"},"losses":{"type":"integer"},"reactive":{"type":"integer"},"resupply":{"type":"integer"},"lossReason":{"type":"text"},"presentation":{"type":"text"},"origin":{"type":"text"},"destination":{"type":"text"}}}},"medicamentos":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"},"analyzedOn":{"type":"date"},"checkedOn":{"type":"date"},"pharmacistId":{"type":"reference"},"managerId":{"type":"reference"}},"sections":{"records":{"sourceLine":{"type":"text"},"occurredOn":{"type":"date"},"itemId":{"type":"reference"},"batchId":{"type":"reference"},"expiresOn":{"type":"date"},"previousBalance":{"type":"decimal"},"currentBalance":{"type":"calculated"},"pharmacyEntry":{"type":"decimal"},"otherEntry":{"type":"decimal"},"dispensed":{"type":"decimal"},"transferred":{"type":"decimal"},"losses":{"type":"decimal"},"served":{"type":"decimal"},"unserved":{"type":"decimal"},"authorized":{"type":"decimal"},"totalDemand":{"type":"calculated"},"presentation":{"type":"text"},"origin":{"type":"text"},"destination":{"type":"text"},"entryTotal":{"type":"calculated"},"exitTotal":{"type":"calculated"}}}},"materiais":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"},"reviewerId":{"type":"reference"},"analyzedOn":{"type":"date"},"responsible":{"type":"text"}},"sections":{"records":{"sourceLine":{"type":"text"},"occurredOn":{"type":"date"},"itemId":{"type":"reference"},"batchId":{"type":"reference"},"expiresOn":{"type":"date"},"entry":{"type":"decimal"},"exit":{"type":"decimal"},"previousBalance":{"type":"decimal"},"currentBalance":{"type":"calculated"},"unserved":{"type":"decimal"},"authorized":{"type":"decimal"},"notes":{"type":"text"},"presentation":{"type":"text"},"origin":{"type":"text"},"destination":{"type":"text"}}}},"insulinas":{"headers":{"reportDate":{"type":"date"},"filledBy":{"type":"text"},"notes":{"type":"text"},"unitOwner":{"type":"reference"},"cafOwner":{"type":"reference"}},"sections":{"deliveries":{"patientName":{"type":"text"},"address":{"type":"text"},"birthDate":{"type":"date"},"diabetesType":{"type":"select","options":["I","II"]},"nphUnits":{"type":"decimal"},"regularUnits":{"type":"decimal"},"batchId":{"type":"reference"},"deliveredOn":{"type":"date"},"receiptId":{"type":"attachment"},"nphVialsDelivered":{"type":"integer"},"nphPensDelivered":{"type":"integer"},"regularVialsDelivered":{"type":"integer"},"regularPensDelivered":{"type":"integer"}},"supplies":{"item":{"type":"text"},"previousBalance":{"type":"decimal"},"entry":{"type":"decimal"},"exit":{"type":"decimal"},"currentBalance":{"type":"calculated"},"resupply":{"type":"decimal"}},"insulinStock":{"insulinType":{"type":"text"},"presentation":{"type":"text"},"previousBalance":{"type":"decimal"},"entry":{"type":"decimal"},"exit":{"type":"decimal"},"currentBalance":{"type":"calculated"},"resupply":{"type":"decimal"}}}}}$spec$::jsonb -> form;
$$;
revoke all on function app.esf_map_spec_v1(text) from public,anon,authenticated;

create function app.esf_map_payload_v1(form text,body jsonb,month text) returns void language plpgsql set search_path='' as $$
declare spec jsonb:=app.esf_map_spec_v1(form); s record; r jsonb; v record; f jsonb; kind text; ds text;
begin
 if spec is null or body is null or jsonb_typeof(body)<>'object' or body- 'headers'-'sections'<>'{}'::jsonb or jsonb_typeof(body->'headers') is distinct from 'object' or jsonb_typeof(body->'sections') is distinct from 'object' or body->'sections' ? 'headers'
 or octet_length(body::text)>500000 then raise exception 'Invalid map payload' using errcode='22023'; end if;
 for s in select * from jsonb_each(jsonb_build_object('headers',jsonb_build_array(jsonb_build_object('values',body->'headers'))) || (body->'sections')) loop
 if s.key<>'headers' and not (spec->'sections' ? s.key) then raise exception 'Unknown section' using errcode='22023'; end if;
 if jsonb_typeof(s.value)<>'array' or jsonb_array_length(s.value)>250 then raise exception 'Invalid rows' using errcode='22023'; end if;
 if s.key<>'headers' and exists(select 1 from jsonb_array_elements(s.value) x group by x->>'id' having count(*)>1) then raise exception 'Duplicate row id' using errcode='22023'; end if;
 for r in select * from jsonb_array_elements(s.value) loop
 if s.key<>'headers' then perform (r->>'id')::uuid; if r->>'id' is null or r-'id'-'values'<>'{}'::jsonb then raise exception 'Invalid row' using errcode='22023'; end if; end if;
 if jsonb_typeof(r->'values')<>'object' then raise exception 'Invalid values' using errcode='22023'; end if;
 for v in select * from jsonb_each(r->'values') loop
 f:=case when s.key='headers' then spec->'headers'->v.key else spec->'sections'->s.key->v.key end;
 if f is null or f->>'type'='calculated' then raise exception 'Unknown or calculated field' using errcode='22023'; end if;
 kind:=jsonb_typeof(v.value); ds:=v.value#>>'{}';
 if kind='null' or ds='' then continue; end if;
 if ds='Não se aplica' and f->>'type' in ('decimal','integer','date') then continue; end if;
 if f->>'type' in ('decimal','integer') then
 if kind<>'number' or ds::numeric<0 or ds::numeric>1000000 or (f->>'type'='integer' and trunc(ds::numeric)<>ds::numeric) then raise exception 'Invalid quantity' using errcode='22023'; end if;
 elsif kind<>'string' or length(ds)>1000 then raise exception 'Invalid text' using errcode='22023'; end if;
 if f->>'type'='date' then if ds !~ '^\d{4}-\d{2}-\d{2}$' or ds::date::text<>ds or ds::date not between date '1900-01-01' and date '2100-12-31' then raise exception 'Invalid date' using errcode='22023'; end if; end if;
 if v.key in ('occurredOn','occurrenceDate','deliveredOn','followUpDate') and left(ds,7)<>month then raise exception 'Occurrence outside competency' using errcode='22023'; end if;
 if f ? 'options' and not(f->'options' ? ds) then raise exception 'Invalid option' using errcode='22023'; end if;
 if v.key in ('name','motherName','patientName','professionalId') and left(ds,11)<>'[SINTÉTICO]' then raise exception 'Synthetic names required' using errcode='22023'; end if;
 if f->>'type'='attachment' then perform ds::uuid; end if;
 end loop;
 if form='obitos' and coalesce(r->'values'->>'birthDate','') not in ('','Não se aplica') and coalesce(r->'values'->>'age','') not in ('','Não se aplica') then raise exception 'Nascimento ou idade, não os dois.' using errcode='22023'; end if;
 if form='obitos' and coalesce(r->'values'->>'age','') not in ('','Não se aplica') and coalesce(r->'values'->>'ageUnit','')='' then raise exception 'Unidade da idade obrigatória.' using errcode='22023'; end if;
 if form='obitos' and (r->'values'->>'birthDate') ~ '^\d{4}-\d{2}-\d{2}$' and (r->'values'->>'deathDate') ~ '^\d{4}-\d{2}-\d{2}$' and r->'values'->>'birthDate'>r->'values'->>'deathDate' then raise exception 'Datas incoerentes.' using errcode='22023'; end if;
 if form='nascidos-vivos' and coalesce(r->'values'->>'weight','') not in ('','Não se aplica') and coalesce(r->'values'->>'weightUnit','')='' then raise exception 'Unidade do peso obrigatória.' using errcode='22023'; end if;
 end loop;
 end loop;
end $$;
revoke all on function app.esf_map_payload_v1(text,jsonb,text) from public,anon,authenticated;

create function app.esf_maps_gateway_v1(req jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=(req->>'organizationId')::uuid; unit uuid:=(req->>'unitId')::uuid; team uuid:=(req->>'teamId')::uuid;
 form text:=req->>'templateId'; cmd text:=req->>'action'; entity uuid:=(req->>'entityId')::uuid; opid uuid:=(req->>'operationId')::uuid;
 operation text; rec app.esf_maps_v1; receipt app.esf_map_receipts_v1; answer jsonb; fingerprint text; expected integer:=(req->>'expectedVersion')::integer; fileid uuid; path text; stored app.esf_map_files_v1;
begin
 if cmd in ('file-register','file-read') then
 if form<>'insulinas' or not app.esf_map_access_v1(org,unit,team,form,case cmd when 'file-register' then 'criar' else 'visualizar' end) then raise exception 'Comprovante não autorizado.' using errcode='42501'; end if;
 select * into rec from app.esf_maps_v1 where id=entity and organization_id=org and unit_id=unit and team_id=team and template_id=form for update;
 if not found then raise exception 'Mapa não encontrado.' using errcode='P0002'; end if;
 fileid:=(req->>'fileId')::uuid; if fileid is null then raise exception 'Comprovante inválido.' using errcode='22023'; end if;
 path:=org::text||'/'||unit::text||'/'||entity::text||'/'||fileid::text;
 if cmd='file-register' then
 if rec.status<>'OPEN' or rec.version<>expected then raise exception 'Versão do mapa divergente.' using errcode='PT409'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='esf-synthetic-receipts' and o.name=path and o.owner_id=auth.uid()::text and (o.metadata->>'size')::integer=(req->>'byteSize')::integer and o.metadata->>'mimetype'=req->>'contentType') then raise exception 'Arquivo não confirmado.' using errcode='22023'; end if;
 insert into app.esf_map_files_v1(id,map_id,object_path,sha256,byte_size,content_type,created_by) values(fileid,entity,path,req->>'sha256',(req->>'byteSize')::integer,req->>'contentType',auth.uid()) on conflict(id) do nothing;
 end if;
 select * into stored from app.esf_map_files_v1 where id=fileid and map_id=entity;
 if not found then raise exception 'Comprovante não encontrado.' using errcode='P0002'; end if;
 if cmd='file-register' and (stored.created_by<>auth.uid() or stored.sha256<>req->>'sha256') then raise exception 'Identificador reutilizado.' using errcode='22023'; end if;
 insert into app.esf_map_events_v1(map_id,organization_id,unit_id,actor_id,action) values(entity,org,unit,auth.uid(),cmd);
 return to_jsonb(stored);
 end if;
 if cmd='teams' then
 if auth.uid() is null or org<>'362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid or unit is null then raise exception 'Escopo não autorizado.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'code',t.code,'area',t.area,'status',t.status) order by t.name,t.id)
 from public.esf_teams t where t.organization_id=org and t.unit_id=unit and app.esf_map_access_v1(org,unit,t.id,form,'visualizar')),'[]'::jsonb);
 end if;
 operation:=case cmd when 'save' then case when expected=0 then 'criar' else 'editar' end when 'submit' then 'criar' when 'return' then 'aprovar' when 'close' then 'encerrar' when 'reopen' then 'reabrir' when 'export' then 'exportar' when 'list' then 'visualizar' when 'read' then 'visualizar' end;
 if operation is null or not app.esf_map_access_v1(org,unit,team,form,operation) then raise exception 'Mapa não autorizado neste escopo sintético.' using errcode='42501'; end if;
 if cmd in ('list','read','export') then
 if cmd='list' then
 select jsonb_build_object('maps',coalesce(jsonb_agg(x),'[]'::jsonb),'canWrite',app.esf_map_access_v1(org,unit,team,form,'criar')) into answer
 from(select id,competency,version,revision,status,updated_at from app.esf_maps_v1 where organization_id=org and unit_id=unit and team_id=team and template_id=form order by updated_at desc,id limit 25) x;
 else
 select * into rec from app.esf_maps_v1 where id=entity and organization_id=org and unit_id=unit and team_id=team and template_id=form;
 if not found then raise exception 'Mapa não encontrado.' using errcode='P0002'; end if;
 answer:=to_jsonb(rec);
 end if;
 insert into app.esf_map_events_v1(map_id,organization_id,unit_id,actor_id,action) values(case when cmd='list' then null else entity end,org,unit,auth.uid(),cmd);
 return answer;
 end if;
 if req->'synthetic' is distinct from 'true'::jsonb or opid is null or entity is null or expected is null or expected<0 or req->>'competency' !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
 or req->>'deviceId' is null or req->>'localTimestamp' is null then raise exception 'Envelope inválido.' using errcode='22023'; end if;
 perform (req->>'deviceId')::uuid; perform (req->>'localTimestamp')::timestamptz;
 perform app.esf_map_payload_v1(form,req->'payload',req->>'competency');
 if form='insulinas' and exists(select 1 from jsonb_array_elements(coalesce(req->'payload'->'sections'->'deliveries','[]'::jsonb)) r where nullif(r->'values'->>'receiptId','') is not null and not exists(select 1 from app.esf_map_files_v1 f where f.id=(r->'values'->>'receiptId')::uuid and f.map_id=entity)) then raise exception 'Comprovante não pertence ao mapa.' using errcode='42501'; end if;
 if cmd in ('submit','close') then
 if not exists(select 1 from jsonb_each(req->'payload'->'sections') s cross join lateral jsonb_array_elements(s.value) r) then raise exception 'Inclua ao menos um registro.' using errcode='22023'; end if;
 if exists(select 1 from jsonb_each(req->'payload'->'sections') s cross join lateral jsonb_array_elements(s.value) r
 where trim(coalesce(r->'values'->>(case when form='frequencia' then 'professionalId' when form='nascidos-vivos' then 'motherName'
 when form='insulinas' then case s.key when 'deliveries' then 'patientName' when 'supplies' then 'item' else 'insulinType' end
 when form in ('hanseniase','tuberculose','obitos') then 'name' else 'itemId' end),''))='') then raise exception 'Identifique cada registro.' using errcode='22023'; end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(opid::text,0));
 fingerprint:=encode(extensions.digest((req-'operationId')::text,'sha256'),'hex');
 select * into receipt from app.esf_map_receipts_v1 where operation_id=opid;
 if found then
 if receipt.actor_id<>auth.uid() or receipt.organization_id<>org or receipt.unit_id<>unit or receipt.request_hash<>fingerprint then raise exception 'Operação reutilizada com outros dados.' using errcode='22023'; end if;
 return receipt.response; end if;
 select * into rec from app.esf_maps_v1 where id=entity for update;
 if found then
 if rec.organization_id<>org or rec.unit_id<>unit or rec.team_id<>team or rec.template_id<>form then raise exception 'Escopo divergente.' using errcode='42501'; end if;
 if rec.version<>expected then raise exception 'Conflito de versão; preserve sua edição.' using errcode='PT409'; end if;
 if rec.competency<>req->>'competency' then raise exception 'Competência imutável.' using errcode='22023'; end if;
 if cmd='save' and rec.status<>'OPEN' then raise exception 'Mapa não está em preenchimento.' using errcode='22023'; end if;
 if cmd='submit' and rec.status='OPEN' then rec.status:='IN_REVIEW';
 elsif cmd='return' and rec.status='IN_REVIEW' then rec.status:='OPEN';
 elsif cmd='close' and rec.status='IN_REVIEW' then rec.status:='CLOSED'; rec.closed_at:=now();
 elsif cmd='reopen' and rec.status='CLOSED' then rec.status:='OPEN';rec.revision:=rec.revision+1;rec.closed_at:=null;
 elsif cmd<>'save' then raise exception 'Transição indisponível.' using errcode='22023'; end if;
 if cmd in ('return','reopen') and length(trim(coalesce(req->>'reason','')))<10 then raise exception 'Justificativa obrigatória.' using errcode='22023'; end if;
 if cmd<>'save' and rec.payload is distinct from req->'payload' then raise exception 'Salve as alterações antes da transição.' using errcode='PT409'; end if;
 update app.esf_maps_v1 set payload=case when cmd='save' then req->'payload' else rec.payload end,status=rec.status,revision=rec.revision,closed_at=rec.closed_at,
 version=version+1,updated_at=now(),updated_by=auth.uid() where id=entity returning * into rec;
 else
 if cmd<>'save' or expected<>0 then raise exception 'Mapa não encontrado ou versão inválida.' using errcode='PT409'; end if;
 insert into app.esf_maps_v1(id,organization_id,unit_id,team_id,template_id,competency,payload,created_by,updated_by)
 values(entity,org,unit,team,form,req->>'competency',req->'payload',auth.uid(),auth.uid()) returning * into rec;
 end if;
 insert into app.esf_map_revisions_v1(map_id,version,status,payload,actor_id) values(rec.id,rec.version,rec.status,rec.payload,auth.uid());
 insert into app.esf_map_events_v1(map_id,organization_id,unit_id,actor_id,action,previous_version,new_version,device_id_claim,local_timestamp,reason)
 values(rec.id,org,unit,auth.uid(),cmd,expected,rec.version,(req->>'deviceId')::uuid,(req->>'localTimestamp')::timestamptz,coalesce(req->>'reason',''));
 answer:=jsonb_build_object('id',rec.id,'version',rec.version,'revision',rec.revision,'status',rec.status);
 insert into app.esf_map_receipts_v1(operation_id,actor_id,organization_id,unit_id,request_hash,response) values(opid,auth.uid(),org,unit,fingerprint,answer);
 return answer;
end $$;
revoke all on function app.esf_maps_gateway_v1(jsonb) from public,anon;
grant execute on function app.esf_maps_gateway_v1(jsonb) to authenticated;
create function public.staging_esf_maps_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app.esf_maps_gateway_v1(p_request); $$;
revoke all on function public.staging_esf_maps_v1(jsonb) from public,anon;
grant execute on function public.staging_esf_maps_v1(jsonb) to authenticated;
