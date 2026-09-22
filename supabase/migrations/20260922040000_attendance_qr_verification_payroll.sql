-- VIBE Academy
-- QR Attendance Phase 2
--
-- CHECK_IN + CHECK_OUT
-- -> immutable QR verification
-- -> canonical employee_attendance_entries
-- -> payroll evidence
--
-- Human maker/checker workflow remains unchanged for manual corrections.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
declare
  missing_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_QR_PHASE2_REQUIRES_POSTGRES';
  end if;

  if to_regclass(
       'public.employee_attendance_scan_events'
     ) is null
     or to_regclass(
       'public.employee_attendance_entries'
     ) is null
     or to_regprocedure(
       'hr_private.monthly_payroll_evidence(uuid,date,date)'
     ) is null
  then
    raise exception 'VIBE_QR_PHASE2_PREREQUISITE_MISSING';
  end if;

  select count(*)
  into missing_count
  from (
    values
      ('employee_id'),
      ('work_date'),
      ('shift_code'),
      ('revision'),
      ('status'),
      ('entry_kind'),
      ('schedule_snapshot'),
      ('arrived_at'),
      ('departed_at'),
      ('late_minutes'),
      ('early_minutes'),
      ('reason'),
      ('actor'),
      ('checker'),
      ('previous_entry_id'),
      ('request_id'),
      ('leave_policy_id'),
      ('paid_leave_minutes'),
      ('unpaid_leave_minutes')
  ) required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema='public'
      and c.table_name='employee_attendance_entries'
      and c.column_name=required.column_name
  );

  if missing_count <> 0 then
    raise exception
      'VIBE_QR_PHASE2_ATTENDANCE_ENTRY_CONTRACT_CHANGED';
  end if;

  if to_regclass(
       'public.employee_attendance_qr_verifications'
     ) is not null
  then
    raise exception 'VIBE_QR_PHASE2_ALREADY_EXISTS';
  end if;
end;
$preflight$;


-- ============================================================
-- 1. SYSTEM VERIFICATION
-- ============================================================

create table public.employee_attendance_qr_verifications (
  id uuid primary key
    default pg_catalog.gen_random_uuid(),

  employee_id uuid not null
    references public.employees(id)
    on delete restrict,

  work_date date not null,

  shift_code text not null,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  check_in_event_id uuid not null unique
    references public.employee_attendance_scan_events(id)
    on delete restrict,

  check_out_event_id uuid not null unique
    references public.employee_attendance_scan_events(id)
    on delete restrict,

  attendance_entry_id uuid unique
    references public.employee_attendance_entries(id)
    on delete restrict,

  verification_status text not null
    check (
      verification_status in (
        'VERIFIED',
        'CONFLICT'
      )
    ),

  verification_method text not null
    default 'QR_SYSTEM'
    check (
      verification_method='QR_SYSTEM'
    ),

  conflict_reason text,

  verified_at timestamptz not null
    default clock_timestamp(),

  created_at timestamptz not null
    default clock_timestamp(),

  constraint attendance_qr_verification_shape
  check (
    (
      verification_status='VERIFIED'
      and attendance_entry_id is not null
      and conflict_reason is null
    )
    or
    (
      verification_status='CONFLICT'
      and attendance_entry_id is null
      and conflict_reason is not null
      and btrim(conflict_reason)<>''
    )
  )
);

create unique index attendance_qr_verification_shift_verified
on public.employee_attendance_qr_verifications(
  employee_id,
  work_date,
  shift_code
)
where verification_status='VERIFIED';

create index attendance_qr_verification_entry
on public.employee_attendance_qr_verifications(
  attendance_entry_id
);

create index attendance_qr_verification_branch_date
on public.employee_attendance_qr_verifications(
  branch_id,
  work_date desc
);

alter table public.employee_attendance_qr_verifications
enable row level security;

revoke all
on public.employee_attendance_qr_verifications
from public,anon,authenticated,service_role;


-- ============================================================
-- 2. VERIFICATION IMMUTABILITY
-- ============================================================

