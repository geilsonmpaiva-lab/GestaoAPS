-- Atomic, authorized batch import. Existing units are never overwritten.
create or replace function public.import_cnes_units(
 p_operation_id uuid,p_organization_id uuid,p_municipality text,p_uf text,p_type text,p_selection text[],p_rows jsonb default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 prior public.idempotency_keys; fingerprint text; selected text[]; row jsonb;
 existing public.units; created jsonb:='[]'; skipped jsonb:='[]'; answer jsonb; item jsonb; code text;
 uf_code text;
begin
 if auth.uid() is null or not exists(select 1 from public.memberships m join public.profiles p on p.id=m.user_id and p.status='ACTIVE'
   where m.user_id=auth.uid() and m.organization_id=p_organization_id and m.unit_id is null
   and m.role in ('ADMIN_SISTEMA','GESTOR_ORGANIZACAO') and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())
   and ('*'=any(m.domains) or 'administracao'=any(m.domains)) and ('criar'=any(m.operations) or m.role='ADMIN_SISTEMA'))
   or not exists(select 1 from public.organizations where id=p_organization_id and status='ACTIVE' and deleted_at is null) then
   raise exception 'Sem autorização para importar unidades nesta organização.' using errcode='42501';
 end if;
 uf_code:=('{"AC":"12","AL":"27","AP":"16","AM":"13","BA":"29","CE":"23","DF":"53","ES":"32","GO":"52","MA":"21","MT":"51","MS":"50","MG":"31","PA":"15","PB":"25","PR":"41","PE":"26","PI":"22","RJ":"33","RN":"24","RS":"43","RO":"11","RR":"14","SC":"42","SP":"35","SE":"28","TO":"17"}'::jsonb)->>p_uf;
 if p_operation_id is null or uf_code is null or coalesce(p_municipality,'') !~ '^[0-9]{6}$' or left(p_municipality,2)<>uf_code
   or p_type is null or p_type not in ('1','2') or coalesce(cardinality(p_selection),0) not between 1 and 20
   or array_position(p_selection,null) is not null or exists(select 1 from unnest(p_selection) c where c !~ '^[0-9]{7}$') then
   raise exception 'Seleção CNES inválida.' using errcode='22023';
 end if;
 select array_agg(distinct c order by c) into selected from unnest(p_selection) c;
 if cardinality(selected)<>cardinality(p_selection) then raise exception 'CNES repetido na seleção.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
 fingerprint:=encode(extensions.digest(jsonb_build_array('import_cnes_units',p_organization_id,p_municipality,p_uf,p_type,selected)::text,'sha256'),'hex');
 select * into prior from public.idempotency_keys where operation_id=p_operation_id;
 if found then
   if prior.user_id is distinct from auth.uid() or prior.organization_id is distinct from p_organization_id or prior.request_hash is distinct from fingerprint then
     raise exception 'Operação já utilizada com outros dados.' using errcode='22023';
   end if;
   return prior.response;
 end if;
 -- Retry lookup happens after authorization, before any dependency on the public API.
 if p_rows is null then return null; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or octet_length(p_rows::text)>100000 then raise exception 'Dados CNES inválidos.' using errcode='22023'; end if;
 if jsonb_array_length(p_rows)<>cardinality(selected) or
   (select array_agg(distinct r->>'cnes' order by r->>'cnes') from jsonb_array_elements(p_rows) r) is distinct from selected then
   raise exception 'Os dados não correspondem à seleção.' using errcode='22023';
 end if;
 -- Lock in a stable order, shared with manual registration, preventing duplicate races.
 foreach code in array selected loop
   perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||code,0));
 end loop;
 for row in select value from jsonb_array_elements(p_rows) order by value->>'cnes' loop
   if jsonb_typeof(row) is distinct from 'object' or length(trim(coalesce(row->>'name',''))) not between 2 and 160
     or row->>'municipality' is distinct from p_municipality or row->>'type' is distinct from p_type
     or jsonb_typeof(row->'address') is distinct from 'object' or row->'address'->>'state' is distinct from p_uf
     or length(coalesce(row->'address'->>'street',''))>240 or length(coalesce(row->'address'->>'city','')) not between 1 and 120
     or length(coalesce(row->'address'->>'neighborhood',''))>160
     or coalesce(row->'address'->>'postalCode','') !~ '^([0-9]{8})?$'
     or (row->>'sourceUpdatedAt' is not null and row->>'sourceUpdatedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
     raise exception 'Campos CNES inválidos. Nenhuma unidade deste lote foi cadastrada.' using errcode='22023';
   end if;
   select * into existing from public.units where organization_id=p_organization_id and cnes=row->>'cnes' and deleted_at is null order by id limit 1;
   if found then
     skipped:=skipped||jsonb_build_array(jsonb_build_object('id',existing.id,'cnes',existing.cnes,'name',existing.name));
   else
     item:=public.register_admin_unit(gen_random_uuid(),jsonb_build_object('organizationId',p_organization_id,'name',row->>'name','cnes',row->>'cnes',
       'address',jsonb_build_object('street',row->'address'->>'street','city',row->'address'->>'city','state',p_uf,
         'postalCode',row->'address'->>'postalCode','neighborhood',row->'address'->>'neighborhood',
         'source',jsonb_build_object('provider','CNES/MS','municipalityCode',p_municipality,'type',p_type,'updatedAt',row->>'sourceUpdatedAt','importedAt',now(),'operationId',p_operation_id))));
     created:=created||jsonb_build_array(jsonb_build_object('id',item->>'id','name',item->>'name','cnes',row->>'cnes'));
   end if;
 end loop;
 answer:=jsonb_build_object('created',created,'skipped',skipped);
 insert into public.idempotency_keys(operation_id,user_id,organization_id,request_hash,response) values(p_operation_id,auth.uid(),p_organization_id,fingerprint,answer);
 return answer;
end; $$;
revoke all on function public.import_cnes_units(uuid,uuid,text,text,text,text[],jsonb) from public,anon;
grant execute on function public.import_cnes_units(uuid,uuid,text,text,text,text[],jsonb) to authenticated;
