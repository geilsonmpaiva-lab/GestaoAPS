-- Supabase installs pgcrypto in extensions. Earlier domain commands pinned
-- public,pg_temp and could not resolve digest during their first real write.
-- Preserve installed bodies, ownership and grants; only fix name resolution
-- for the application commands present in the versioned migrations.
do $$
declare command record;
begin
  for command in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname=any(array[
        'approve_protocol_version','publish_protocol_version','complete_execution',
        'open_measurement_plan','complete_meeting','create_indicator_formula_version',
        'bind_protocol_indicator','complete_action','record_plan_effectiveness',
        'start_meeting','convert_referral_to_action','publish_audit_model',
        'start_audit_execution','complete_audit_execution','move_asset','record_stock_movement',
        'transition_maintenance_order','analyze_safety_event','respond_ombudsman_case',
        'create_knowledge_version','transition_knowledge_version','create_protocol_version',
        'submit_protocol_review','start_protocol_execution','record_critical_analysis','update_action',
        'start_asset_inventory','complete_asset_inventory','complete_stock_inventory',
        'apply_sync_batch','save_protocol_form','save_execution_responses','create_mvp_record'
      ])
      and p.prosrc ~ '\mdigest\s*\('
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', command.signature);
  end loop;
end; $$;
