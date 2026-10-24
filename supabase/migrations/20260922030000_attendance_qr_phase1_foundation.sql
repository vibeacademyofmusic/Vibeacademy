-- VIBE Academy
-- QR Attendance Phase 1
--
-- Canonical flow:
-- branch QR session
-- -> 60-second rotating bearer token
-- -> authenticated employee resolved from auth.uid()
-- -> canonical employee_schedule()
-- -> exact shift snapshot
-- -> immutable CHECK_IN / CHECK_OUT evidence
--
-- This migration does NOT alter payroll evidence acceptance yet.
-- Existing payroll approval / checker rules remain intact.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
declare
  duplicate_profile_count integer;
  extension_schema text;
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_QR_REQUIRES_POSTGRES_MIGRATION_ROLE';
  end if;

  select n.nspname
  into extension_schema
  from pg_extension e
  join pg_namespace n
    on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if extension_schema is distinct from 'extensions' then
    raise exception 'VIBE_QR_PGCRYPTO_SCHEMA_INVALID';
  end if;

  if to_regclass('public.branches') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.employees') is null
     or to_regclass('public.employee_versions') is null
     or to_regclass('public.employee_directory') is null
     or to_regclass('public.organization_units') is null
     or to_regclass('public.employee_trips') is null
     or to_regclass('public.employee_trip_reviews') is null
  then
    raise exception 'VIBE_QR_REQUIRED_RELATION_MISSING';
  end if;

  if to_regprocedure(
       'public.employee_schedule(uuid,date,date)'
     ) is null
     or to_regprocedure(
       'public.account_is_active()'
     ) is null
     or to_regprocedure(
       'public.has_permission(text,uuid)'
     ) is null
     or to_regprocedure(
       'public.is_global_super_admin()'
     ) is null
  then
    raise exception 'VIBE_QR_REQUIRED_FUNCTION_MISSING';
  end if;

  select count(*)
  into duplicate_profile_count
  from (
    select profile_id
    from public.employees
    where profile_id is not null
    group by profile_id
    having count(*) > 1
  ) duplicate_profiles;

  if duplicate_profile_count > 0 then
    raise exception 'VIBE_QR_DUPLICATE_EMPLOYEE_PROFILE_LINK';
  end if;

  if to_regclass('public.attendance_qr_sessions') is not null
     or to_regclass('public.attendance_qr_tokens') is not null
     or to_regclass('public.employee_attendance_scan_events') is not null
  then
    raise exception 'VIBE_QR_OBJECTS_ALREADY_EXIST';
  end if;
end;
$preflight$;


-- ============================================================
-- Allow an employee to read ONLY their own canonical schedule.
-- Existing SUPER_ADMIN behavior remains unchanged.
-- The scheduling algorithm itself is not duplicated or changed.
-- ============================================================

do $patch_employee_schedule$
declare
  definition text;
  patched_definition text;

  old_gate text :=
    'if not public.has_role(''SUPER_ADMIN'') then raise exception ''Employee attendance denied''; end if;';

  new_gate text :=
    'if not public.has_role(''SUPER_ADMIN'') and not exists(select 1 from public.employees e where e.id=p_employee and e.profile_id=auth.uid()) then raise exception ''Employee attendance denied''; end if;';
begin
  select pg_get_functiondef(
    'public.employee_schedule(uuid,date,date)'::regprocedure
  )
  into definition;

  if position(old_gate in definition) = 0 then
    if position(
      'e.profile_id=auth.uid()'
      in replace(definition, ' ', '')
    ) = 0
    then
      raise exception 'VIBE_QR_EMPLOYEE_SCHEDULE_AUTH_GATE_CHANGED';
    end if;

    return;
  end if;

  patched_definition :=
    replace(
      definition,
      old_gate,
      new_gate
    );

  execute patched_definition;
end;
$patch_employee_schedule$;


-- ============================================================
-- QR session
-- ============================================================