create function public.guard_attendance_qr_verification_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  raise exception
    'QR_ATTENDANCE_VERIFICATION_IS_IMMUTABLE';
end;
$fn$;

revoke all
on function public.guard_attendance_qr_verification_immutable()
from public,anon,authenticated,service_role;

create trigger attendance_qr_verification_no_update
before update
on public.employee_attendance_qr_verifications
for each row
execute function
public.guard_attendance_qr_verification_immutable();

create trigger attendance_qr_verification_no_delete
before delete
on public.employee_attendance_qr_verifications
for each row
execute function
public.guard_attendance_qr_verification_immutable();


-- ============================================================
-- 3. MATERIALIZE CHECK-OUT INTO CANONICAL ATTENDANCE
-- ============================================================

create function public.materialize_qr_attendance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  check_in_row
    public.employee_attendance_scan_events%rowtype;

  existing_entry
    public.employee_attendance_entries%rowtype;

  entry_id_value uuid;

  starts_value timestamptz;
  ends_value timestamptz;

  late_value integer;
  early_value integer;

  status_value text;
begin
  if new.event_type <> 'CHECK_OUT' then
    return new;
  end if;

  if exists (
    select 1
    from public.employee_attendance_qr_verifications v
    where v.check_out_event_id=new.id
  ) then
    return new;
  end if;

  select *
  into check_in_row
  from public.employee_attendance_scan_events
  where id=new.paired_check_in_id;

  if not found then
    raise exception
      'QR_ATTENDANCE_CHECK_IN_EVIDENCE_MISSING';
  end if;

  if check_in_row.event_type <> 'CHECK_IN'
     or check_in_row.employee_id is distinct from new.employee_id
     or check_in_row.work_date is distinct from new.work_date
     or check_in_row.shift_code is distinct from new.shift_code
     or check_in_row.branch_id is distinct from new.branch_id
  then
    raise exception
      'QR_ATTENDANCE_PAIR_CONFLICT';
  end if;

  if check_in_row.scanned_at > new.scanned_at then
    raise exception
      'QR_ATTENDANCE_TIME_CONFLICT';
  end if;

  if check_in_row.schedule_snapshot
     is distinct from new.schedule_snapshot
  then
    raise exception
      'QR_ATTENDANCE_SCHEDULE_SNAPSHOT_CONFLICT';
  end if;

  select *
  into existing_entry
  from public.employee_attendance_entries e
  where e.employee_id=new.employee_id
    and e.work_date=new.work_date
    and e.shift_code=new.shift_code
  order by e.revision desc
  limit 1;

  if found then
    insert into public.employee_attendance_qr_verifications(
      employee_id,
      work_date,
      shift_code,
      branch_id,
      check_in_event_id,
      check_out_event_id,
      verification_status,
      conflict_reason
    )
    values(
      new.employee_id,
      new.work_date,
      new.shift_code,
      new.branch_id,
      check_in_row.id,
      new.id,
      'CONFLICT',
      'ATTENDANCE_ENTRY_ALREADY_EXISTS'
    );

    return new;
  end if;

  starts_value :=
    (
      check_in_row.schedule_snapshot
      ->>'starts_at'
    )::timestamptz;

  ends_value :=
    (
      check_in_row.schedule_snapshot
      ->>'ends_at'
    )::timestamptz;

  if starts_value is null
     or ends_value is null
     or ends_value <= starts_value
  then
    raise exception
      'QR_ATTENDANCE_INVALID_SCHEDULE_SNAPSHOT';
  end if;

  late_value :=
    greatest(
      0,
      ceil(
        extract(
          epoch from (
            check_in_row.scanned_at
            - starts_value
          )
        ) / 60
      )::integer
    );

  early_value :=
    greatest(
      0,
      ceil(
        extract(
          epoch from (
            ends_value
            - new.scanned_at
          )
        ) / 60
      )::integer
    );

  status_value :=
    case
      when late_value > 0 then 'LATE'
      when early_value > 0 then 'EARLY_LEAVE'
      else 'WORKED'
    end;

  insert into public.employee_attendance_entries(
    employee_id,
    work_date,
    shift_code,
    revision,
    status,
    entry_kind,
    schedule_snapshot,
    arrived_at,
    departed_at,
    late_minutes,
    early_minutes,
    reason,
    actor,
    checker,
    previous_entry_id,
    request_id,
    leave_policy_id,
    paid_leave_minutes,
    unpaid_leave_minutes
  )
  values(
    new.employee_id,
    new.work_date,
    new.shift_code,
    1,
    status_value,
    'INITIAL',
    check_in_row.schedule_snapshot,
    check_in_row.scanned_at,
    new.scanned_at,
    late_value,
    early_value,
    'QR_SYSTEM_AUTO',
    new.profile_id,
    null,
    null,
    null,
    null,
    0,
    0
  )
  returning id
  into entry_id_value;

  insert into public.employee_attendance_qr_verifications(
    employee_id,
    work_date,
    shift_code,
    branch_id,
    check_in_event_id,
    check_out_event_id,
    attendance_entry_id,
    verification_status
  )
  values(
    new.employee_id,
    new.work_date,
    new.shift_code,
    new.branch_id,
    check_in_row.id,
    new.id,
    entry_id_value,
    'VERIFIED'
  );

  return new;
