-- Waiting for the payment template to be turned on is not a failed attempt.
-- A crashed worker is reclaimed by claim_tuition_renewal_automation once its
-- two-minute lock expires; this function only keeps that wait from becoming HELD.

create or replace function public.finish_tuition_renewal_automation(p_reminder uuid, p_status text, p_step text, p_error text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rec public.tuition_renewal_automation;
  waiting boolean := p_status = 'PENDING' and p_error = 'ZBS_SEND_DISABLED';
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'AUTOMATION_SERVER_ONLY'; end if;
  if p_status not in ('PENDING','DONE','HELD') then raise exception 'AUTOMATION_STATUS_REJECTED'; end if;
  select * into rec from public.tuition_renewal_automation where reminder_id = p_reminder for update;
  if not found then return 'MISSING'; end if;
  update public.tuition_renewal_automation
  set status = case
        when waiting then 'PENDING'
        when p_status = 'PENDING' and rec.attempts >= 6 then 'HELD'
        else p_status
      end,
      attempts = case when waiting then greatest(rec.attempts - 1, 0) else rec.attempts end,
      step = left(p_step, 40), error_code = left(p_error, 80), locked_until = null,
      next_attempt_at = case
        when waiting then clock_timestamp() + interval '1 hour'
        else clock_timestamp() + make_interval(secs => least(1800, 60 * power(2, least(rec.attempts, 5))::integer))
      end,
      updated_at = clock_timestamp()
  where reminder_id = p_reminder;
  return p_status;
end $$;