create table public.attendance_qr_sessions (
  id uuid primary key
    default pg_catalog.gen_random_uuid(),

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  work_date date not null,

  status text not null
    default 'ACTIVE'
    check (
      status in (
        'ACTIVE',
        'STOPPED',
        'EXPIRED'
      )
    ),

  started_at timestamptz not null
    default clock_timestamp(),

  started_by uuid not null
    references public.profiles(id)
    on delete restrict,

  stopped_at timestamptz,

  stopped_by uuid
    references public.profiles(id)
    on delete restrict,

  stop_reason text,

  created_at timestamptz not null
    default clock_timestamp(),

  constraint attendance_qr_session_state_check
  check (
    (
      status = 'ACTIVE'
      and stopped_at is null
      and stopped_by is null
    )
    or
    (
      status = 'STOPPED'
      and stopped_at is not null
      and stopped_by is not null
    )
    or
    (
      status = 'EXPIRED'
      and stopped_at is not null
    )
  ),

  constraint attendance_qr_session_reason_check
  check (
    stop_reason is null
    or char_length(btrim(stop_reason))
       between 1 and 500
  )
);

create unique index attendance_qr_one_active_branch
  on public.attendance_qr_sessions(branch_id)
  where status = 'ACTIVE';

create index attendance_qr_sessions_branch_date
  on public.attendance_qr_sessions(
    branch_id,
    work_date desc,
    started_at desc
  );


-- ============================================================
-- QR token
-- Plain bearer token is never stored.
-- Every token is valid for exactly 60 seconds maximum.
-- ============================================================

create table public.attendance_qr_tokens (
  id uuid primary key
    default pg_catalog.gen_random_uuid(),

  session_id uuid not null
    references public.attendance_qr_sessions(id)
    on delete restrict,

  token_hash bytea not null unique,

  issued_at timestamptz not null,

  expires_at timestamptz not null,

  revoked_at timestamptz,

  revoked_by uuid
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz not null
    default clock_timestamp(),

  constraint attendance_qr_token_expiry_check
  check (
    expires_at > issued_at
    and expires_at
      <= issued_at + interval '60 seconds'
  ),

  constraint attendance_qr_token_revoke_check
  check (
    revoked_at is null
    or revoked_at >= issued_at
  )
);

create index attendance_qr_tokens_session
  on public.attendance_qr_tokens(
    session_id,
    issued_at desc
  );


-- ============================================================
-- Immutable QR evidence
-- ============================================================

create table public.employee_attendance_scan_events (
  id uuid primary key
    default pg_catalog.gen_random_uuid(),

  session_id uuid not null
    references public.attendance_qr_sessions(id)
    on delete restrict,

  token_id uuid not null
    references public.attendance_qr_tokens(id)
    on delete restrict,

  employee_id uuid not null
    references public.employees(id)
    on delete restrict,

  profile_id uuid not null
    references public.profiles(id)
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  work_date date not null,

  shift_code text not null,

  event_type text not null
    check (
      event_type in (
        'CHECK_IN',
        'CHECK_OUT'
      )
    ),

  paired_check_in_id uuid
    references public.employee_attendance_scan_events(id)
    on delete restrict,

  schedule_snapshot jsonb not null,

  scanned_at timestamptz not null,

  verification_method text not null
    default 'QR_SYSTEM'
    check (
      verification_method = 'QR_SYSTEM'
    ),

  metadata jsonb not null
    default '{}'::jsonb,

  created_at timestamptz not null
    default clock_timestamp(),

  constraint attendance_qr_scan_pair_check
  check (
    (
      event_type = 'CHECK_IN'
      and paired_check_in_id is null
    )
    or
    (
      event_type = 'CHECK_OUT'
      and paired_check_in_id is not null
    )
  ),

  constraint attendance_qr_schedule_snapshot_check
  check (
    schedule_snapshot
      ?& array[
        'work_date',
        'shift_code',
        'unit_code',
        'employment_version',
        'starts_at',
        'ends_at',
        'scheduled_minutes',
        'schedule_state',
        'trip_id'
      ]
  )
);

create unique index attendance_qr_token_employee_once
  on public.employee_attendance_scan_events(
    token_id,
    employee_id
  );