end;
$fn$;

revoke all
on function public.materialize_qr_attendance()
from public,anon,authenticated,service_role;

create trigger attendance_qr_materialize_checkout
after insert
on public.employee_attendance_scan_events
for each row
execute function
public.materialize_qr_attendance();


-- ============================================================
-- 4. PAYROLL ACCEPTS HUMAN APPROVAL OR VERIFIED QR EVIDENCE
-- ============================================================

create or replace function hr_private.monthly_payroll_evidence(
  p_employee uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  s record;
  a public.employee_attendance_entries;

  required_minutes integer:=0;
  payable_minutes integer:=0;
  shift_payable integer;

  sources jsonb:='[]'::jsonb;
  qr_verification jsonb;
begin
  if not public.has_role('SUPER_ADMIN') then
    raise exception 'Payroll preparation denied';
  end if;

  for s in
    select *
    from public.employee_schedule(
      p_employee,
      p_from,
      p_to
    )
    order by work_date,shift_code
  loop

    select *
    into a
    from public.employee_attendance_entries e
    where e.employee_id=p_employee
      and e.work_date=s.work_date
      and e.shift_code=s.shift_code
    order by e.revision desc
    limit 1;

    qr_verification:=null;

    if a.id is not null then
      select to_jsonb(v)
      into qr_verification
      from public.employee_attendance_qr_verifications v
      where v.attendance_entry_id=a.id
        and v.verification_status='VERIFIED'
      limit 1;
    end if;

    shift_payable:=0;

    if s.scheduled_minutes>0 then

      if a.id is null
         or (
           a.checker is null
           and qr_verification is null
         )
      then
        raise exception
          'Approved attendance required for every required shift';
      end if;

      if a.status in (
        'WORKED',
        'BUSINESS_TRIP',
        'LATE',
        'EARLY_LEAVE'
      )
      then
        shift_payable:=s.scheduled_minutes;

      elsif a.status='PAID_LEAVE' then

        if a.leave_policy_id is null
           or (
             a.paid_leave_minutes
             + a.unpaid_leave_minutes
           ) <> s.scheduled_minutes
        then
          raise exception
            'Paid leave evidence does not reconcile';
        end if;

        shift_payable:=a.paid_leave_minutes;

      elsif a.status not in (
        'UNPAID_LEAVE',
        'UNAUTHORIZED_ABSENCE'
      )
      then
        raise exception
          'Attendance conflicts with required schedule';
      end if;

    elsif a.id is not null
      and a.status<>'SCHEDULED_OFF'
    then
      raise exception
        'Attendance conflicts with scheduled rest';
    end if;

    required_minutes :=
      required_minutes
      + s.scheduled_minutes;

    payable_minutes :=
      payable_minutes
      + shift_payable;

    sources :=
      sources
      ||
      jsonb_build_array(
        jsonb_build_object(
          'schedule',
            to_jsonb(s),

          'attendance',
            case
              when a.id is not null
              then to_jsonb(a)
              else null
            end,

          'verification',
            qr_verification,

          'payable_minutes',
            shift_payable
        )
      );

  end loop;

  if required_minutes=0 then
    raise exception
      'No required minutes; manual payroll review required';
  end if;

  if payable_minutes<0
     or payable_minutes>required_minutes
  then
    raise exception
      'Payroll minutes do not reconcile';
  end if;

  return jsonb_build_object(
    'calculation_version',
      'SCHEDULED_MINUTES_V1',

    'employee_id',
      p_employee,

    'starts_on',
      p_from,

    'ends_on',
      p_to,

    'required_minutes',
      required_minutes,

    'payable_minutes',
      payable_minutes,

    'unpaid_minutes',
      required_minutes-payable_minutes,

    'late_early_policy',
      'RECORD_ONLY',

    'sources',
      sources
  );
end;
$function$;


-- ============================================================
-- 5. ADMIN READ MODEL FOR QR VERIFIED ATTENDANCE
-- ============================================================

create function public.get_employee_attendance_qr_verified_entries(
  p_employee uuid,
  p_from date,
  p_to date
)
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
     or not coalesce(
       public.has_role('SUPER_ADMIN'),
       false
     )
  then
    raise exception 'QR_ATTENDANCE_READ_DENIED';
  end if;

  if p_employee is null
     or p_from is null
     or p_to is null
     or p_to<p_from
     or p_to-p_from>62
  then
    raise exception
      'QR_ATTENDANCE_INVALID_RANGE';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attendance_entry_id',
          v.attendance_entry_id,

        'work_date',
          v.work_date,

        'shift_code',
          v.shift_code,

        'verification_method',
          v.verification_method,

        'verification_status',
          v.verification_status,

        'verified_at',
          v.verified_at
      )
      order by v.work_date,v.shift_code
    ),
    '[]'::jsonb
  )
  into result
  from public.employee_attendance_qr_verifications v
  where v.employee_id=p_employee
    and v.work_date between p_from and p_to
    and v.verification_status='VERIFIED';

  return result;
