-- VIBE Academy — Attendance Retention Risk V1
-- Additive CRM/Attendance bridge.
--
-- V1 scope:
--   * Detect 2 consecutive absences on COMPLETED REGULAR sessions.
--   * Treat ABSENT and EXCUSED as absence signals.
--   * Create one active alert per enrollment/rule.
--   * Auto-resolve active consecutive-absence alert when the newest completed
--     regular session is PRESENT or LATE.
--   * Human follow-up lifecycle with immutable event history.
--   * No automatic parent messaging in V1.
--
-- Security V1:
--   * SUPER_ADMIN only for refresh/read/action mutation until dedicated CRM
--     permissions are verified and explicitly introduced.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_ATTENDANCE_RISK_V1_REQUIRES_POSTGRES';
  end if;

  if to_regclass('public.attendance_records') is null
     or to_regclass('public.session_occurrences') is null
     or to_regclass('public.schedules') is null
     or to_regclass('public.classes') is null
     or to_regclass('public.enrollments') is null
     or to_regclass('public.students') is null
     or to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.has_role(text)') is null
  then
    raise exception 'VIBE_ATTENDANCE_RISK_V1_PREREQUISITE_MISSING';
  end if;

  if to_regclass('public.student_retention_alerts') is not null
     or to_regclass('public.student_retention_events') is not null
     or to_regprocedure('public.refresh_attendance_retention_alerts(uuid)') is not null
     or to_regprocedure('public.update_attendance_retention_alert(uuid,text,text,text,date)') is not null
  then
    raise exception 'VIBE_ATTENDANCE_RISK_V1_ALREADY_EXISTS';
  end if;
end;
$preflight$;

create table public.student_retention_alerts (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null
    references public.students(id) on delete restrict,

  enrollment_id uuid not null
    references public.enrollments(id) on delete restrict,

  branch_id uuid not null
    references public.branches(id) on delete restrict,

  class_id uuid not null
    references public.classes(id) on delete restrict,

  rule_code text not null
    check (rule_code in ('CONSECUTIVE_ABSENCE_2')),

  severity text not null default 'HIGH'
    check (severity in ('MEDIUM','HIGH','CRITICAL')),

  status text not null default 'NEW'
    check (
      status in (
        'NEW',
        'CONTACTED',
        'FOLLOW_UP',
        'RESOLVED',
        'LOST',
        'DISMISSED'
      )
    ),

  first_signal_on date not null,
  last_signal_on date not null,

  consecutive_absence_count integer not null
    check (consecutive_absence_count >= 2),

  evidence_snapshot jsonb not null,

  owner_user_id uuid
    references auth.users(id),

  follow_up_on date,

  latest_contact_channel text
    check (
      latest_contact_channel is null
      or latest_contact_channel in (
        'PHONE',
        'ZALO',
        'SMS',
        'EMAIL',
        'IN_PERSON',
        'OTHER'
      )
    ),

  latest_note text
    check (
      latest_note is null
      or char_length(btrim(latest_note)) between 1 and 4000
    ),

  resolution_code text
    check (
      resolution_code is null
      or resolution_code in (
        'RETURNED_TO_CLASS',
        'CONTINUING',
        'TRANSFERRED',
        'WITHDRAWN',
        'FALSE_POSITIVE',
        'OTHER'
      )
    ),

  detected_at timestamptz not null default clock_timestamp(),
  last_detected_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint student_retention_alert_dates check (
    first_signal_on <= last_signal_on
  ),

  constraint student_retention_resolution_shape check (
    (
      status in ('RESOLVED','LOST','DISMISSED')
      and resolved_at is not null
    )
    or
    (
      status not in ('RESOLVED','LOST','DISMISSED')
      and resolved_at is null
    )
  )
);

create unique index student_retention_alerts_one_open_rule
  on public.student_retention_alerts(enrollment_id,rule_code)
  where status in ('NEW','CONTACTED','FOLLOW_UP');

