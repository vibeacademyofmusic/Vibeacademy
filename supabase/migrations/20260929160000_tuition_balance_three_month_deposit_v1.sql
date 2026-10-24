-- A 3-month term opened from a 50% deposit keeps the month-3 renewal schedule.
-- The unpaid half is a separate payment due in week 1 of month 2
-- (anniversary + 1 month, seven days). The next day is overdue payment debt.
-- A 12-month 50% deposit still uses week 4 of month 3 through week 1 of month 4.

drop function public.tuition_balance_due_window(date);

create function public.tuition_balance_due_window(p_starts_on date, p_duration_months integer default 12)
returns table(window_start date, window_end date)
language sql immutable strict set search_path = public as $$
  select case p_duration_months
      when 3 then (p_starts_on + interval '1 month')::date
      else (p_starts_on + interval '2 months' + interval '21 days')::date
    end,
    case p_duration_months
      when 3 then (p_starts_on + interval '1 month')::date + 6
      else (p_starts_on + interval '3 months' + interval '6 days')::date
    end
  where p_duration_months in (3, 12);
$$;

revoke all on function public.tuition_balance_due_window(date, integer) from public;
grant execute on function public.tuition_balance_due_window(date, integer) to authenticated;

create or replace function public.generate_tuition_reminders()
returns integer
language plpgsql
security definer
set search_path = public as $$
declare
  t record;
  created integer := 0;
  affected integer;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  for t in
    select et.id, et.starts_on, et.duration_months_snapshot, e.id as enrollment_id
    from enrollment_tuition et
    join enrollments e on e.id = et.enrollment_id
    where e.status = 'ACTIVE'
      and et.status in ('ACTIVE', 'SCHEDULED')
      and et.starts_on <= today
      and et.effective_ends_on >= today
      and et.duration_months_snapshot in (3, 12)
    order by et.id
    for update of et, e
  loop
    insert into tuition_reminders(enrollment_tuition_id, event_code, window_start, window_end)
      select t.id, 'RENEWAL_V1', w.window_start, w.window_end
      from tuition_reminder_window(t.starts_on, t.duration_months_snapshot) w
      on conflict (enrollment_tuition_id, event_code) do nothing;
    get diagnostics affected = row_count;
    created := created + affected;
    if t.duration_months_snapshot in (3, 12) and exists (
      select 1
      from registration_applications a
      join registration_deposit_terms d on d.application_id = a.id
      where a.linked_enrollment_id = t.enrollment_id
        and a.status = 'COMPLETED'
        and d.payment_option = 'DEPOSIT_50'
    ) then
      insert into tuition_reminders(enrollment_tuition_id, event_code, window_start, window_end)
        select t.id, 'BALANCE_50_V1', w.window_start, w.window_end
        from tuition_balance_due_window(t.starts_on, t.duration_months_snapshot) w
        on conflict (enrollment_tuition_id, event_code) do nothing;
      get diagnostics affected = row_count;
      created := created + affected;
    end if;
  end loop;
  return created;
end $$;

insert into public.tuition_reminders(enrollment_tuition_id, event_code, window_start, window_end)
select et.id, 'BALANCE_50_V1', w.window_start, w.window_end
from public.enrollment_tuition et
join public.enrollments e on e.id = et.enrollment_id
join lateral public.tuition_balance_due_window(et.starts_on, et.duration_months_snapshot) w on true
where e.status = 'ACTIVE'
  and et.status in ('ACTIVE', 'SCHEDULED')
  and et.starts_on <= (timezone('Asia/Ho_Chi_Minh', now()))::date
  and et.effective_ends_on >= (timezone('Asia/Ho_Chi_Minh', now()))::date
  and et.duration_months_snapshot in (3, 12)
  and exists (
    select 1
    from public.registration_applications a
    join public.registration_deposit_terms d on d.application_id = a.id
    where a.linked_enrollment_id = e.id
      and a.status = 'COMPLETED'
      and d.payment_option = 'DEPOSIT_50'
  )
on conflict (enrollment_tuition_id, event_code) do nothing;

create or replace view public.tuition_reminder_operations with (security_invoker = true) as
select r.id, r.enrollment_tuition_id, r.window_start, r.window_end, r.status, r.marked_at, r.reason,
  et.enrollment_id, et.tuition_plan_id, et.starts_on, et.effective_ends_on, et.plan_name_snapshot,
  et.branch_id_snapshot, et.branch_name_snapshot, et.amount, et.currency, e.student_id, s.full_name, s.student_code,
  r.event_code, et.duration_months_snapshot,
  case
    when r.event_code = 'BALANCE_50_V1' and et.duration_months_snapshot = 12 then r.window_start
    when r.event_code = 'RENEWAL_V1' and et.duration_months_snapshot = 3 then r.window_start + 14
    else null
  end as red_on
from tuition_reminders r
join enrollment_tuition et on et.id = r.enrollment_tuition_id
join enrollments e on e.id = et.enrollment_id
join students s on s.id = e.student_id;

create or replace function public.tuition_reminder_kpis()
returns jsonb
language plpgsql
security invoker
set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  result jsonb;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  select jsonb_build_object(
    'upcoming', count(*) filter (where r.status = 'PENDING' and r.window_start > today),
    'payment', count(*) filter (where r.status = 'PENDING' and r.event_code = 'BALANCE_50_V1'
      and et.duration_months_snapshot = 3 and r.window_start <= today and r.window_end >= today),
    'week', count(*) filter (where r.status = 'PENDING' and r.event_code <> 'BALANCE_50_V1'
      and r.window_start <= today and r.window_end >= today
      and (
        (case when r.event_code = 'RENEWAL_V1' and et.duration_months_snapshot = 3 then r.window_start + 14 else null end) is null
        or (case when r.event_code = 'RENEWAL_V1' and et.duration_months_snapshot = 3 then r.window_start + 14 else null end) > today
      )),
    'red', count(*) filter (where r.status = 'PENDING' and r.window_end >= today
      and (case
        when r.event_code = 'BALANCE_50_V1' and et.duration_months_snapshot = 12 then r.window_start
        when r.event_code = 'RENEWAL_V1' and et.duration_months_snapshot = 3 then r.window_start + 14
        else null
      end) <= today),
    'overdue', count(*) filter (where r.status = 'PENDING' and r.window_end < today),
    'sent', count(*) filter (where r.status = 'SENT'
      and (r.marked_at at time zone 'Asia/Ho_Chi_Minh')::date >= date_trunc('month', today)::date
      and (r.marked_at at time zone 'Asia/Ho_Chi_Minh')::date < (date_trunc('month', today) + interval '1 month')::date)
  ) into result
  from tuition_reminders r
  join enrollment_tuition et on et.id = r.enrollment_tuition_id;
  return result;
end $$;