end;
$fn$;

revoke all
on function public.get_employee_attendance_qr_verified_entries(
  uuid,date,date
)
from public,anon,authenticated,service_role;

grant execute
on function public.get_employee_attendance_qr_verified_entries(
  uuid,date,date
)
to authenticated;


-- ============================================================
-- 6. RECENT SCAN FEED NOW EXPOSES VERIFICATION STATE
-- ============================================================

create or replace function public.get_attendance_qr_recent_scans(
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
        coalesce(p_limit,30),
        1
      ),
      100
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',
          x.id,

        'employee_id',
          x.employee_id,

        'employee_code',
          d.employee_code,

        'employee_name',
          d.full_name,

        'branch_id',
          x.branch_id,

        'work_date',
          x.work_date,

        'shift_code',
          x.shift_code,

        'event_type',
          x.event_type,

        'scanned_at',
          x.scanned_at,

        'verification_method',
          x.verification_method,

        'verification_status',
          case
            when x.event_type='CHECK_IN'
              then 'WAITING_CHECK_OUT'
            else coalesce(
              v.verification_status,
              'PENDING'
            )
          end
      )
      order by x.scanned_at desc,x.id desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select e.*
    from public.employee_attendance_scan_events e
    where e.branch_id=p_branch
    order by e.scanned_at desc,e.id desc
    limit safe_limit
  ) x
  left join public.employee_directory d
    on d.id=x.employee_id
  left join public.employee_attendance_qr_verifications v
    on v.check_out_event_id=x.id;

  return result;
end;
$fn$;


notify pgrst,'reload schema';

commit;
