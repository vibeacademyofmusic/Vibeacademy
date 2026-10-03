-- Sprint 5 win-back cases. Attendance retention alerts are not used.

insert into public.permissions(code, name, module)
values
  ('crm.reactivation.view', 'View reactivation cases in an authorized branch', 'crm'),
  ('crm.reactivation.manage', 'Open and update reactivation cases in an authorized branch', 'crm')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('crm.reactivation.view', 'crm.reactivation.manage')
where r.code = 'BRANCH_ADMIN'
on conflict do nothing;

create table public.crm_reactivation_cases (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  source_enrollment_id uuid references public.enrollments(id),
  branch_id uuid not null references public.branches(id),
  source_reason text not null check (source_reason in ('INACTIVE_STUDENT', 'PAUSE_ENDED_NOT_RETURNED')),
  status text not null default 'NEW_REACTIVATION' check (status in (
    'NEW_REACTIVATION', 'CONTACTED', 'INTERESTED', 'TRIAL_OR_PLACEMENT', 'OFFER_SENT',
    'RETURNED', 'NOT_INTERESTED', 'LOST'
  )),
  owner_user_id uuid references auth.users(id),
  opened_at timestamptz not null default clock_timestamp(),
  last_contact_at timestamptz,
  next_follow_up_on date,
  returned_at timestamptz,
  reference_on date,
  program_name text,
  latest_note text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index crm_reactivation_one_open_idx
  on public.crm_reactivation_cases(student_id)
  where status not in ('RETURNED', 'NOT_INTERESTED', 'LOST');

create index crm_reactivation_branch_idx on public.crm_reactivation_cases(branch_id, status, next_follow_up_on);

create table public.crm_reactivation_events (
  id uuid primary key,
  case_id uuid not null references public.crm_reactivation_cases(id),
  event_type text not null check (event_type in (
    'OPENED', 'CONTACTED', 'INTERESTED', 'TRIAL_OR_PLACEMENT', 'OFFER_SENT',
    'RETURNED', 'NOT_INTERESTED', 'LOST', 'NOTE_ADDED', 'FOLLOW_UP_SET', 'ASSIGNED'
  )),
  from_status text,
  to_status text,
  actor_id uuid references auth.users(id),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index crm_reactivation_events_case_idx on public.crm_reactivation_events(case_id, created_at);

create function public.guard_crm_reactivation_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('crm.case_write', true), '') <> 'on' then
    raise exception 'CRM_REACTIVATION_DIRECT_WRITE_DENIED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger crm_reactivation_cases_write_guard
before insert or update or delete on public.crm_reactivation_cases
for each row execute function public.guard_crm_reactivation_write();

create function public.guard_crm_reactivation_event() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'CRM_REACTIVATION_EVENT_IMMUTABLE';
  end if;
  return new;
end $$;

create trigger crm_reactivation_events_immutable
before update or delete on public.crm_reactivation_events
for each row execute function public.guard_crm_reactivation_event();

alter table public.crm_reactivation_cases enable row level security;
alter table public.crm_reactivation_events enable row level security;

create policy crm_reactivation_cases_select on public.crm_reactivation_cases
for select to authenticated
using (public.crm_can('crm.reactivation.view', branch_id));

create policy crm_reactivation_events_select on public.crm_reactivation_events
for select to authenticated
using (
  exists (
    select 1 from public.crm_reactivation_cases item
    where item.id = case_id and public.crm_can('crm.reactivation.view', item.branch_id)
  )
);

revoke all on public.crm_reactivation_cases, public.crm_reactivation_events from public, anon, authenticated, service_role;
grant select on public.crm_reactivation_cases, public.crm_reactivation_events to authenticated;

create function public.crm_reactivation_returned(p_student uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.enrollments
    where student_id = p_student and status = 'ACTIVE'
  )
$$;

create function public.refresh_crm_reactivation(p_branch uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  opened integer := 0;
  extra integer := 0;
  actor uuid := auth.uid();
begin
  if actor is null or not public.account_is_active() then
    raise exception 'CRM_REACTIVATION_UNAUTHORIZED';
  end if;
  if p_branch is null then
    if not public.has_role('SUPER_ADMIN') then raise exception 'CRM_REACTIVATION_UNAUTHORIZED'; end if;
  else
    if not coalesce(public.crm_can('crm.reactivation.manage', p_branch), false) then
      raise exception 'CRM_REACTIVATION_UNAUTHORIZED';
    end if;
  end if;

  perform set_config('crm.case_write', 'on', true);

  with eligible as (
    select distinct on (enrollment.student_id)
      enrollment.student_id,
      enrollment.id as enrollment_id,
      class_row.branch_id,
      'PAUSE_ENDED_NOT_RETURNED'::text as source_reason,
      pause.ends_on as reference_on,
      course.name as program_name
    from public.enrollment_pauses pause
    join public.enrollments enrollment on enrollment.id = pause.enrollment_id
    join public.classes class_row on class_row.id = enrollment.class_id
    join public.courses course on course.id = class_row.course_id
    where pause.status = 'ACTIVE'
      and pause.ends_on < today
      and enrollment.status in ('WITHDRAWN', 'COMPLETED')
      and not public.crm_reactivation_returned(enrollment.student_id)
      and (p_branch is null or class_row.branch_id = p_branch)
      and public.crm_can('crm.reactivation.manage', class_row.branch_id)
    order by enrollment.student_id, pause.ends_on desc
  ), inserted as (
    insert into public.crm_reactivation_cases(
      student_id, source_enrollment_id, branch_id, source_reason, reference_on, program_name
    )
    select student_id, enrollment_id, branch_id, source_reason, reference_on, program_name
    from eligible
    where not exists (
      select 1 from public.crm_reactivation_cases open_case
      where open_case.student_id = eligible.student_id
        and open_case.status <> 'RETURNED'
    )
    returning id, branch_id
  )
  insert into public.crm_reactivation_events(id, case_id, event_type, to_status, actor_id)
  select gen_random_uuid(), id, 'OPENED', 'NEW_REACTIVATION', actor from inserted;

  get diagnostics opened = row_count;

  with inactive as (
    select student.id as student_id, student.default_branch_id as branch_id
    from public.students student
    where student.status = 'INACTIVE'
      and student.default_branch_id is not null
      and not public.crm_reactivation_returned(student.id)
      and (p_branch is null or student.default_branch_id = p_branch)
      and public.crm_can('crm.reactivation.manage', student.default_branch_id)
      and not exists (
        select 1 from public.crm_reactivation_cases open_case
        where open_case.student_id = student.id
          and open_case.status <> 'RETURNED'
      )
  ), inserted as (
    insert into public.crm_reactivation_cases(student_id, branch_id, source_reason, reference_on, program_name)
    select inactive.student_id, inactive.branch_id, 'INACTIVE_STUDENT',
      (
        select enrollment.ended_at
        from public.enrollments enrollment
        where enrollment.student_id = inactive.student_id and enrollment.ended_at is not null
        order by enrollment.ended_at desc
        limit 1
      ),
      (
        select course.name
        from public.enrollments enrollment
        join public.classes class_row on class_row.id = enrollment.class_id
        join public.courses course on course.id = class_row.course_id
        where enrollment.student_id = inactive.student_id
        order by enrollment.created_at desc
        limit 1
      )
    from inactive
    returning id
  )
  insert into public.crm_reactivation_events(id, case_id, event_type, to_status, actor_id)
  select gen_random_uuid(), id, 'OPENED', 'NEW_REACTIVATION', actor from inserted;
  get diagnostics extra = row_count;
  opened := opened + extra;

  with returned as (
    update public.crm_reactivation_cases item
    set status = 'RETURNED', returned_at = clock_timestamp(), version = version + 1, updated_at = clock_timestamp()
    where item.status not in ('RETURNED', 'NOT_INTERESTED', 'LOST')
      and public.crm_reactivation_returned(item.student_id)
      and (p_branch is null or item.branch_id = p_branch)
      and public.crm_can('crm.reactivation.manage', item.branch_id)
    returning item.id, item.status
  )
  insert into public.crm_reactivation_events(id, case_id, event_type, to_status, actor_id, metadata)
  select gen_random_uuid(), id, 'RETURNED', 'RETURNED', actor, jsonb_build_object('evidence', 'ACTIVE_ENROLLMENT')
  from returned;

  perform set_config('crm.case_write', 'off', true);
  return opened;
end $$;

create function public.transition_crm_reactivation(p_request uuid, p_case uuid, p_version integer, p_to_status text, p_note text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_reactivation_cases%rowtype;
  target text := nullif(upper(btrim(coalesce(p_to_status, ''))), '');
  note text := public.crm_text(p_note, 2000);
  actor uuid := auth.uid();
  prior public.crm_reactivation_events%rowtype;
begin
  if actor is null or p_request is null or target is null then raise exception 'CRM_REACTIVATION_INVALID'; end if;
  select * into prior from public.crm_reactivation_events where id = p_request;
  if found then
    select * into row from public.crm_reactivation_cases where id = prior.case_id;
    if not found or not coalesce(public.crm_can('crm.reactivation.manage', row.branch_id), false) then
      raise exception 'CRM_REACTIVATION_UNAUTHORIZED';
    end if;
    if prior.case_id is distinct from p_case or prior.to_status is distinct from target then
      raise exception 'CRM_REACTIVATION_REQUEST_MISMATCH';
    end if;
    return p_case;
  end if;
  select * into row from public.crm_reactivation_cases where id = p_case for update;
  if not found or not coalesce(public.crm_can('crm.reactivation.manage', row.branch_id), false) then
    raise exception 'CRM_REACTIVATION_UNAUTHORIZED';
  end if;
  if row.version is distinct from p_version then raise exception 'CRM_REACTIVATION_STALE'; end if;
  if row.status in ('RETURNED', 'NOT_INTERESTED', 'LOST') then raise exception 'CRM_REACTIVATION_TERMINAL'; end if;
  if target in ('NOT_INTERESTED', 'LOST') and note is null then raise exception 'CRM_REACTIVATION_NOTE_REQUIRED'; end if;
  if not (row.status, target) in (
    ('NEW_REACTIVATION', 'CONTACTED'), ('NEW_REACTIVATION', 'NOT_INTERESTED'), ('NEW_REACTIVATION', 'LOST'),
    ('CONTACTED', 'INTERESTED'), ('CONTACTED', 'NOT_INTERESTED'), ('CONTACTED', 'LOST'),
    ('INTERESTED', 'TRIAL_OR_PLACEMENT'), ('INTERESTED', 'NOT_INTERESTED'), ('INTERESTED', 'LOST'),
    ('TRIAL_OR_PLACEMENT', 'OFFER_SENT'), ('TRIAL_OR_PLACEMENT', 'NOT_INTERESTED'), ('TRIAL_OR_PLACEMENT', 'LOST'),
    ('OFFER_SENT', 'RETURNED'), ('OFFER_SENT', 'NOT_INTERESTED'), ('OFFER_SENT', 'LOST')
  ) then
    raise exception 'CRM_REACTIVATION_TRANSITION_DENIED';
  end if;
  if target = 'RETURNED' and not public.crm_reactivation_returned(row.student_id) then
    raise exception 'CRM_REACTIVATION_RETURN_UNPROVEN';
  end if;
  perform set_config('crm.case_write', 'on', true);
  update public.crm_reactivation_cases set
    status = target,
    last_contact_at = case when target in ('CONTACTED', 'INTERESTED', 'TRIAL_OR_PLACEMENT', 'OFFER_SENT', 'RETURNED') then clock_timestamp() else last_contact_at end,
    returned_at = case when target = 'RETURNED' then clock_timestamp() else returned_at end,
    latest_note = coalesce(note, latest_note),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.crm_reactivation_events(id, case_id, event_type, from_status, to_status, actor_id, note)
  values (p_request, row.id, target, row.status, target, actor, note);
  perform set_config('crm.case_write', 'off', true);
  return row.id;
end $$;

create function public.crm_reactivation_report(p_from date, p_to date, p_branch uuid, p_reason text, p_owner uuid)
returns table (metric text, value numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.account_is_active() or p_from is null or p_to is null or p_to < p_from then
    raise exception 'CRM_REACTIVATION_UNAUTHORIZED';
  end if;
  return query
  with cohort as (
    select item.id,
      coalesce(max(case event.to_status
        when 'CONTACTED' then 2 when 'INTERESTED' then 3 when 'TRIAL_OR_PLACEMENT' then 4
        when 'OFFER_SENT' then 5 when 'RETURNED' then 6 else null end), 1) as reached,
      bool_or(event.to_status = 'LOST') as lost
    from public.crm_reactivation_cases item
    left join public.crm_reactivation_events event on event.case_id = item.id
    where (item.opened_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
      and public.crm_can('crm.reactivation.view', item.branch_id)
      and (p_branch is null or item.branch_id = p_branch)
      and (p_reason is null or item.source_reason = p_reason)
      and (p_owner is null or item.owner_user_id = p_owner)
    group by item.id
  )
  select * from (values
    ('opened', (select count(*)::numeric from cohort)),
    ('contacted', (select count(*)::numeric from cohort where reached >= 2)),
    ('interested', (select count(*)::numeric from cohort where reached >= 3)),
    ('returned', (select count(*)::numeric from cohort where reached >= 6)),
    ('lost', (select count(*)::numeric from cohort where lost))
  ) metrics(metric, value);
end $$;

revoke all on function
  public.guard_crm_reactivation_write(),
  public.guard_crm_reactivation_event(),
  public.crm_reactivation_returned(uuid),
  public.refresh_crm_reactivation(uuid),
  public.transition_crm_reactivation(uuid, uuid, integer, text, text),
  public.crm_reactivation_report(date, date, uuid, text, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.refresh_crm_reactivation(uuid) to authenticated;
grant execute on function public.transition_crm_reactivation(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.crm_reactivation_report(date, date, uuid, text, uuid) to authenticated;