create index student_retention_alerts_branch_status
  on public.student_retention_alerts(
    branch_id,
    status,
    severity,
    last_signal_on desc
  );

create index student_retention_alerts_student
  on public.student_retention_alerts(student_id,created_at desc);

create table public.student_retention_events (
  id uuid primary key default gen_random_uuid(),

  alert_id uuid not null
    references public.student_retention_alerts(id) on delete restrict,

  event_type text not null
    check (
      event_type in (
        'DETECTED',
        'REFRESHED',
        'CONTACTED',
        'FOLLOW_UP_SET',
        'STATUS_CHANGED',
        'AUTO_RESOLVED',
        'NOTE_ADDED'
      )
    ),

  from_status text,
  to_status text,

  channel text
    check (
      channel is null
      or channel in (
        'PHONE',
        'ZALO',
        'SMS',
        'EMAIL',
        'IN_PERSON',
        'OTHER'
      )
    ),

  note text
    check (
      note is null
      or char_length(btrim(note)) between 1 and 4000
    ),

  follow_up_on date,

  evidence_snapshot jsonb,

  actor_id uuid
    references auth.users(id),

  created_at timestamptz not null default clock_timestamp()
);

create index student_retention_events_alert
  on public.student_retention_events(alert_id,created_at desc,id);

create function public.guard_student_retention_event_history()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  raise exception 'STUDENT_RETENTION_EVENT_HISTORY_IMMUTABLE';
end;
$fn$;

create trigger student_retention_events_immutable
before update or delete on public.student_retention_events
for each row execute function public.guard_student_retention_event_history();

alter table public.student_retention_alerts enable row level security;
alter table public.student_retention_events enable row level security;

create policy student_retention_alerts_super_admin_read
on public.student_retention_alerts
for select
to authenticated
using (public.has_role('SUPER_ADMIN'));

create policy student_retention_events_super_admin_read
on public.student_retention_events
for select
to authenticated
using (
  public.has_role('SUPER_ADMIN')
  and exists(
    select 1
    from public.student_retention_alerts a
    where a.id=student_retention_events.alert_id
  )
);

revoke all on public.student_retention_alerts
from public,anon,authenticated,service_role;

revoke all on public.student_retention_events
from public,anon,authenticated,service_role;

grant select on public.student_retention_alerts to authenticated;
grant select on public.student_retention_events to authenticated;

