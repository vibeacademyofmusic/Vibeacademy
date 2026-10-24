-- Persist the dispatcher hold. HELD means the payment template is configured and sending stays off.
-- AWAITING_TEMPLATE remains the missing-template status. Historical rows are not rewritten.

alter table public.tuition_renewal_cases drop constraint tuition_renewal_cases_zbs_status_check;
alter table public.tuition_renewal_cases add constraint tuition_renewal_cases_zbs_status_check
  check (zbs_status in ('NONE', 'AWAITING_TEMPLATE', 'HELD', 'QUEUED', 'SENT', 'FAILED'));

create or replace function public.note_tuition_renewal_notice(
  p_case uuid, p_kind text, p_status text, p_error_code text, p_tracking text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare renewal public.tuition_renewal_cases%rowtype;
begin
  if not public.tuition_renewal_authorized((select branch_id from public.tuition_renewal_cases where id = p_case))
     and not coalesce(public.momo_service_request(), false) then raise exception 'TUITION_RENEWAL_UNAUTHORIZED'; end if;
  if p_kind not in ('PAYMENT', 'CONFIRMATION') then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_kind = 'CONFIRMATION' and p_status = 'HELD' then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_status not in ('AWAITING_TEMPLATE', 'HELD', 'QUEUED', 'SENT', 'FAILED') then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_tracking is not null and p_tracking !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  select * into renewal from public.tuition_renewal_cases where id = p_case for update;
  if not found then raise exception 'TUITION_RENEWAL_NOT_FOUND'; end if;
  if p_kind = 'PAYMENT' then
    update public.tuition_renewal_cases set zbs_status = p_status, zbs_error_code = p_error_code, zbs_tracking_id = coalesce(p_tracking, zbs_tracking_id),
      zbs_attempts = zbs_attempts + 1, zbs_attempted_at = clock_timestamp(),
      state = case
        when state in ('DEPOSIT_PAID', 'PAID') then state
        when p_status = 'SENT' then 'AWAITING_PAYMENT'
        when p_status = 'HELD' then 'AWAITING_ZBS'
        when p_status = 'FAILED' then 'AWAITING_ZBS'
        else 'AWAITING_TEMPLATE' end,
      last_event = 'ZBS_' || p_status, updated_at = clock_timestamp()
    where id = renewal.id;
  else
    update public.tuition_renewal_cases set confirmation_status = case when p_status = 'QUEUED' then 'AWAITING_TEMPLATE' else p_status end,
      last_event = 'CONFIRMATION_' || p_status, updated_at = clock_timestamp() where id = renewal.id;
  end if;
  insert into public.tuition_renewal_events(case_id, event_type, actor_id, metadata)
  values (renewal.id, case when p_kind = 'PAYMENT' then 'ZBS_PAYMENT' else 'ZBS_CONFIRMATION' end, auth.uid(),
    jsonb_build_object('status', p_status, 'error_code', p_error_code));
  return p_status;
end $$;