create unique index attendance_qr_shift_event_once
  on public.employee_attendance_scan_events(
    employee_id,
    work_date,
    shift_code,
    event_type
  );

create unique index attendance_qr_checkout_pair_once
  on public.employee_attendance_scan_events(
    paired_check_in_id
  )
  where paired_check_in_id is not null;

create index attendance_qr_employee_day
  on public.employee_attendance_scan_events(
    employee_id,
    work_date,
    scanned_at
  );

create index attendance_qr_branch_recent
  on public.employee_attendance_scan_events(
    branch_id,
    scanned_at desc
  );


-- ============================================================
-- RPC-only tables
-- ============================================================

alter table public.attendance_qr_sessions
  enable row level security;

alter table public.attendance_qr_tokens
  enable row level security;

alter table public.employee_attendance_scan_events
  enable row level security;

revoke all
on table
  public.attendance_qr_sessions,
  public.attendance_qr_tokens,
  public.employee_attendance_scan_events
from public, anon, authenticated, service_role;


-- ============================================================
-- Manageable branches
-- ============================================================

create function public.get_attendance_qr_manageable_branches()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_UNAUTHORIZED';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'code', b.code,
        'name', b.name
      )
      order by b.name, b.id
    ),
    '[]'::jsonb
  )
  into result
  from public.branches b
  where b.status = 'ACTIVE'
    and (
      coalesce(
        public.is_global_super_admin(),
        false
      )
      or coalesce(
        public.has_permission(
          'attendance.manage',
          b.id
        ),
        false
      )
    );

  return result;
end;
$fn$;


-- ============================================================
-- Start session
-- ============================================================

create function public.start_attendance_qr_session(
  p_branch uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  today_vn date;
  current_session
    public.attendance_qr_sessions%rowtype;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_UNAUTHORIZED';
  end if;

  if p_branch is null then
    raise exception 'QR_ATTENDANCE_BRANCH_REQUIRED';
  end if;

  if not (
    coalesce(
      public.is_global_super_admin(),
      false
    )
    or coalesce(
      public.has_permission(
        'attendance.manage',
        p_branch
      ),
      false
    )
  ) then
    raise exception 'QR_ATTENDANCE_MANAGE_DENIED';
  end if;

  if not exists (
    select 1
    from public.branches b
    where b.id = p_branch
      and b.status = 'ACTIVE'
  ) then
    raise exception 'QR_ATTENDANCE_BRANCH_INACTIVE';
  end if;

  today_vn :=
    (
      clock_timestamp()
      at time zone 'Asia/Ho_Chi_Minh'
    )::date;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'VIBE_QR_BRANCH:' || p_branch::text,
      0
    )
  );

  update public.attendance_qr_sessions
  set
    status = 'EXPIRED',
    stopped_at = clock_timestamp(),
    stop_reason = 'AUTO_EXPIRED_DATE'
  where branch_id = p_branch
    and status = 'ACTIVE'
    and work_date <> today_vn;

  select s.*
  into current_session
  from public.attendance_qr_sessions s
  where s.branch_id = p_branch
    and s.work_date = today_vn
    and s.status = 'ACTIVE'
  limit 1;

  if found then
    return jsonb_build_object(
      'status', 'ALREADY_ACTIVE',
      'session_id', current_session.id,
      'branch_id', current_session.branch_id,
      'work_date', current_session.work_date,
      'started_at', current_session.started_at
    );
  end if;

  insert into public.attendance_qr_sessions(
    branch_id,
    work_date,
    started_by
  )
  values(
    p_branch,
    today_vn,
    auth.uid()
  )
  returning *
  into current_session;

  return jsonb_build_object(
    'status', 'STARTED',
    'session_id', current_session.id,
    'branch_id', current_session.branch_id,
    'work_date', current_session.work_date,
    'started_at', current_session.started_at
  );
end;
$fn$;


-- ============================================================
-- Mint 60-second token
-- ============================================================