-- ---------------------------------------------------------------------------
-- Computed signal projection.
-- Only COMPLETED REGULAR sessions are considered.
-- The latest two completed regular attendance records for each enrollment
-- must both be ABSENT/EXCUSED.
-- ---------------------------------------------------------------------------
create function public.attendance_retention_signals_v1(
  p_branch uuid default null
)
returns table(
  student_id uuid,
  enrollment_id uuid,
  branch_id uuid,
  class_id uuid,
  first_signal_on date,
  last_signal_on date,
  latest_status text,
  prior_status text,
  consecutive_absence_count integer,
  evidence_snapshot jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
with history as (
  select
    e.student_id,
    e.id as enrollment_id,
    c.branch_id,
    c.id as class_id,
    so.id as session_id,
    so.occurrence_date,
    so.starts_at,
    ar.status as attendance_status,
    row_number() over (
      partition by e.id
      order by so.occurrence_date desc, so.starts_at desc, so.id desc
    ) as rn
  from public.attendance_records ar
  join public.enrollments e
    on e.id=ar.enrollment_id
  join public.session_occurrences so
    on so.id=ar.session_occurrence_id
  join public.schedules s
    on s.id=so.schedule_id
  join public.classes c
    on c.id=s.class_id
   and c.id=e.class_id
  where so.status='COMPLETED'
    and so.occurrence_type='REGULAR'
    and (p_branch is null or c.branch_id=p_branch)
),
latest_two as (
  select
    h.student_id,
    h.enrollment_id,
    h.branch_id,
    h.class_id,
    max(h.occurrence_date) filter(where h.rn=1) as latest_on,
    max(h.occurrence_date) filter(where h.rn=2) as prior_on,
    max(h.attendance_status) filter(where h.rn=1) as latest_status,
    max(h.attendance_status) filter(where h.rn=2) as prior_status,
    (max(h.session_id::text) filter(where h.rn=1))::uuid as latest_session_id,
    (max(h.session_id::text) filter(where h.rn=2))::uuid as prior_session_id
  from history h
  where h.rn<=2
  group by
    h.student_id,
    h.enrollment_id,
    h.branch_id,
    h.class_id
)
select
  x.student_id,
  x.enrollment_id,
  x.branch_id,
  x.class_id,
  x.prior_on as first_signal_on,
  x.latest_on as last_signal_on,
  x.latest_status,
  x.prior_status,
  2::integer as consecutive_absence_count,
  jsonb_build_object(
    'rule_code','CONSECUTIVE_ABSENCE_2',
    'absence_statuses',jsonb_build_array('ABSENT','EXCUSED'),
    'latest',
      jsonb_build_object(
        'session_id',x.latest_session_id,
        'occurrence_date',x.latest_on,
        'attendance_status',x.latest_status
      ),
    'prior',
      jsonb_build_object(
        'session_id',x.prior_session_id,
        'occurrence_date',x.prior_on,
        'attendance_status',x.prior_status
      )
  ) as evidence_snapshot
from latest_two x
where x.latest_status in ('ABSENT','EXCUSED')
  and x.prior_status in ('ABSENT','EXCUSED')
  and x.latest_on is not null
  and x.prior_on is not null
$fn$;

revoke all on function public.attendance_retention_signals_v1(uuid)
from public,anon,authenticated,service_role;

-- Internal helper only. No API execute grant.

-- ---------------------------------------------------------------------------
-- Refresh / reconcile persisted alerts.
-- ---------------------------------------------------------------------------
create function public.refresh_attendance_retention_alerts(
  p_branch uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  signal record;
  existing public.student_retention_alerts%rowtype;
  created_count integer := 0;
  refreshed_count integer := 0;
  resolved_count integer := 0;
  actor uuid := auth.uid();
begin
  if actor is null
     or not coalesce(public.account_is_active(),false)
     or not coalesce(public.has_role('SUPER_ADMIN'),false)
  then
    raise exception 'RETENTION_ALERT_UNAUTHORIZED';
  end if;

  if p_branch is not null
     and not exists(
       select 1
       from public.branches
       where id=p_branch
     )
  then
    raise exception 'RETENTION_ALERT_BRANCH_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('attendance_retention_v1',0)
  );

  for signal in
    select *
    from public.attendance_retention_signals_v1(p_branch)
  loop
    select *
      into existing
    from public.student_retention_alerts a
    where a.enrollment_id=signal.enrollment_id
      and a.rule_code='CONSECUTIVE_ABSENCE_2'
      and a.status in ('NEW','CONTACTED','FOLLOW_UP')
    for update;

    if found then
      update public.student_retention_alerts
      set
        student_id=signal.student_id,
        branch_id=signal.branch_id,
        class_id=signal.class_id,
        first_signal_on=signal.first_signal_on,
        last_signal_on=signal.last_signal_on,
        consecutive_absence_count=signal.consecutive_absence_count,
        evidence_snapshot=signal.evidence_snapshot,
        last_detected_at=clock_timestamp(),
        updated_at=clock_timestamp()
      where id=existing.id;

      insert into public.student_retention_events(
        alert_id,
        event_type,
        from_status,
        to_status,
        evidence_snapshot,
        actor_id
      )
      values(
        existing.id,
        'REFRESHED',
        existing.status,
        existing.status,
        signal.evidence_snapshot,
        actor
      );

      refreshed_count:=refreshed_count+1;

    else
      insert into public.student_retention_alerts(
        student_id,
        enrollment_id,
        branch_id,
        class_id,
        rule_code,
        severity,
        status,
        first_signal_on,
        last_signal_on,
        consecutive_absence_count,
        evidence_snapshot
      )
      values(
        signal.student_id,
        signal.enrollment_id,
        signal.branch_id,
        signal.class_id,
        'CONSECUTIVE_ABSENCE_2',
        'HIGH',
        'NEW',
        signal.first_signal_on,
        signal.last_signal_on,
        signal.consecutive_absence_count,
        signal.evidence_snapshot
      )
      returning * into existing;

      insert into public.student_retention_events(
        alert_id,
        event_type,
        to_status,
        evidence_snapshot,
        actor_id
      )
      values(
        existing.id,
        'DETECTED',
        'NEW',
        signal.evidence_snapshot,
        actor
      );

      created_count:=created_count+1;
    end if;
  end loop;

  -- Auto-resolve open alerts when latest completed REGULAR attendance
  -- is no longer an absence signal.
  for existing in
    select a.*
    from public.student_retention_alerts a
    where a.rule_code='CONSECUTIVE_ABSENCE_2'
      and a.status in ('NEW','CONTACTED','FOLLOW_UP')
      and (p_branch is null or a.branch_id=p_branch)
      and not exists(
        select 1
        from public.attendance_retention_signals_v1(p_branch) s
        where s.enrollment_id=a.enrollment_id
      )
      and exists(
        select 1
        from public.attendance_records ar
        join public.session_occurrences so
          on so.id=ar.session_occurrence_id
        where ar.enrollment_id=a.enrollment_id
          and so.status='COMPLETED'
          and so.occurrence_type='REGULAR'
          and ar.status in ('PRESENT','LATE')
          and so.occurrence_date>=a.last_signal_on
      )
    for update
  loop
    update public.student_retention_alerts
    set
      status='RESOLVED',
      resolution_code='RETURNED_TO_CLASS',
      resolved_at=clock_timestamp(),
      latest_note='Tự động đóng cảnh báo sau khi học viên quay lại lớp.',
      updated_at=clock_timestamp()
    where id=existing.id;

    insert into public.student_retention_events(
      alert_id,
      event_type,
      from_status,
      to_status,
      note,
      actor_id
    )
    values(
      existing.id,
      'AUTO_RESOLVED',
      existing.status,
      'RESOLVED',
      'Tự động đóng cảnh báo sau khi học viên quay lại lớp.',
      actor
    );

    resolved_count:=resolved_count+1;
  end loop;

  return jsonb_build_object(
    'status','REFRESHED',
    'rule_code','CONSECUTIVE_ABSENCE_2',
    'created',created_count,
    'refreshed',refreshed_count,
    'auto_resolved',resolved_count
  );
end;
$fn$;

revoke all on function public.refresh_attendance_retention_alerts(uuid)
from public,anon,authenticated,service_role;

grant execute on function public.refresh_attendance_retention_alerts(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Human CRM follow-up lifecycle.
-- ---------------------------------------------------------------------------
create function public.update_attendance_retention_alert(
  p_alert uuid,
  p_status text,
  p_channel text,
  p_note text,
  p_follow_up_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  current public.student_retention_alerts%rowtype;
  actor uuid := auth.uid();
  event_type_value text;
begin
  if actor is null
     or not coalesce(public.account_is_active(),false)
     or not coalesce(public.has_role('SUPER_ADMIN'),false)
  then
    raise exception 'RETENTION_ALERT_UNAUTHORIZED';
  end if;

  select *
    into current
  from public.student_retention_alerts
  where id=p_alert
  for update;

  if not found then
    raise exception 'RETENTION_ALERT_NOT_FOUND';
  end if;

  if current.status in ('RESOLVED','LOST','DISMISSED') then
    raise exception 'RETENTION_ALERT_ALREADY_CLOSED';
  end if;

  if p_status not in (
    'CONTACTED',
    'FOLLOW_UP',
    'RESOLVED',
    'LOST',
    'DISMISSED'
  ) then
    raise exception 'RETENTION_ALERT_STATUS_INVALID';
  end if;

  if p_channel is not null
     and p_channel not in (
       'PHONE','ZALO','SMS','EMAIL','IN_PERSON','OTHER'
     )
  then
    raise exception 'RETENTION_ALERT_CHANNEL_INVALID';
  end if;

  if p_note is null
     or char_length(btrim(p_note)) not between 1 and 4000
  then
    raise exception 'RETENTION_ALERT_NOTE_REQUIRED';
  end if;

  if p_status='FOLLOW_UP' and p_follow_up_on is null then
    raise exception 'RETENTION_ALERT_FOLLOW_UP_DATE_REQUIRED';
  end if;

  event_type_value:=
    case
      when p_status='CONTACTED' then 'CONTACTED'
      when p_status='FOLLOW_UP' then 'FOLLOW_UP_SET'
      else 'STATUS_CHANGED'
    end;

  update public.student_retention_alerts
  set
    status=p_status,
    owner_user_id=coalesce(owner_user_id,actor),
    latest_contact_channel=p_channel,
    latest_note=btrim(p_note),
    follow_up_on=
      case
        when p_status='FOLLOW_UP' then p_follow_up_on
        when p_status in ('RESOLVED','LOST','DISMISSED') then null
        else follow_up_on
      end,
    resolution_code=
      case
        when p_status='RESOLVED' then 'CONTINUING'
        when p_status='LOST' then 'WITHDRAWN'
        when p_status='DISMISSED' then 'FALSE_POSITIVE'
        else resolution_code
      end,
    resolved_at=
      case
        when p_status in ('RESOLVED','LOST','DISMISSED')
          then clock_timestamp()
        else null
      end,
    updated_at=clock_timestamp()
  where id=current.id;

  insert into public.student_retention_events(
    alert_id,
    event_type,
    from_status,
    to_status,
    channel,
    note,
    follow_up_on,
    actor_id
  )
  values(
    current.id,
    event_type_value,
    current.status,
    p_status,
    p_channel,
    btrim(p_note),
    p_follow_up_on,
    actor
  );

  return jsonb_build_object(
    'status','UPDATED',
    'alert_id',current.id,
    'from_status',current.status,
    'to_status',p_status
  );
end;
$fn$;

revoke all on function public.update_attendance_retention_alert(
  uuid,text,text,text,date
) from public,anon,authenticated,service_role;

grant execute on function public.update_attendance_retention_alert(
  uuid,text,text,text,date
) to authenticated;

comment on table public.student_retention_alerts is
  'Attendance-to-CRM retention alerts. V1 rule detects two consecutive absences on completed regular sessions.';

comment on function public.refresh_attendance_retention_alerts(uuid) is
  'Idempotently refreshes CONSECUTIVE_ABSENCE_2 alerts and auto-resolves when learner returns to a completed regular class. SUPER_ADMIN only in V1.';

comment on function public.update_attendance_retention_alert(uuid,text,text,text,date) is
  'Records human follow-up lifecycle for attendance retention alerts. No automatic external messaging.';

do $verify$
begin
  if not exists(
    select 1
    from pg_proc p
    where p.oid=to_regprocedure(
      'public.refresh_attendance_retention_alerts(uuid)'
    )
      and p.prosecdef
  ) then
    raise exception 'RETENTION_REFRESH_RPC_VERIFY_FAILED';
  end if;

  if not exists(
    select 1
    from pg_proc p
    where p.oid=to_regprocedure(
      'public.update_attendance_retention_alert(uuid,text,text,text,date)'
    )
      and p.prosecdef
  ) then
    raise exception 'RETENTION_UPDATE_RPC_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.refresh_attendance_retention_alerts(uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.refresh_attendance_retention_alerts(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'RETENTION_REFRESH_GRANT_VERIFY_FAILED';
  end if;

  if not exists(
    select 1
    from pg_trigger
    where tgrelid='public.student_retention_events'::regclass
      and tgname='student_retention_events_immutable'
      and not tgisinternal
  ) then
    raise exception 'RETENTION_EVENT_GUARD_VERIFY_FAILED';
  end if;
end;
$verify$;

notify pgrst,'reload schema';

commit;
