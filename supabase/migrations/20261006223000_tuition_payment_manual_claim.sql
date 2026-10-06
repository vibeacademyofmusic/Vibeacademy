-- Staff claim for one tuition payment ZBS. Does not send, does not mark paid,
-- and does not touch registration or confirmation templates.

create or replace function public.claim_tuition_payment_notice(p_case uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare renewal public.tuition_renewal_cases%rowtype;
begin
  if not public.tuition_renewal_authorized((select branch_id from public.tuition_renewal_cases where id = p_case)) then
    raise exception 'TUITION_RENEWAL_UNAUTHORIZED';
  end if;
  select * into renewal from public.tuition_renewal_cases where id = p_case for update;
  if not found then raise exception 'TUITION_RENEWAL_NOT_FOUND'; end if;
  if renewal.zbs_status = 'SENT' then return 'ALREADY_ACCEPTED'; end if;
  if renewal.zbs_error_code = 'ACCEPTANCE_UNKNOWN' then return 'UNKNOWN_NOT_RETRIED'; end if;
  if renewal.zbs_status = 'QUEUED' then return 'NOT_CLAIMED'; end if;
  if renewal.zbs_status not in ('NONE', 'AWAITING_TEMPLATE', 'HELD', 'FAILED') then return 'NOT_CLAIMED'; end if;
  update public.tuition_renewal_cases
  set zbs_status = 'QUEUED',
      zbs_error_code = 'CLAIMED',
      zbs_attempts = zbs_attempts + 1,
      zbs_attempted_at = clock_timestamp(),
      last_event = 'ZBS_CLAIMED',
      updated_at = clock_timestamp()
  where id = renewal.id
    and zbs_status = renewal.zbs_status
    and state not in ('DEPOSIT_PAID', 'PAID');
  if not found then return 'NOT_CLAIMED'; end if;
  return 'CLAIMED';
end $$;

create or replace function public.finish_tuition_payment_notice(
  p_case uuid, p_outcome text, p_error text, p_tracking text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare renewal public.tuition_renewal_cases%rowtype;
begin
  if not public.tuition_renewal_authorized((select branch_id from public.tuition_renewal_cases where id = p_case)) then
    raise exception 'TUITION_RENEWAL_UNAUTHORIZED';
  end if;
  if p_outcome not in ('ACCEPTED', 'UNKNOWN', 'REJECTED') then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_error is not null and p_error !~ '^[A-Z0-9_]{1,80}$' then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_tracking is not null and p_tracking !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  select * into renewal from public.tuition_renewal_cases where id = p_case for update;
  if not found or renewal.zbs_status <> 'QUEUED' then return 'NOT_CLAIMED'; end if;
  if p_outcome = 'ACCEPTED' then
    update public.tuition_renewal_cases
    set zbs_status = 'SENT', zbs_error_code = null, zbs_tracking_id = coalesce(p_tracking, zbs_tracking_id),
        state = case when state in ('DEPOSIT_PAID', 'PAID') then state else 'AWAITING_PAYMENT' end,
        last_event = 'ZBS_SENT', updated_at = clock_timestamp()
    where id = renewal.id;
  elsif p_outcome = 'UNKNOWN' then
    update public.tuition_renewal_cases
    set zbs_status = 'FAILED', zbs_error_code = 'ACCEPTANCE_UNKNOWN',
        last_event = 'ZBS_UNKNOWN', updated_at = clock_timestamp()
    where id = renewal.id;
  else
    update public.tuition_renewal_cases
    set zbs_status = 'HELD', zbs_error_code = coalesce(p_error, 'REJECTED'),
        last_event = 'ZBS_REJECTED', updated_at = clock_timestamp()
    where id = renewal.id;
  end if;
  insert into public.tuition_renewal_events(case_id, event_type, actor_id, metadata)
  values (renewal.id, 'ZBS_PAYMENT', auth.uid(), jsonb_build_object('status', p_outcome, 'error_code', p_error));
  return p_outcome;
end $$;

revoke all on function public.claim_tuition_payment_notice(uuid) from public, anon;
revoke all on function public.finish_tuition_payment_notice(uuid, text, text, text) from public, anon;
grant execute on function public.claim_tuition_payment_notice(uuid) to authenticated;
grant execute on function public.finish_tuition_payment_notice(uuid, text, text, text) to authenticated;