create function public.mint_attendance_qr_token(
  p_session uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  session_row
    public.attendance_qr_sessions%rowtype;

  plain_token text;
  hashed_token bytea;

  issued timestamptz;
  expires timestamptz;

  token_id_value uuid;
  today_vn date;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_UNAUTHORIZED';
  end if;

  select s.*
  into session_row
  from public.attendance_qr_sessions s
  where s.id = p_session
  for update;

  if not found then
    raise exception 'QR_ATTENDANCE_SESSION_NOT_FOUND';
  end if;

  if not (
    coalesce(
      public.is_global_super_admin(),
      false
    )
    or coalesce(
      public.has_permission(
        'attendance.manage',
        session_row.branch_id
      ),
      false
    )
  ) then
    raise exception 'QR_ATTENDANCE_MANAGE_DENIED';
  end if;

  today_vn :=
    (
      clock_timestamp()
      at time zone 'Asia/Ho_Chi_Minh'
    )::date;

  if session_row.status <> 'ACTIVE'
     or session_row.work_date <> today_vn
  then
    raise exception 'QR_ATTENDANCE_SESSION_NOT_ACTIVE';
  end if;

  issued := clock_timestamp();
  expires := issued + interval '60 seconds';

  plain_token :=
    replace(
      pg_catalog.gen_random_uuid()::text,
      '-',
      ''
    )
    ||
    replace(
      pg_catalog.gen_random_uuid()::text,
      '-',
      ''
    );

  hashed_token :=
    extensions.digest(
      plain_token,
      'sha256'
    );

  insert into public.attendance_qr_tokens(
    session_id,
    token_hash,
    issued_at,
    expires_at
  )
  values(
    session_row.id,
    hashed_token,
    issued,
    expires
  )
  returning id
  into token_id_value;

  return jsonb_build_object(
    'status', 'ISSUED',
    'session_id', session_row.id,
    'token_id', token_id_value,
    'branch_id', session_row.branch_id,
    'work_date', session_row.work_date,
    'token', plain_token,
    'issued_at', issued,
    'expires_at', expires,
    'ttl_seconds', 60
  );
end;
$fn$;


-- ============================================================
-- Stop session
-- ============================================================

create function public.stop_attendance_qr_session(
  p_session uuid,
  p_reason text default 'ADMIN_STOP'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  session_row
    public.attendance_qr_sessions%rowtype;

  stopped_time timestamptz;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_UNAUTHORIZED';
  end if;

  select s.*
  into session_row
  from public.attendance_qr_sessions s
  where s.id = p_session
  for update;

  if not found then
    raise exception 'QR_ATTENDANCE_SESSION_NOT_FOUND';
  end if;

  if not (
    coalesce(
      public.is_global_super_admin(),
      false
    )
    or coalesce(
      public.has_permission(
        'attendance.manage',
        session_row.branch_id
      ),
      false
    )
  ) then
    raise exception 'QR_ATTENDANCE_MANAGE_DENIED';
  end if;

  if session_row.status <> 'ACTIVE' then
    return jsonb_build_object(
      'status', 'ALREADY_CLOSED',
      'session_id', session_row.id,
      'session_status', session_row.status
    );
  end if;

  if p_reason is null
     or char_length(
       btrim(p_reason)
     ) not between 1 and 500
  then
    raise exception 'QR_ATTENDANCE_STOP_REASON_REQUIRED';
  end if;

  stopped_time := clock_timestamp();

  update public.attendance_qr_sessions
  set
    status = 'STOPPED',
    stopped_at = stopped_time,
    stopped_by = auth.uid(),
    stop_reason = btrim(p_reason)
  where id = session_row.id;

  update public.attendance_qr_tokens
  set
    revoked_at = stopped_time,
    revoked_by = auth.uid()
  where session_id = session_row.id
    and revoked_at is null;

  return jsonb_build_object(
    'status', 'STOPPED',
    'session_id', session_row.id,
    'stopped_at', stopped_time
  );
end;
$fn$;


-- ============================================================
-- Employee self scan
-- No employee id is accepted from client.
-- Identity = employees.profile_id = auth.uid().
-- ============================================================

create function public.scan_employee_attendance_qr(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  now_value timestamptz;
  today_vn date;

  linked_employee_count integer;

  employee_id_value uuid;
  employee_code_value text;
  employee_name_value text;

  token_hash_value bytea;

  token_row
    public.attendance_qr_tokens%rowtype;

  session_row
    public.attendance_qr_sessions%rowtype;

  same_token_event
    public.employee_attendance_scan_events%rowtype;

  open_check_in
    public.employee_attendance_scan_events%rowtype;

  inserted_event
    public.employee_attendance_scan_events%rowtype;

  schedule_json jsonb;

  shift_code_value text;
  event_type_value text;
  paired_check_in_value uuid;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_LOGIN_REQUIRED';
  end if;

  if p_token is null
     or char_length(p_token) <> 64
     or p_token !~ '^[0-9a-fA-F]{64}$'
  then
    raise exception 'QR_ATTENDANCE_INVALID_TOKEN';
  end if;

  now_value := clock_timestamp();

  today_vn :=
    (
      now_value
      at time zone 'Asia/Ho_Chi_Minh'
    )::date;

  select count(*)
  into linked_employee_count
  from public.employees e
  where e.profile_id = auth.uid();

  if linked_employee_count = 0 then
    raise exception 'QR_ATTENDANCE_EMPLOYEE_LINK_REQUIRED';
  end if;

  if linked_employee_count <> 1 then
    raise exception 'QR_ATTENDANCE_EMPLOYEE_LINK_AMBIGUOUS';
  end if;

  select
    d.id,
    d.employee_code,
    d.full_name
  into
    employee_id_value,
    employee_code_value,
    employee_name_value
  from public.employee_directory d
  where d.profile_id = auth.uid()
    and d.employment_status = 'ACTIVE'
  limit 1;

  if employee_id_value is null then
    raise exception 'QR_ATTENDANCE_ACTIVE_EMPLOYEE_REQUIRED';
  end if;

  perform 1
  from public.employees e
  where e.id = employee_id_value
  for update;

  token_hash_value :=
    extensions.digest(
      p_token,
      'sha256'
    );

  select t.*
  into token_row
  from public.attendance_qr_tokens t
  where t.token_hash = token_hash_value
  for update;

  if not found then
    raise exception 'QR_ATTENDANCE_INVALID_TOKEN';
  end if;

  if token_row.revoked_at is not null
     or now_value < token_row.issued_at
     or now_value >= token_row.expires_at
  then
    raise exception 'QR_ATTENDANCE_TOKEN_EXPIRED';
  end if;

  select s.*
  into session_row
  from public.attendance_qr_sessions s
  where s.id = token_row.session_id
  for update;

  if not found
     or session_row.status <> 'ACTIVE'
     or session_row.work_date <> today_vn
  then
    raise exception 'QR_ATTENDANCE_SESSION_NOT_ACTIVE';
  end if;

  select e.*
  into same_token_event
  from public.employee_attendance_scan_events e
  where e.token_id = token_row.id
    and e.employee_id = employee_id_value
  limit 1;

  if found then
    return jsonb_build_object(
      'status', 'ALREADY_SCANNED',
      'event_id', same_token_event.id,
      'event_type', same_token_event.event_type,
      'employee_id', same_token_event.employee_id,
      'branch_id', same_token_event.branch_id,
      'work_date', same_token_event.work_date,
      'shift_code', same_token_event.shift_code,
      'scanned_at', same_token_event.scanned_at
    );
  end if;

  select ci.*
  into open_check_in
  from public.employee_attendance_scan_events ci
  where ci.employee_id = employee_id_value
    and ci.branch_id = session_row.branch_id
    and ci.work_date = today_vn
    and ci.event_type = 'CHECK_IN'
    and not exists (
      select 1
      from public.employee_attendance_scan_events co
      where co.paired_check_in_id = ci.id
        and co.event_type = 'CHECK_OUT'
    )
  order by ci.scanned_at desc
  limit 1
  for update;

  if found then
    event_type_value := 'CHECK_OUT';
    paired_check_in_value := open_check_in.id;
    shift_code_value := open_check_in.shift_code;
    schedule_json := open_check_in.schedule_snapshot;
  else
    select to_jsonb(s)
    into schedule_json
    from public.employee_schedule(
      employee_id_value,
      today_vn,
      today_vn
    ) s
    left join public.organization_units u
      on u.code = s.unit_code
    left join public.employee_trips trip
      on trip.id = s.trip_id
    where s.scheduled_minutes > 0
      and s.schedule_state <> 'SCHEDULED_OFF'
      and coalesce(
        trip.destination_branch_id,
        u.branch_id
      ) = session_row.branch_id
      and not exists (
        select 1
        from public.employee_attendance_scan_events e
        where e.employee_id = employee_id_value
          and e.work_date = today_vn
          and e.shift_code = s.shift_code
          and e.event_type = 'CHECK_IN'
      )
    order by
      case
        when now_value <= s.ends_at
          then 0
        else 1
      end,
      case
        when now_value <= s.ends_at
          then s.starts_at
        else null
      end asc nulls last,
      s.starts_at desc
    limit 1;

    if schedule_json is null then
      raise exception 'QR_ATTENDANCE_NO_ELIGIBLE_SHIFT_AT_BRANCH';
    end if;

    shift_code_value :=
      schedule_json->>'shift_code';

    event_type_value := 'CHECK_IN';
    paired_check_in_value := null;
  end if;

  insert into public.employee_attendance_scan_events(
    session_id,
    token_id,
    employee_id,
    profile_id,
    branch_id,
    work_date,
    shift_code,
    event_type,
    paired_check_in_id,
    schedule_snapshot,
    scanned_at,
    metadata
  )
  values(
    session_row.id,
    token_row.id,
    employee_id_value,
    auth.uid(),
    session_row.branch_id,
    today_vn,
    shift_code_value,
    event_type_value,
    paired_check_in_value,
    schedule_json,
    now_value,
    jsonb_build_object(
      'employee_code',
      employee_code_value,
      'employee_name',
      employee_name_value,
      'identity_source',
      'employees.profile_id',
      'schedule_source',
      'public.employee_schedule'
    )
  )
  returning *
  into inserted_event;

  return jsonb_build_object(
    'status', 'RECORDED',
    'event_id', inserted_event.id,
    'event_type', inserted_event.event_type,
    'employee_id', inserted_event.employee_id,
    'employee_code', employee_code_value,
    'employee_name', employee_name_value,
    'branch_id', inserted_event.branch_id,
    'work_date', inserted_event.work_date,
    'shift_code', inserted_event.shift_code,
    'scanned_at', inserted_event.scanned_at,
    'verification_method',
      inserted_event.verification_method
  );
end;
$fn$;


-- ============================================================
-- Admin status
-- ============================================================

create function public.get_attendance_qr_status(
  p_branch uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  today_vn date;

  session_row
    public.attendance_qr_sessions%rowtype;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_UNAUTHORIZED';
  end if;

  if not (
    coalesce(
      public.is_global_super_admin(),
      false
    )
    or coalesce(
      public.has_permission(
        'attendance.manage',
        p_branch
      ),
      false
    )
  ) then
    raise exception 'QR_ATTENDANCE_MANAGE_DENIED';
  end if;

  today_vn :=
    (
      clock_timestamp()
      at time zone 'Asia/Ho_Chi_Minh'
    )::date;

  select s.*
  into session_row
  from public.attendance_qr_sessions s
  where s.branch_id = p_branch
    and s.work_date = today_vn
    and s.status = 'ACTIVE'
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'INACTIVE',
      'branch_id', p_branch,
      'work_date', today_vn
    );
  end if;

  return jsonb_build_object(
    'status', 'ACTIVE',
    'session_id', session_row.id,
    'branch_id', session_row.branch_id,
    'work_date', session_row.work_date,
    'started_at', session_row.started_at
  );
end;
$fn$;


-- ============================================================
-- Admin recent scans
-- ============================================================

create function public.get_attendance_qr_recent_scans(
  p_branch uuid,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  safe_limit integer;
  result jsonb;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_UNAUTHORIZED';
  end if;

  if not (
    coalesce(
      public.is_global_super_admin(),
      false
    )
    or coalesce(
      public.has_permission(
        'attendance.manage',
        p_branch
      ),
      false
    )
  ) then
    raise exception 'QR_ATTENDANCE_MANAGE_DENIED';
  end if;

  safe_limit :=
    least(
      greatest(
        coalesce(p_limit, 30),
        1
      ),
      100
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'employee_id', x.employee_id,
        'employee_code', d.employee_code,
        'employee_name', d.full_name,
        'branch_id', x.branch_id,
        'work_date', x.work_date,
        'shift_code', x.shift_code,
        'event_type', x.event_type,
        'scanned_at', x.scanned_at,
        'verification_method',
          x.verification_method
      )
      order by x.scanned_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select e.*
    from public.employee_attendance_scan_events e
    where e.branch_id = p_branch
    order by e.scanned_at desc
    limit safe_limit
  ) x
  left join public.employee_directory d
    on d.id = x.employee_id;

  return result;
end;
$fn$;


-- ============================================================
-- Employee own events today
-- ============================================================

create function public.get_my_attendance_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  today_vn date;
  employee_id_value uuid;
  linked_employee_count integer;
  result jsonb;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_LOGIN_REQUIRED';
  end if;

  select
    count(*),
    min(id)
  into
    linked_employee_count,
    employee_id_value
  from public.employees
  where profile_id = auth.uid();

  if linked_employee_count = 0 then
    raise exception 'QR_ATTENDANCE_EMPLOYEE_LINK_REQUIRED';
  end if;

  if linked_employee_count <> 1 then
    raise exception 'QR_ATTENDANCE_EMPLOYEE_LINK_AMBIGUOUS';
  end if;

  today_vn :=
    (
      clock_timestamp()
      at time zone 'Asia/Ho_Chi_Minh'
    )::date;

  select jsonb_build_object(
    'employee_id',
      employee_id_value,
    'work_date',
      today_vn,
    'events',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'branch_id', e.branch_id,
            'shift_code', e.shift_code,
            'event_type', e.event_type,
            'scanned_at', e.scanned_at,
            'verification_method',
              e.verification_method
          )
          order by e.scanned_at
        )
        filter (
          where e.id is not null
        ),
        '[]'::jsonb
      )
  )
  into result
  from public.employee_attendance_scan_events e
  where e.employee_id = employee_id_value
    and e.work_date = today_vn;

  return result;
