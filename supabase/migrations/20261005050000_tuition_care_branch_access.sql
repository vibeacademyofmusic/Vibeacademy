-- Branch-scoped tuition care. There is no per-employee permission table, and
-- FINANCE also holds finance.cash.record, so a dedicated role receives only
-- reminder view and renewal preparation. A null branch assignment is not global.

insert into public.permissions(code, name, module, description)
values (
  'tuition.reminder.view',
  'Xem nhắc học phí trong chi nhánh được giao',
  'tuition',
  'View tuition reminders for one assigned branch'
)
on conflict (code) do nothing;

insert into public.roles(code, name, is_system)
values ('TUITION_CARE', 'Chăm sóc học phí', true)
on conflict (code) do update
set name = excluded.name, is_system = true;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission
  on permission.code in ('tuition.reminder.view', 'tuition.renewal.prepare')
where role.code = 'TUITION_CARE'
on conflict do nothing;

create or replace function public.tuition_actor_is_active_employee()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.employees employee
    join lateral (
      select version.employment_status
      from public.employee_versions version
      where version.employee_id = employee.id
        and version.effective_on <= (timezone('Asia/Ho_Chi_Minh', now()))::date
      order by version.effective_on desc, version.version desc
      limit 1
    ) current_version on current_version.employment_status = 'ACTIVE'
    where employee.profile_id = auth.uid()
  )
$$;

create or replace function public.tuition_branch_granted(p_branch uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_branch is not null
    and public.account_is_active()
    and (
      public.has_role('SUPER_ADMIN')
      or (
        public.tuition_actor_is_active_employee()
        and exists (
          select 1
          from public.user_roles assignment
          join public.roles role on role.id = assignment.role_id
          join public.role_permissions grant_row on grant_row.role_id = role.id
          join public.permissions permission on permission.id = grant_row.permission_id
          where assignment.user_id = auth.uid()
            and assignment.is_active
            and assignment.branch_id = p_branch
            and role.code <> 'SUPER_ADMIN'
            and permission.code = p_permission
            and (assignment.valid_from is null or assignment.valid_from <= now())
            and (assignment.valid_until is null or assignment.valid_until > now())
        )
      )
    )
$$;

create or replace function public.tuition_care_may_enter()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.branches branch
    where public.tuition_branch_granted(branch.id, 'tuition.reminder.view')
  )
$$;

