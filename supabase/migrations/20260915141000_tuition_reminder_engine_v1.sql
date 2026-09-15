-- Calendar anniversary semantics (PostgreSQL month-end clamping):
-- 3 months: [starts_on + 1 month, that date + 6 days].
-- 12 months: [starts_on + 9 months, starts_on + 10 months - 1 day].
-- Eligibility: ACTIVE enrollment, ACTIVE/SCHEDULED term whose entitlement
-- contains today's Vietnam date. Future terms and expired terms are not generated.
-- Once generated, pending reminders remain overdue until handled or invalidated.
create function public.tuition_reminder_window(p_starts_on date,p_duration_months integer)
returns table(window_start date,window_end date) language sql immutable strict set search_path=public as $$
  select (p_starts_on+make_interval(months=>case p_duration_months when 3 then 1 else 9 end))::date,
    case p_duration_months when 3 then (p_starts_on+interval '1 month')::date+6
    else (p_starts_on+interval '10 months')::date-1 end
  where p_duration_months in (3,12);
$$;
create table public.tuition_reminders (
  id uuid primary key default gen_random_uuid(),
  enrollment_tuition_id uuid not null references public.enrollment_tuition(id) on delete restrict,
  event_code text not null default 'RENEWAL_V1' check(event_code='RENEWAL_V1'),
  window_start date not null,
  window_end date not null check(window_end>=window_start),
  status text not null default 'PENDING' check(status in ('PENDING','SENT','SKIPPED','CANCELLED')),
  created_at timestamptz not null default now(),
  marked_by uuid references auth.users(id),
  marked_at timestamptz,
  reason text,
  unique(enrollment_tuition_id,event_code),
  check ((status='PENDING' and marked_at is null and marked_by is null and reason is null)
    or (status<>'PENDING' and marked_at is not null and nullif(btrim(reason),'') is not null))
);
create index tuition_reminders_pending_window_idx on public.tuition_reminders(window_start,window_end) where status='PENDING';
alter table public.tuition_reminders enable row level security;
revoke all on public.tuition_reminders from anon,authenticated;
grant select on public.tuition_reminders to authenticated;
create policy super_admin_select_tuition_reminders on public.tuition_reminders for select to authenticated using(public.has_role('SUPER_ADMIN'));

create function public.guard_tuition_reminder() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='DELETE' then raise exception 'Reminder history cannot be deleted'; end if;
  if new.enrollment_tuition_id<>old.enrollment_tuition_id or new.event_code<>old.event_code
    or new.window_start<>old.window_start or new.window_end<>old.window_end or new.created_at<>old.created_at
    or new.id<>old.id then raise exception 'Reminder identity is immutable'; end if;
  -- No delivery provider/manual send workflow in V1: SENT cannot be fabricated.
  if old.status<>'PENDING' or new.status not in ('SKIPPED','CANCELLED') then raise exception 'Invalid reminder transition'; end if;
  return new;
end $$;
create trigger guard_tuition_reminder before update or delete on public.tuition_reminders for each row execute function public.guard_tuition_reminder();

create function public.generate_tuition_reminders() returns integer language plpgsql security definer set search_path=public as $$
declare t record; created integer:=0; affected integer; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'SUPER_ADMIN role required'; end if;
  for t in select et.id,et.starts_on,et.duration_months_snapshot from enrollment_tuition et
    join enrollments e on e.id=et.enrollment_id
    where e.status='ACTIVE' and et.status in ('ACTIVE','SCHEDULED') and et.starts_on<=today and et.effective_ends_on>=today
      and et.duration_months_snapshot in (3,12)
    order by et.id for update of et, e
  loop
    insert into tuition_reminders(enrollment_tuition_id,window_start,window_end)
      select t.id,w.window_start,w.window_end from tuition_reminder_window(t.starts_on,t.duration_months_snapshot) w
      on conflict(enrollment_tuition_id,event_code) do nothing;
    get diagnostics affected=row_count; created:=created+affected;
  end loop;
  return created;
end $$;

create function public.resolve_tuition_reminder(p_reminder_id uuid,p_status text,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'SUPER_ADMIN role required'; end if;
  if p_status is null or p_status not in ('SKIPPED','CANCELLED') or nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then
    raise exception 'Invalid reminder resolution'; end if;
  update tuition_reminders set status=p_status,reason=btrim(p_reason),marked_by=auth.uid(),marked_at=now()
    where id=p_reminder_id and status='PENDING';
  if not found then raise exception 'Pending reminder not found'; end if;
  return p_reminder_id;
end $$;

-- Cancellation/completion cannot leave actionable reminders behind.
create function public.invalidate_tuition_reminders() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='enrollment_tuition' and new.status in ('COMPLETED','CANCELLED') then
    update tuition_reminders set status='CANCELLED',marked_at=now(),marked_by=auth.uid(),reason='Kỳ học phí đã kết thúc hoặc bị hủy'
      where enrollment_tuition_id=new.id and status='PENDING';
  elsif tg_table_name='enrollments' and new.status<>'ACTIVE' then
    update tuition_reminders set status='CANCELLED',marked_at=now(),marked_by=auth.uid(),reason='Ghi danh không còn hoạt động'
      where enrollment_tuition_id in (select id from enrollment_tuition where enrollment_id=new.id) and status='PENDING';
  end if;
  return new;
end $$;
create trigger invalidate_tuition_reminders after update of status on public.enrollment_tuition for each row execute function public.invalidate_tuition_reminders();
create trigger invalidate_enrollment_reminders after update of status on public.enrollments for each row execute function public.invalidate_tuition_reminders();

-- Live context avoids stale financial snapshots while preserving event schedule/history.
create view public.tuition_reminder_operations with(security_invoker=true) as
select r.id,r.enrollment_tuition_id,r.window_start,r.window_end,r.status,r.marked_at,r.reason,
  et.enrollment_id,et.tuition_plan_id,et.starts_on,et.effective_ends_on,et.plan_name_snapshot,
  et.branch_id_snapshot,et.branch_name_snapshot,et.amount,et.currency,e.student_id,s.full_name,s.student_code
from tuition_reminders r join enrollment_tuition et on et.id=r.enrollment_tuition_id
join enrollments e on e.id=et.enrollment_id join students s on s.id=e.student_id;
grant select on public.tuition_reminder_operations to authenticated;

create function public.tuition_reminder_kpis() returns jsonb language plpgsql security invoker set search_path=public as $$
declare today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; result jsonb;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'SUPER_ADMIN role required'; end if;
  select jsonb_build_object(
    'week',count(*) filter(where status='PENDING' and window_start<=date_trunc('week',today)::date+6 and window_end>=date_trunc('week',today)::date),
    'upcoming',count(*) filter(where status='PENDING' and window_start>today and window_start<(date_trunc('month',today)+interval '1 month')::date),
    'overdue',count(*) filter(where status='PENDING' and window_end<today),
    'sent',count(*) filter(where status='SENT' and (marked_at at time zone 'Asia/Ho_Chi_Minh')::date>=date_trunc('month',today)::date
      and (marked_at at time zone 'Asia/Ho_Chi_Minh')::date<(date_trunc('month',today)+interval '1 month')::date)) into result from tuition_reminders;
  return result;
end $$;
revoke all on function public.generate_tuition_reminders(),public.resolve_tuition_reminder(uuid,text,text),public.tuition_reminder_kpis(),public.invalidate_tuition_reminders(),public.guard_tuition_reminder() from public;
grant execute on function public.generate_tuition_reminders(),public.resolve_tuition_reminder(uuid,text,text),public.tuition_reminder_kpis() to authenticated;
