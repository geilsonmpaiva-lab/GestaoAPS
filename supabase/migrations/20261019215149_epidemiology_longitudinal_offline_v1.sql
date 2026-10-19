-- Additive, synthetic-only offline gateway. No existing function is replaced.
-- Version aligned with the applied Supabase migration.
create table app.epi_long_offline_conflicts_v1 (
 id uuid primary key default gen_random_uuid(),operation_id uuid not null unique,
 organization_id uuid not null check(organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),unit_id uuid not null,team_id uuid not null,area text not null,competency text not null,
 case_id uuid not null,actor_id uuid not null references auth.users(id),client jsonb not null,baseline jsonb,server jsonb,
 created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references auth.users(id),
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id)
);
create index epi_long_offline_conflicts_case on app.epi_long_offline_conflicts_v1(case_id) where resolved_at is null;
create index epi_long_offline_conflicts_actor on app.epi_long_offline_conflicts_v1(actor_id);
create index epi_long_offline_conflicts_resolver on app.epi_long_offline_conflicts_v1(resolved_by);
create table app.epi_long_offline_receipts_v1 (
 operation_id uuid primary key,actor_id uuid not null references auth.users(id),request_hash text not null,request jsonb not null,response jsonb not null,created_at timestamptz not null default now()
);
create index epi_long_offline_receipts_actor on app.epi_long_offline_receipts_v1(actor_id);
create trigger immutable before update or delete on app.epi_long_offline_receipts_v1 for each row execute function app.reject_audit_mutation();
create table app.epi_long_files_v1 (
 id uuid primary key,organization_id uuid not null check(organization_id='362db1a9-bfdd-4334-9436-46b1c0117eab'),unit_id uuid not null,team_id uuid not null,area text not null,competency text not null,
 case_id uuid not null references app.epi_long_cases_v1(id),visit_id uuid not null references app.epi_long_visits_v1(id),device_id uuid not null references public.devices(id),
 object_path text not null unique,file_name text not null check(length(file_name) between 1 and 240),content_type text not null check(content_type in ('application/pdf','image/png','image/jpeg')),
 byte_size bigint not null check(byte_size between 1 and 26214400),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),status text not null default 'PENDING' check(status in ('PENDING','AVAILABLE')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),confirmed_at timestamptz,
 foreign key(organization_id,unit_id,team_id) references public.esf_teams(organization_id,unit_id,id)
);
create index epi_long_files_visit on app.epi_long_files_v1(visit_id);
create index epi_long_files_case on app.epi_long_files_v1(case_id);
create index epi_long_files_actor on app.epi_long_files_v1(created_by);
create index epi_long_files_device on app.epi_long_files_v1(device_id);
do $$ declare t text; begin
 foreach t in array array['epi_long_offline_conflicts_v1','epi_long_offline_receipts_v1','epi_long_files_v1'] loop
 execute format('alter table app.%I enable row level security',t);
 execute format('revoke all on app.%I from public,anon,authenticated',t);
 execute format('create policy rpc_only on app.%I for all to authenticated using(false) with check(false)',t);
 end loop;
end $$;

create function app.epi_long_offline_history_guard_v1() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Histórico imutável.' using errcode='22023'; end if;
 if tg_table_name='epi_long_offline_conflicts_v1' then
 if (to_jsonb(new)-'resolved_at'-'resolved_by') is distinct from (to_jsonb(old)-'resolved_at'-'resolved_by') or old.resolved_at is not null or new.resolved_at is null or new.resolved_by is distinct from auth.uid() then raise exception 'Versões do conflito são imutáveis.' using errcode='22023'; end if;
 else
 if (to_jsonb(new)-'status'-'confirmed_at') is distinct from (to_jsonb(old)-'status'-'confirmed_at') or new.status<>'AVAILABLE' or new.confirmed_at is null then raise exception 'Metadados do anexo são imutáveis.' using errcode='22023'; end if;
 end if;
 return new;