create or replace function public.tuition_granted_branches(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select branch.id
  from public.branches branch
  where public.tuition_branch_granted(branch.id, p_permission)
$$;

create or replace function public.tuition_visible_branches()
returns table(id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select branch.id, branch.name
  from public.branches branch
  where public.tuition_branch_granted(branch.id, 'tuition.reminder.view')
  order by branch.name, branch.id
$$;

create or replace function public.tuition_reminder_prepare_allowed(p_reminder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.tuition_branch_granted(source.branch_id_snapshot, 'tuition.renewal.prepare')
  from public.tuition_reminders reminder
  join public.enrollment_tuition source on source.id = reminder.enrollment_tuition_id
  where reminder.id = p_reminder
$$;

create or replace function public.tuition_renewal_authorized(p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.tuition_branch_granted(p_branch, 'tuition.renewal.prepare')
$$;

create or replace function public.list_tuition_reminders(
  p_branch uuid,
  p_plan uuid,
  p_state text,
  p_reply text,
  p_limit integer,
  p_offset integer,
  p_reminder uuid default null
)
returns table(
  id uuid,
  enrollment_tuition_id uuid,
  window_start date,
  window_end date,
  status text,
  reason text,
  marked_at timestamptz,
  tuition_plan_id uuid,
  starts_on date,
  effective_ends_on date,
  plan_name_snapshot text,
  branch_id_snapshot uuid,
  branch_name_snapshot text,
  amount numeric,
  currency text,
  full_name text,
  student_code text,
  event_code text,
  duration_months_snapshot integer,
  red_on date,
  reply_choice text,
  reply_submit_time timestamptz,
  reply_needs_review boolean,
  contact_note text,
  contact_noted_at timestamptz,
  contact_noted_by_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 or p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'TUITION_REMINDER_UNAUTHORIZED';
  end if;
  if not public.tuition_care_may_enter() then
    raise exception 'TUITION_REMINDER_UNAUTHORIZED';
  end if;
  if p_branch is not null and not public.tuition_branch_granted(p_branch, 'tuition.reminder.view') then
    return;
  end if;
  return query
  select reminder.id, reminder.enrollment_tuition_id, reminder.window_start, reminder.window_end, reminder.status,
    reminder.reason, reminder.marked_at, source.tuition_plan_id, source.starts_on, source.effective_ends_on,
    source.plan_name_snapshot, source.branch_id_snapshot, source.branch_name_snapshot, source.amount, source.currency,
    student.full_name, student.student_code, reminder.event_code, source.duration_months_snapshot,
    case
      when reminder.event_code = 'BALANCE_50_V1' and source.duration_months_snapshot = 12 then reminder.window_start
      when reminder.event_code = 'RENEWAL_V1' and source.duration_months_snapshot = 3 then reminder.window_start + 14
      else null
    end,
    reply.reply_choice, reply.submit_time, reply.needs_review, reply.contact_note, reply.contact_noted_at,
    note_author.full_name
  from public.tuition_reminders reminder
  join public.enrollment_tuition source on source.id = reminder.enrollment_tuition_id
  join public.enrollments enrollment on enrollment.id = source.enrollment_id
  join public.students student on student.id = enrollment.student_id
  left join public.tuition_zalo_reply_states reply on reply.reminder_id = reminder.id
  left join public.profiles note_author on note_author.id = reply.contact_noted_by
  where public.tuition_branch_granted(source.branch_id_snapshot, 'tuition.reminder.view')
    and (p_branch is null or source.branch_id_snapshot = p_branch)
    and (p_plan is null or source.tuition_plan_id = p_plan)
    and (p_reminder is null or reminder.id = p_reminder)
    and (
      p_state is null or p_state = ''
      or (p_state in ('sent', 'skipped', 'cancelled') and reminder.status = upper(p_state))
      or (p_state = 'upcoming' and reminder.status = 'PENDING' and reminder.window_start > today)
      or (p_state = 'overdue' and reminder.status = 'PENDING' and reminder.window_end < today)
      or (
        p_state = 'payment' and reminder.status = 'PENDING' and reminder.event_code = 'BALANCE_50_V1'
        and source.duration_months_snapshot = 3 and reminder.window_start <= today and reminder.window_end >= today
      )
      or (
        p_state = 'due' and reminder.status = 'PENDING' and reminder.event_code is distinct from 'BALANCE_50_V1'
        and reminder.window_start <= today and reminder.window_end >= today
        and (
          (case when reminder.event_code = 'RENEWAL_V1' and source.duration_months_snapshot = 3 then reminder.window_start + 14 else null end) is null
          or (case when reminder.event_code = 'RENEWAL_V1' and source.duration_months_snapshot = 3 then reminder.window_start + 14 else null end) > today
        )
      )
      or (
        p_state = 'red' and reminder.status = 'PENDING' and reminder.window_end >= today
        and (case
          when reminder.event_code = 'BALANCE_50_V1' and source.duration_months_snapshot = 12 then reminder.window_start
          when reminder.event_code = 'RENEWAL_V1' and source.duration_months_snapshot = 3 then reminder.window_start + 14
          else null
        end) <= today
      )
    )
    and (
      p_reply is null or p_reply = ''
      or (p_reply = 'yes' and reply.reply_choice = 'CONTINUE')
      or (p_reply = 'contact' and reply.reply_choice = 'CONTACT')
      or (p_reply = 'no' and reply.reply_choice = 'STOP')
      or (p_reply = 'pending' and reply.reply_choice is null)
    )
  order by reminder.window_start, reminder.id
  limit p_limit offset p_offset;
end $$;

create or replace function public.tuition_reminder_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  result jsonb;
begin
  if not public.tuition_care_may_enter() then
    raise exception 'TUITION_REMINDER_UNAUTHORIZED';
  end if;
  select jsonb_build_object(
    'upcoming', count(*) filter (where reminder.status = 'PENDING' and reminder.window_start > today),
    'payment', count(*) filter (where reminder.status = 'PENDING' and reminder.event_code = 'BALANCE_50_V1'
      and source.duration_months_snapshot = 3 and reminder.window_start <= today and reminder.window_end >= today),
    'week', count(*) filter (where reminder.status = 'PENDING' and reminder.event_code <> 'BALANCE_50_V1'
      and reminder.window_start <= today and reminder.window_end >= today
      and (
        (case when reminder.event_code = 'RENEWAL_V1' and source.duration_months_snapshot = 3 then reminder.window_start + 14 else null end) is null
        or (case when reminder.event_code = 'RENEWAL_V1' and source.duration_months_snapshot = 3 then reminder.window_start + 14 else null end) > today
      )),
    'red', count(*) filter (where reminder.status = 'PENDING' and reminder.window_end >= today
      and (case
        when reminder.event_code = 'BALANCE_50_V1' and source.duration_months_snapshot = 12 then reminder.window_start
        when reminder.event_code = 'RENEWAL_V1' and source.duration_months_snapshot = 3 then reminder.window_start + 14
        else null
      end) <= today),
    'overdue', count(*) filter (where reminder.status = 'PENDING' and reminder.window_end < today),
    'sent', count(*) filter (where reminder.status = 'SENT'
      and (reminder.marked_at at time zone 'Asia/Ho_Chi_Minh')::date >= date_trunc('month', today)::date
      and (reminder.marked_at at time zone 'Asia/Ho_Chi_Minh')::date < (date_trunc('month', today) + interval '1 month')::date)
  ) into result
  from public.tuition_reminders reminder
  join public.enrollment_tuition source on source.id = reminder.enrollment_tuition_id
  where public.tuition_branch_granted(source.branch_id_snapshot, 'tuition.reminder.view');
  return result;
end $$;

revoke all on function
  public.tuition_actor_is_active_employee(),
  public.tuition_branch_granted(uuid, text),
  public.tuition_care_may_enter(),
  public.tuition_granted_branches(text),
  public.tuition_visible_branches(),
  public.tuition_reminder_prepare_allowed(uuid),
  public.tuition_renewal_authorized(uuid),
  public.list_tuition_reminders(uuid, uuid, text, text, integer, integer, uuid),
  public.tuition_reminder_kpis()
from public, anon, authenticated, service_role;
grant execute on function
  public.tuition_actor_is_active_employee(),
  public.tuition_branch_granted(uuid, text),
  public.tuition_care_may_enter(),
  public.tuition_granted_branches(text),
  public.tuition_visible_branches(),
  public.tuition_reminder_prepare_allowed(uuid),
  public.list_tuition_reminders(uuid, uuid, text, text, integer, integer, uuid),
  public.tuition_reminder_kpis()
to authenticated;

drop policy if exists tuition_renewal_cases_read on public.tuition_renewal_cases;
drop policy if exists tuition_payos_orders_read on public.tuition_payos_orders;
drop policy if exists tuition_renewal_events_read on public.tuition_renewal_events;

create policy tuition_renewal_cases_read on public.tuition_renewal_cases
for select to authenticated
using (
  public.tuition_branch_granted(branch_id, 'tuition.reminder.view')
  or public.tuition_branch_granted(branch_id, 'tuition.renewal.prepare')
);

create policy tuition_payos_orders_read on public.tuition_payos_orders
for select to authenticated
using (exists (
  select 1
  from public.tuition_renewal_cases renewal
  where renewal.id = case_id
    and (
      public.tuition_branch_granted(renewal.branch_id, 'tuition.reminder.view')
      or public.tuition_branch_granted(renewal.branch_id, 'tuition.renewal.prepare')
    )
));

create policy tuition_renewal_events_read on public.tuition_renewal_events
for select to authenticated
using (exists (
  select 1
  from public.tuition_renewal_cases renewal
  where renewal.id = case_id
    and (
      public.tuition_branch_granted(renewal.branch_id, 'tuition.reminder.view')
      or public.tuition_branch_granted(renewal.branch_id, 'tuition.renewal.prepare')
    )
));

drop policy if exists tuition_care_renewal_invoice_read on public.invoices;
create policy tuition_care_renewal_invoice_read on public.invoices
for select to authenticated
using (exists (
  select 1
  from public.tuition_renewal_cases renewal
  where renewal.invoice_id = invoices.id
    and (
      public.tuition_branch_granted(renewal.branch_id, 'tuition.reminder.view')
      or public.tuition_branch_granted(renewal.branch_id, 'tuition.renewal.prepare')
    )
));

create or replace function public.audit_tuition_renewal_prepared()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.tuition_renewal_events(case_id, event_type, actor_id, metadata)
  values (
    new.id,
    'CARE_PREPARED',
    auth.uid(),
    jsonb_build_object('branch_id', new.branch_id, 'action', 'tuition.renewal.prepare')
  );
  return new;
end $$;

drop trigger if exists tuition_renewal_cases_care_audit on public.tuition_renewal_cases;
create trigger tuition_renewal_cases_care_audit
after insert on public.tuition_renewal_cases
for each row execute function public.audit_tuition_renewal_prepared();

revoke all on function public.audit_tuition_renewal_prepared() from public, anon, authenticated, service_role;
