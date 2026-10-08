-- Explicit staging activation only; not an automatic repository migration.
-- Owner must first identify this database as staging:
-- ALTER DATABASE postgres SET vibe.environment = 'staging';
-- Reconnect, enable pg_cron through the staging dashboard, then apply this file.
begin;
do $$ begin
  if current_setting('vibe.environment', true) is distinct from 'staging' then
    raise exception 'Explicit staging database acknowledgement required';
  end if;
  if not exists(select 1 from pg_extension where extname='pg_cron') then
    raise exception 'Enable pg_cron in the approved staging project first';
  end if;
  if to_regprocedure('public.replay_pending_tuition_zalo_clicks(text,integer)') is null then
    raise exception 'Durability migration missing';
  end if;
end $$;
select cron.schedule('vibe-staging-tuition-replay', '* * * * *',
  $job$select public.replay_pending_tuition_zalo_clicks('4520912928458797082',20);$job$);
commit;
-- Monitor: select status,start_time,end_time,return_message from cron.job_run_details
-- where jobid=(select jobid from cron.job where jobname='vibe-staging-tuition-replay')
-- order by start_time desc limit 20;
-- Rollback: select cron.unschedule('vibe-staging-tuition-replay');
-- This job never sends, rotates credentials, or calls response/get.