end $$;
revoke all on function app.epi_long_offline_history_guard_v1() from public,anon,authenticated;
create trigger history_guard before update or delete on app.epi_long_offline_conflicts_v1 for each row execute function app.epi_long_offline_history_guard_v1();
create trigger history_guard before update or delete on app.epi_long_files_v1 for each row execute function app.epi_long_offline_history_guard_v1();

create function app.epi_long_offline_guard_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='epi_long_visits_v1' then
 if exists(select 1 from app.epi_long_offline_conflicts_v1 c where c.case_id=new.case_id and c.resolved_at is null) then raise exception 'Caso com conflito pendente. Resolva as duas versões.' using errcode='PT409'; end if;
 if new.status<>'DRAFT' and exists(select 1 from app.epi_long_files_v1 f where f.visit_id=new.id and f.status='PENDING') then raise exception 'Confirme os anexos pendentes antes da transição.' using errcode='22023'; end if;
 else
 if exists(select 1 from app.epi_long_offline_conflicts_v1 c where (c.organization_id,c.unit_id,c.team_id,c.area,c.competency)=(new.organization_id,new.unit_id,new.team_id,new.area,new.competency) and c.resolved_at is null)
 or exists(select 1 from app.epi_long_files_v1 f where (f.organization_id,f.unit_id,f.team_id,f.area,f.competency)=(new.organization_id,new.unit_id,new.team_id,new.area,new.competency) and f.status='PENDING') then raise exception 'Resolva conflitos e confirme anexos antes do fechamento.' using errcode='22023'; end if;
 new.snapshot:=new.snapshot||jsonb_build_object('attachments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'visitId',f.visit_id,'sha256',f.sha256,'byteSize',f.byte_size) order by f.id) from app.epi_long_files_v1 f where (f.organization_id,f.unit_id,f.team_id,f.area,f.competency)=(new.organization_id,new.unit_id,new.team_id,new.area,new.competency) and f.status='AVAILABLE'),'[]'::jsonb));
 end if;
 return new;
end $$;
revoke all on function app.epi_long_offline_guard_v1() from public,anon,authenticated;
create trigger epi_long_offline_conflict_guard before insert or update on app.epi_long_visits_v1 for each row execute function app.epi_long_offline_guard_v1();
create trigger epi_long_offline_snapshot_guard before insert on app.epi_month_snapshots_v1 for each row execute function app.epi_long_offline_guard_v1();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('epi-longitudinal-synthetic','epi-longitudinal-synthetic',false,26214400,array['application/pdf','image/png','image/jpeg']);
create function app.epi_long_storage_access_v1(path text,writing boolean) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from app.epi_long_files_v1 f where f.object_path=path
 and app.epi_access_v1(f.organization_id,f.unit_id,f.team_id,f.area,case when writing then 'save' else 'view' end)
 and (not writing or f.status='PENDING' and f.created_by=auth.uid() and exists(select 1 from public.devices d where d.id=f.device_id and d.user_id=auth.uid() and d.revoked_at is null and d.last_verified_at>now()-interval '72 hours')));
$$;
revoke all on function app.epi_long_storage_access_v1(text,boolean) from public,anon;
grant execute on function app.epi_long_storage_access_v1(text,boolean) to authenticated;
create policy epi_long_private_read on storage.objects for select to authenticated using(bucket_id='epi-longitudinal-synthetic' and app.epi_long_storage_access_v1(name,false));
create policy epi_long_private_insert on storage.objects for insert to authenticated with check(bucket_id='epi-longitudinal-synthetic' and app.epi_long_storage_access_v1(name,true));

