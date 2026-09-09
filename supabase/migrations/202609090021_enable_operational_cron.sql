-- Hosted operational scheduler. The notification function is idempotent and deduplicates alerts.
create extension if not exists pg_cron;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='sgc-refresh-due-notifications' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'sgc-refresh-due-notifications',
    '*/15 * * * *',
    'select public.refresh_due_notifications()'
  );
end;
$$;