end;
$fn$;


-- ============================================================
-- Immutable scan history
-- ============================================================

create function public.guard_attendance_qr_scan_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  raise exception
    'QR_ATTENDANCE_SCAN_EVENTS_ARE_IMMUTABLE';
end;
$fn$;

create trigger attendance_qr_scan_no_update
before update
on public.employee_attendance_scan_events
for each row
execute function
  public.guard_attendance_qr_scan_immutable();

create trigger attendance_qr_scan_no_delete
before delete
on public.employee_attendance_scan_events
for each row
execute function
  public.guard_attendance_qr_scan_immutable();


-- ============================================================
-- RPC grants
-- ============================================================

revoke all
on function
  public.get_attendance_qr_manageable_branches(),
  public.start_attendance_qr_session(uuid),
  public.mint_attendance_qr_token(uuid),
  public.stop_attendance_qr_session(uuid,text),
  public.scan_employee_attendance_qr(text),
  public.get_attendance_qr_status(uuid),
  public.get_attendance_qr_recent_scans(uuid,integer),
  public.get_my_attendance_today(),
  public.guard_attendance_qr_scan_immutable()
from public, anon, authenticated, service_role;

grant execute
on function
  public.get_attendance_qr_manageable_branches(),
  public.start_attendance_qr_session(uuid),
  public.mint_attendance_qr_token(uuid),
  public.stop_attendance_qr_session(uuid,text),
  public.scan_employee_attendance_qr(text),
  public.get_attendance_qr_status(uuid),
  public.get_attendance_qr_recent_scans(uuid,integer),
  public.get_my_attendance_today()
to authenticated;

notify pgrst, 'reload schema';

commit;