create function app.epi_long_offline_v1(req jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid:=(req->>'organizationId')::uuid;unit uuid:=(req->>'unitId')::uuid;device uuid:=(req->>'deviceId')::uuid;kind text:=req->>'kind';
 cmd jsonb:=req->'command';area_key text:=coalesce(req->>'area',cmd->>'area');month_key text:=coalesce(req->>'month',cmd->>'month');team uuid:=coalesce(nullif(req->>'team','')::uuid,(cmd->>'teamId')::uuid);
 cid uuid;entity uuid;op uuid;answer jsonb;data jsonb;monthly jsonb;server jsonb;h text;receipt app.epi_long_offline_receipts_v1;conflict app.epi_long_offline_conflicts_v1;file_row app.epi_long_files_v1;visit app.epi_long_visits_v1;decision text:=req->>'decision';reason text:=btrim(coalesce(req->>'justification',''));
begin
 if kind is null or kind not in ('prepare','command','resolve','attachment-read','attachment-reserve','attachment-finalize') then raise exception 'Operação inválida.' using errcode='22023'; end if;
 if auth.uid() is null or org is distinct from '362db1a9-bfdd-4334-9436-46b1c0117eab'::uuid or unit is null or not exists(select 1 from public.devices d where d.id=device and d.organization_id=org and d.user_id=auth.uid() and d.revoked_at is null and d.last_verified_at>now()-interval '72 hours') then raise exception 'Conta ou dispositivo sem autorização.' using errcode='42501'; end if;
 if kind in ('attachment-read','attachment-finalize') then
 select * into file_row from app.epi_long_files_v1 where id=(req->>'attachmentId')::uuid and organization_id=org and unit_id=unit;
 if not found then raise exception 'Anexo não autorizado.' using errcode='42501'; end if;
 team:=file_row.team_id;area_key:=file_row.area;month_key:=file_row.competency;
 end if;
 if area_key is null or area_key not in ('hanseniase','tuberculose') or month_key is null or month_key !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or team is null or octet_length(req::text)>60000
 or not app.epi_access_v1(org,unit,team,area_key,'view') then raise exception 'Equipe, área ou recorte não autorizado.' using errcode='42501'; end if;
 if kind='prepare' then
 data:=app.epi_long_command_v1(jsonb_build_object('action','load','organizationId',org,'unitId',unit,'area',area_key,'month',month_key,'team',team,'case',req->'case'));
 monthly:=app.epi_long_report_v1(jsonb_build_object('organizationId',org,'unitId',unit,'area',area_key,'month',month_key,'scope','team','team',team,'nominal',false));
 return jsonb_build_object('data',data||jsonb_build_object('cases','[]'::jsonb,'sources','[]'::jsonb,'total',0,'sourceTotal',0),'monthly',monthly->'teams'->0,'preparedAt',now(),'attachments',coalesce((select jsonb_agg(to_jsonb(f)-'object_path') from app.epi_long_files_v1 f where f.visit_id=(data->'visit'->>'id')::uuid),'[]'::jsonb),'conflicts',coalesce((select jsonb_agg(to_jsonb(c)) from app.epi_long_offline_conflicts_v1 c where (c.organization_id,c.unit_id,c.team_id,c.area,c.competency)=(org,unit,team,area_key,month_key) and c.resolved_at is null and (c.actor_id=auth.uid() or app.epi_access_v1(org,unit,team,area_key,'close')) and (c.case_id=nullif(req->>'case','')::uuid or req->>'case' is null and c.client->>'action' like 'month-%')),'[]'::jsonb));
 end if;
 if kind in ('attachment-read','attachment-finalize','attachment-reserve') then
 if kind='attachment-read' then
 insert into app.epi_long_events_v1(organization_id,unit_id,actor_id,case_id,visit_id,action,reason,device_id) values(org,unit,auth.uid(),file_row.case_id,file_row.visit_id,'ATTACHMENT_READ',file_row.id::text,device);
 return to_jsonb(file_row);
 end if;
 if not app.epi_access_v1(org,unit,team,area_key,'save') then raise exception 'Sem permissão de anexo.' using errcode='42501'; end if;
 perform app.epi_month_lock_v1(org,unit,team,area_key,month_key);
 if exists(select 1 from app.epi_months_v1 where (organization_id,unit_id,team_id,area,competency)=(org,unit,team,area_key,month_key) and status='CLOSED') then raise exception 'Competência fechada.' using errcode='22023'; end if;
 if kind='attachment-reserve' then
 select * into visit from app.epi_long_visits_v1 where id=(req->>'visitId')::uuid and (organization_id,unit_id,team_id,area,competency)=(org,unit,team,area_key,month_key);
 if not found or visit.status<>'DRAFT' then raise exception 'Salve e mantenha o acompanhamento em rascunho antes de anexar.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('epi-long-case:'||visit.case_id::text,0));
 if exists(select 1 from app.epi_long_offline_conflicts_v1 where case_id=visit.case_id and resolved_at is null) then raise exception 'Caso em conflito.' using errcode='PT409'; end if;
 perform pg_advisory_xact_lock(hashtextextended('epi-long-file:'||(req->>'attachmentId'),0));
 select * into file_row from app.epi_long_files_v1 where id=(req->>'attachmentId')::uuid;
 if found then
 if file_row.created_by<>auth.uid() or file_row.visit_id<>visit.id or file_row.sha256<>req->>'sha256' or file_row.byte_size<>(req->>'byteSize')::bigint or file_row.file_name<>req->>'fileName' or file_row.content_type<>req->>'contentType' or file_row.device_id<>device then raise exception 'Reserva com outros dados.' using errcode='PT409'; end if;
 else
 insert into app.epi_long_files_v1(id,organization_id,unit_id,team_id,area,competency,case_id,visit_id,device_id,object_path,file_name,content_type,byte_size,sha256,created_by)
 values((req->>'attachmentId')::uuid,org,unit,team,area_key,month_key,visit.case_id,visit.id,device,org::text||'/'||unit::text||'/restricted/'||team::text||'/'||visit.id::text||'/'||(req->>'attachmentId'),req->>'fileName',req->>'contentType',(req->>'byteSize')::bigint,req->>'sha256',auth.uid()) returning * into file_row;
 end if;
 else
 if file_row.created_by<>auth.uid() or file_row.device_id<>device or file_row.sha256 is distinct from req->>'observedSha256' or file_row.byte_size is distinct from (req->>'observedSize')::bigint
 or not exists(select 1 from storage.objects o where o.bucket_id='epi-longitudinal-synthetic' and o.name=file_row.object_path and o.owner_id=auth.uid()::text and (o.metadata->>'size')::bigint=file_row.byte_size and o.metadata->>'mimetype'=file_row.content_type) then raise exception 'Integridade do arquivo não confirmada.' using errcode='22023'; end if;
 update app.epi_long_files_v1 set status='AVAILABLE',confirmed_at=coalesce(confirmed_at,now()) where id=file_row.id returning * into file_row;
 end if;
 insert into app.epi_long_events_v1(organization_id,unit_id,actor_id,case_id,visit_id,action,snapshot,device_id) values(org,unit,auth.uid(),file_row.case_id,file_row.visit_id,upper(kind),to_jsonb(file_row)-'object_path',device);
 return to_jsonb(file_row);
 end if;
 if kind='resolve' then
 select * into conflict from app.epi_long_offline_conflicts_v1 where id=(req->>'conflictId')::uuid and (organization_id,unit_id,team_id,area,competency)=(org,unit,team,area_key,month_key);
 if not found or not app.epi_access_v1(org,unit,team,area_key,'close') or not app.epi_access_v1(org,unit,team,area_key,case when conflict.client->>'action' like 'month-%' then 'close' else conflict.client->>'action' end) then raise exception 'Resolução não autorizada.' using errcode='42501'; end if;
 cmd:=conflict.client;op:=(req->>'operationId')::uuid;
 if decision is null or decision not in ('KEEP_SERVER','RETRY') or length(reason) not between 10 and 500 then raise exception 'Decisão e justificativa obrigatórias.' using errcode='22023'; end if;
 else
 if kind<>'command' or cmd is null or cmd->>'deviceId' is distinct from device::text or cmd->>'area' is distinct from area_key or cmd->>'month' is distinct from month_key or (cmd->>'teamId')::uuid is distinct from team or not app.epi_access_v1(org,unit,team,area_key,case when cmd->>'action' like 'month-%' then 'close' else cmd->>'action' end) then raise exception 'Comando não autorizado.' using errcode='42501'; end if;
 op:=(cmd->>'operationId')::uuid;
 end if;
 if op is null then raise exception 'Operação obrigatória.' using errcode='22023'; end if;
 h:=encode(extensions.digest(req::text,'sha256'),'hex');perform pg_advisory_xact_lock(hashtextextended('epi-long-offline:'||op::text,0));
 select * into receipt from app.epi_long_offline_receipts_v1 where operation_id=op;
 if found then if receipt.actor_id<>auth.uid() or receipt.request_hash<>h then raise exception 'Operação reutilizada.' using errcode='22023'; end if;return receipt.response;end if;
 cid:=(cmd->>'caseId')::uuid;entity:=(cmd->>'entityId')::uuid;
 perform app.epi_month_lock_v1(org,unit,team,area_key,month_key);perform pg_advisory_xact_lock(hashtextextended('epi-long-case:'||cid::text,0));
 select to_jsonb(v) into server from app.epi_long_visits_v1 v where v.case_id=cid and v.competency=month_key and (v.organization_id,v.unit_id,v.team_id,v.area)=(org,unit,team,area_key);
 if cmd->>'action' like 'month-%' then select to_jsonb(m) into server from app.epi_months_v1 m where (m.organization_id,m.unit_id,m.team_id,m.area,m.competency)=(org,unit,team,area_key,month_key);end if;
 if kind='resolve' then
 if conflict.resolved_at is not null then raise exception 'Conflito já resolvido.' using errcode='PT409'; end if;
 if coalesce((server->>'version')::int,0) is distinct from (req->>'expectedServerVersion')::int then return jsonb_build_object('status','conflict','conflictId',conflict.id,'client',conflict.client,'baseline',conflict.baseline,'server',server);end if;
 update app.epi_long_offline_conflicts_v1 set resolved_at=now(),resolved_by=auth.uid() where id=conflict.id;
 if decision='RETRY' then
 answer:=app.epi_long_command_v1(cmd||jsonb_build_object('organizationId',org,'unitId',unit,'operationId',op,'deviceId',device,'expectedVersion',coalesce((server->>'version')::int,0)));
 end if;
 answer:=jsonb_build_object('status','resolved','decision',decision,'conflictId',conflict.id,'result',answer);
 else
 if exists(select 1 from app.epi_long_offline_conflicts_v1 c where c.case_id=cid and c.resolved_at is null) then raise exception 'Caso bloqueado por conflito. Resolva antes de reenviar.' using errcode='22023'; end if;
 begin
 data:=app.epi_long_command_v1(cmd||jsonb_build_object('organizationId',org,'unitId',unit));
 answer:=jsonb_build_object('status','confirmed','result',data);
 exception when sqlstate 'PT409' then
 insert into app.epi_long_offline_conflicts_v1(operation_id,organization_id,unit_id,team_id,area,competency,case_id,actor_id,client,baseline,server)
 values(op,org,unit,team,area_key,month_key,cid,auth.uid(),cmd,req->'baseline',server) returning * into conflict;
 answer:=jsonb_build_object('status','conflict','conflictId',conflict.id,'client',cmd,'baseline',req->'baseline','server',server);
 end;
 end if;
 insert into app.epi_long_offline_receipts_v1(operation_id,actor_id,request_hash,request,response) values(op,auth.uid(),h,req,answer);
 return answer;
end $$;
revoke all on function app.epi_long_offline_v1(jsonb) from public,anon;
grant execute on function app.epi_long_offline_v1(jsonb) to authenticated;
create function public.staging_epi_long_offline_v1(p_request jsonb) returns jsonb language sql security invoker set search_path='' as $$ select app.epi_long_offline_v1(p_request); $$;
revoke all on function public.staging_epi_long_offline_v1(jsonb) from public,anon;
grant execute on function public.staging_epi_long_offline_v1(jsonb) to authenticated;
