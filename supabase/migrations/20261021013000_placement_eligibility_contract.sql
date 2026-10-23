-- One eligibility contract for placement search and confirmation.
-- Candidate search evaluates every authorized shift for the student, then
-- paginates. A past desired date is never treated as a confirmed start.
-- Historical import does not use assign_student_placement.

alter table public.student_placement_cases
  add column if not exists availability_days smallint[],
  add column if not exists availability_start time,
  add column if not exists availability_end time,
  add column if not exists availability_mode text,
  add column if not exists availability_note text;

alter table public.student_placement_cases
  drop constraint if exists student_placement_availability_mode;
alter table public.student_placement_cases
  add constraint student_placement_availability_mode
  check (availability_mode is null or availability_mode in ('PREFERENCE', 'HARD'));

alter table public.student_placement_cases
  drop constraint if exists student_placement_availability_days;
alter table public.student_placement_cases
  add constraint student_placement_availability_days
  check (
    availability_days is null
    or (
      cardinality(availability_days) between 1 and 7
      and availability_days <@ array[1,2,3,4,5,6,7]::smallint[]
    )
  );

alter table public.student_placement_cases
  drop constraint if exists student_placement_availability_times;
alter table public.student_placement_cases
  add constraint student_placement_availability_times
  check (
    (availability_start is null and availability_end is null)
    or (availability_start is not null and availability_end is not null and availability_end > availability_start)
  );

-- Supports list_placement_candidates: branch + status before the timetable check.
create index if not exists classes_branch_status_curriculum_idx
  on public.classes (branch_id, status, curriculum_id);

-- Supports the open-seat count inside the same decision.
create index if not exists enrollments_open_class_idx
  on public.enrollments (class_id)
  where status in ('ACTIVE', 'PAUSED');

create or replace function public.placement_participation_date(p_desired date)
returns date
language sql
stable
set search_path to public, pg_temp
as $$
  select case
    when p_desired is null or p_desired < public.registration_vietnam_today()
      then public.registration_vietnam_today()
    else p_desired
  end
$$;

create or replace function public.placement_shift_decision(
  p_placement uuid,
  p_class uuid,
  p_start date,
  p_exclude uuid default null
)
returns table (
  outcome text,
  reason_code text,
  preference_fit text,
  open_seats integer,
  first_session_at timestamptz,
  schedule_label text,
  teacher_name text,
  room_name text,
  level_label text,
  suggestion_code text,
  rank_score integer
)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
declare
  placement public.student_placement_cases%rowtype;
  class_row public.classes%rowtype;
  app public.registration_applications%rowtype;
  scope_code text;
  schedule_code text;
  occupied integer;
  teacher uuid;
  fit text := 'UNSTATED';
  suggestion text := 'NONE';
  reason text := null;
  result_outcome text := 'INELIGIBLE';
  seats integer := null;
  first_at timestamptz;
  label text;
  teacher_label text;
  room_label text;
  level_text text;
begin
  select * into placement from public.student_placement_cases where id = p_placement;
  if not found or auth.uid() is null or not public.registration_can('student_placement.view', placement.branch_id) then
    outcome := 'CANNOT_EVALUATE';
    reason_code := 'PLACEMENT_UNAUTHORIZED';
    preference_fit := 'UNSTATED';
    open_seats := 0;
    suggestion_code := 'NONE';
    rank_score := 99;
    return next;
    return;
  end if;

  select * into app from public.registration_applications where id = placement.registration_application_id;
  select * into class_row from public.classes where id = p_class;

  select string_agg(
    case schedule.day_of_week
      when 1 then 'Thứ 2' when 2 then 'Thứ 3' when 3 then 'Thứ 4'
      when 4 then 'Thứ 5' when 5 then 'Thứ 6' when 6 then 'Thứ 7' else 'Chủ nhật'
    end || ' ' || to_char(schedule.start_time, 'HH24:MI') || '–' || to_char(schedule.end_time, 'HH24:MI'),
    ', ' order by schedule.day_of_week, schedule.start_time
  )
  into label
  from public.schedules schedule
  where schedule.class_id = p_class and schedule.status = 'ACTIVE';

  select room.name into room_label
  from public.schedules schedule
  left join public.rooms room on room.id = schedule.room_id
  where schedule.class_id = p_class and schedule.status = 'ACTIVE'
  order by schedule.day_of_week, schedule.start_time
  limit 1;

  select case
    when from_level.name is null or to_level.name is null then null
    when from_level.id = to_level.id then from_level.name
    else from_level.name || ' – ' || to_level.name
  end
  into level_text
  from public.classes scoped
  left join public.curriculum_levels from_level on from_level.id = scoped.accepted_from_level_id
  left join public.curriculum_levels to_level on to_level.id = scoped.accepted_to_level_id
  where scoped.id = p_class;

  if placement.availability_days is null then
    fit := 'UNSTATED';
  elsif not exists (
    select 1 from public.schedules schedule
    where schedule.class_id = p_class and schedule.status = 'ACTIVE'
  ) then
    fit := 'NONE';
  elsif not exists (
    select 1 from public.schedules schedule
    where schedule.class_id = p_class
      and schedule.status = 'ACTIVE'
      and schedule.day_of_week = any(placement.availability_days)
      and (
        placement.availability_start is null
        or (schedule.start_time < placement.availability_end and placement.availability_start < schedule.end_time)
      )
  ) then
    fit := 'NONE';
  elsif exists (
    select 1 from public.schedules schedule
    where schedule.class_id = p_class
      and schedule.status = 'ACTIVE'
      and (
        schedule.day_of_week <> all(placement.availability_days)
        or (
          placement.availability_start is not null
          and not (schedule.start_time < placement.availability_end and placement.availability_start < schedule.end_time)
        )
      )
  ) then
    fit := 'PARTIAL';
  else
    fit := 'MATCH';
  end if;

  if class_row.id is null then
    result_outcome := 'INELIGIBLE';
    reason := 'PLACEMENT_CLASS_DENIED';
  elsif app.id is null or app.status is distinct from 'COMPLETED' then
    result_outcome := 'CANNOT_EVALUATE';
    reason := 'PAYMENT_NOT_READY';
    suggestion := 'PAYMENT';
  elsif public.registration_program_id(app.id) is null then
    result_outcome := 'CANNOT_EVALUATE';
    reason := 'DATA_MISSING';
  elsif class_row.branch_id is distinct from placement.branch_id or class_row.status is distinct from 'ACTIVE' then
    result_outcome := 'INELIGIBLE';
    reason := case when class_row.status = 'DRAFT' then 'PLACEMENT_NOT_READY' else 'PLACEMENT_CLASS_DENIED' end;
    suggestion := case when class_row.status = 'DRAFT' then 'ACTIVATE' else 'NONE' end;
  elsif public.registration_program_id(app.id) is distinct from public.shift_program_id(class_row.id) then
    result_outcome := 'INELIGIBLE';
    reason := 'PLACEMENT_PROGRAM_DENIED';
  else
    scope_code := public.class_enrollment_compatibility(class_row.id, placement.student_id);
    if scope_code = 'CLASS_SCOPE_UNCONFIGURED' then
      result_outcome := 'INELIGIBLE';
      reason := 'PLACEMENT_SCOPE_MISSING';
      suggestion := 'CONFIGURE_SCOPE';
    elsif scope_code in ('ACADEMIC_PROGRAM_MISSING', 'CURRENT_LEVEL_MISSING') then
      result_outcome := 'CANNOT_EVALUATE';
      reason := 'DATA_MISSING';
    elsif scope_code is distinct from 'IN_SCOPE' then
      result_outcome := 'INELIGIBLE';
      reason := 'PLACEMENT_LEVEL_DENIED';
    elsif p_start is null or p_start < public.registration_vietnam_today() then
      result_outcome := 'INELIGIBLE';
      reason := 'PLACEMENT_START_PAST';
    elsif class_row.start_date is not null and p_start < class_row.start_date
       or class_row.end_date is not null and p_start > class_row.end_date then
      result_outcome := 'INELIGIBLE';
      reason := 'PLACEMENT_START_DENIED';
    else
      select count(*) into occupied
      from public.enrollments enrollment
      where enrollment.class_id = class_row.id
        and enrollment.status in ('ACTIVE', 'PAUSED')
        and enrollment.id is distinct from p_exclude;
      seats := class_row.capacity - occupied;
      if seats <= 0 then
        result_outcome := 'INELIGIBLE';
        reason := 'PLACEMENT_CLASS_FULL';
      elsif exists (
        select 1 from public.enrollments enrollment
        where enrollment.student_id = placement.student_id
          and enrollment.class_id = class_row.id
          and enrollment.status in ('ACTIVE', 'PAUSED')
          and enrollment.id is distinct from p_exclude
      ) then
        result_outcome := 'INELIGIBLE';
        reason := 'PLACEMENT_ALREADY_ENROLLED';
      else
        select (array_agg(ct.teacher_id))[1] into teacher
        from public.class_teachers ct
        where ct.class_id = class_row.id
          and ct.teacher_role = 'PRIMARY'
          and (ct.is_active or ct.ended_at is not null)
          and ct.assigned_at <= p_start
          and (ct.ended_at is null or ct.ended_at >= p_start)
        having count(*) = 1;
        if teacher is null then
          result_outcome := 'INELIGIBLE';
          reason := 'PLACEMENT_TEACHER_REQUIRED';
          suggestion := 'ASSIGN_TEACHER';
        elsif label is null then
          result_outcome := 'INELIGIBLE';
          reason := 'PLACEMENT_SCHEDULE_REQUIRED';
          suggestion := 'ADD_SCHEDULE';
        elsif placement.availability_mode = 'HARD' and fit = 'NONE' then
          result_outcome := 'INELIGIBLE';
          reason := 'PLACEMENT_AVAILABILITY';
          suggestion := 'ADJUST_AVAILABILITY';
        else
          schedule_code := public.placement_schedule_check(class_row.id, placement.student_id, p_start, null, p_exclude);
          if schedule_code = 'CLEAR' then
            result_outcome := 'ELIGIBLE';
            reason := 'ELIGIBLE';
          elsif schedule_code = 'PLACEMENT_SCHEDULE_UNKNOWN' then
            result_outcome := 'CANNOT_EVALUATE';
            reason := schedule_code;
            suggestion := 'REVIEW_SCHEDULE';
          else
            result_outcome := 'INELIGIBLE';
            reason := schedule_code;
            suggestion := case schedule_code
              when 'PLACEMENT_SCHEDULE_REQUIRED' then 'ADD_SCHEDULE'
              else 'NONE'
            end;
          end if;
        end if;
      end if;
    end if;
  end if;

  if teacher is not null then
    select coalesce(profile.full_name, teacher_row.full_name) into teacher_label
    from public.teachers teacher_row
    left join public.profiles profile on profile.id = teacher_row.user_id
    where teacher_row.id = teacher;
  end if;

  if result_outcome = 'ELIGIBLE' and label is not null and p_start is not null then
    select min(slot.starts_at) into first_at
    from public.placement_timetable(p_class, p_start, p_start + 21) slot
    where not slot.makeup
      and (slot.starts_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_start;
  end if;

  outcome := result_outcome;
  reason_code := coalesce(reason, 'PLACEMENT_CLASS_DENIED');
  preference_fit := fit;
  open_seats := seats;
  first_session_at := first_at;
  schedule_label := label;
  teacher_name := teacher_label;
  room_name := room_label;
  level_label := level_text;
  suggestion_code := suggestion;
  rank_score := case fit when 'MATCH' then 0 when 'PARTIAL' then 1 when 'UNSTATED' then 2 else 3 end;
  return next;
end;
$$;

revoke all on function public.placement_shift_decision(uuid, uuid, date, uuid) from public, anon, authenticated;

create or replace function public.list_placement_candidates(
  p_placement uuid,
  p_start date,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  class_id uuid,
  class_code text,
  class_name text,
  branch_name text,
  outcome text,
  reason_code text,
  preference_fit text,
  open_seats integer,
  capacity integer,
  enrolled_count integer,
  first_session_at timestamptz,
  schedule_label text,
  teacher_name text,
  room_name text,
  level_label text,
  suggestion_code text,
  rank_score integer,
  total_eligible integer,
  total_ineligible integer,
  total_unknown integer,
  evaluated_count integer
)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
declare
  placement public.student_placement_cases%rowtype;
  app public.registration_applications%rowtype;
  v_start date;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  select * into placement from public.student_placement_cases where id = p_placement;
  if not found or not public.registration_can('student_placement.view', placement.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  select * into app from public.registration_applications where id = placement.registration_application_id;
  v_start := public.placement_participation_date(coalesce(p_start, placement.desired_start_date));

  return query
  with relevant as (
    select class_row.id, class_row.code, class_row.name, class_row.capacity, branch.name as branch_name
    from public.classes class_row
    join public.branches branch on branch.id = class_row.branch_id
    where class_row.branch_id = placement.branch_id
      and class_row.status in ('ACTIVE', 'DRAFT')
      and (
        app.id is null
        or public.registration_program_id(app.id) is null
        or public.shift_program_id(class_row.id) = public.registration_program_id(app.id)
      )
  ),
  decided as (
    select relevant.id, relevant.code, relevant.name, relevant.capacity, relevant.branch_name, decision.*
    from relevant
    cross join lateral public.placement_shift_decision(placement.id, relevant.id, v_start, placement.enrollment_id) decision
  ),
  counts as (
    select
      count(*) filter (where decided.outcome = 'ELIGIBLE')::integer as eligible,
      count(*) filter (where decided.outcome = 'INELIGIBLE')::integer as ineligible,
      count(*) filter (where decided.outcome = 'CANNOT_EVALUATE')::integer as unknown,
      count(*)::integer as evaluated
    from decided
  ),
  eligible_page as (
    select decided.*
    from decided
    where decided.outcome = 'ELIGIBLE'
    order by decided.rank_score, decided.first_session_at nulls last, decided.name, decided.id
    offset v_offset
    limit v_limit
  ),
  fallback as (
    select decided.*
    from decided
    where decided.outcome <> 'ELIGIBLE'
      and not exists (select 1 from eligible_page)
    order by
      case decided.suggestion_code
        when 'CONFIGURE_SCOPE' then 0
        when 'ASSIGN_TEACHER' then 1
        when 'ADD_SCHEDULE' then 2
        when 'ACTIVATE' then 3
        when 'REVIEW_SCHEDULE' then 4
        else 5
      end,
      decided.name,
      decided.id
    limit 8
  ),
  shown as (
    select eligible_page.* from eligible_page
    union all
    select fallback.* from fallback
  )
  select
    shown.id,
    shown.code,
    shown.name,
    shown.branch_name,
    shown.outcome,
    shown.reason_code,
    shown.preference_fit,
    shown.open_seats,
    shown.capacity,
    shown.capacity - shown.open_seats,
    shown.first_session_at,
    shown.schedule_label,
    shown.teacher_name,
    shown.room_name,
    shown.level_label,
    shown.suggestion_code,
    shown.rank_score,
    counts.eligible,
    counts.ineligible,
    counts.unknown,
    counts.evaluated
  from shown
  cross join counts
  union all
  select
    null::uuid, null::text, null::text, null::text,
    'EMPTY', null::text, null::text, null::integer, null::integer, null::integer,
    null::timestamptz, null::text, null::text, null::text, null::text, 'CREATE_SHIFT', null::integer,
    counts.eligible, counts.ineligible, counts.unknown, counts.evaluated
  from counts
  where not exists (select 1 from shown);
end;
$$;

revoke all on function public.list_placement_candidates(uuid, date, integer, integer) from public, anon;
grant execute on function public.list_placement_candidates(uuid, date, integer, integer) to authenticated;

create or replace function public.placement_queue_signals(p_cases uuid[])
returns table (placement_id uuid, blocker_code text)
language plpgsql
stable
security definer
set search_path to public, pg_temp
as $$
begin
  if auth.uid() is null or p_cases is null or cardinality(p_cases) > 100 then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  return query
  select placement.id,
    case
      when app.status is distinct from 'COMPLETED' then 'PAYMENT_NOT_READY'
      when public.registration_program_id(app.id) is null
        or (
          public.student_program_level_name(placement.student_id, public.registration_program_id(app.id)) is null
          and app.level_id is null
        ) then 'DATA_MISSING'
      when exists (
        select 1
        from public.classes class_row
        where class_row.branch_id = placement.branch_id
          and class_row.status = 'ACTIVE'
          and public.shift_program_id(class_row.id) = public.registration_program_id(app.id)
          and public.class_enrollment_compatibility(class_row.id, placement.student_id) = 'IN_SCOPE'
          and exists (
            select 1 from public.schedules schedule
            where schedule.class_id = class_row.id and schedule.status = 'ACTIVE' and schedule.room_id is not null
          )
          and exists (
            select 1 from public.class_teachers ct
            where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY'
              and (ct.is_active or ct.ended_at is not null)
            having count(*) = 1
          )
          and (
            select count(*) from public.enrollments enrollment
            where enrollment.class_id = class_row.id and enrollment.status in ('ACTIVE', 'PAUSED')
          ) < class_row.capacity
      ) then 'READY'
      when exists (
        select 1 from public.classes class_row
        where class_row.branch_id = placement.branch_id
          and class_row.status in ('ACTIVE', 'DRAFT')
          and public.shift_program_id(class_row.id) = public.registration_program_id(app.id)
          and (class_row.accepted_from_level_id is null or class_row.accepted_to_level_id is null)
      ) then 'SCOPE_MISSING'
      else 'NO_READY_SHIFT'
    end
  from public.student_placement_cases placement
  join public.registration_applications app on app.id = placement.registration_application_id
  where placement.id = any(p_cases)
    and public.registration_can('student_placement.view', placement.branch_id);
end;
$$;

revoke all on function public.placement_queue_signals(uuid[]) from public, anon;
grant execute on function public.placement_queue_signals(uuid[]) to authenticated;

create or replace function public.set_placement_availability(
  p_placement uuid,
  p_days smallint[],
  p_start time,
  p_end time,
  p_mode text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  placement public.student_placement_cases%rowtype;
  mode text := nullif(upper(btrim(coalesce(p_mode, ''))), '');
begin
  if auth.uid() is null then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  select * into placement from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', placement.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  if mode is not null and mode not in ('PREFERENCE', 'HARD') then
    raise exception 'PLACEMENT_AVAILABILITY';
  end if;
  if p_days is not null and (
    cardinality(p_days) < 1
    or cardinality(p_days) > 7
    or exists (select 1 from unnest(p_days) day where day < 1 or day > 7)
  ) then
    raise exception 'PLACEMENT_AVAILABILITY';
  end if;
  if (p_start is null) is distinct from (p_end is null) or (p_start is not null and p_end <= p_start) then
    raise exception 'PLACEMENT_AVAILABILITY';
  end if;
  update public.student_placement_cases
  set availability_days = p_days,
      availability_start = p_start,
      availability_end = p_end,
      availability_mode = mode,
      availability_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      updated_at = clock_timestamp()
  where id = placement.id;
  return placement.id;
end;
$$;

revoke all on function public.set_placement_availability(uuid, smallint[], time, time, text, text) from public, anon;
grant execute on function public.set_placement_availability(uuid, smallint[], time, time, text, text) to authenticated;

-- Longest-waiting and overdue desired dates stay at the front of the queue.
create or replace function public.list_waiting_placements_by_curriculum(
  p_curriculum uuid,
  p_branch uuid,
  p_filter text,
  p_search text,
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  placement_id uuid,
  placement_version integer,
  student_id uuid,
  student_name text,
  parent_name text,
  branch_id uuid,
  branch_name text,
  program_name text,
  level_name text,
  desired_start date,
  preferred_schedule text,
  placement_status text,
  class_name text,
  teacher_name text,
  scheduled_start date,
  owner_name text,
  completed_on date,
  days_waiting integer,
  opened_on date,
  enrollment_id uuid,
  class_id uuid,
  course_id uuid
)
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(curriculum.name, program.name, app.program_interest),
    coalesce(
      public.student_program_level_name(student.id, coalesce(app.curriculum_id, program.curriculum_id)),
      registration_level.name,
      course_level.name
    ),
    placement.desired_start_date, placement.preferred_schedule,
    placement.status,
    class_row.name,
    (select teacher.full_name from public.teachers teacher where teacher.id = placement.assigned_teacher_id),
    placement.scheduled_start_date,
    (select profile.full_name from public.profiles profile where profile.id = placement.owner_user_id),
    coalesce(app.payment_confirmed_at, app.completed_at)::date,
    public.registration_vietnam_today() - placement.opened_at::date,
    placement.opened_at::date,
    placement.enrollment_id,
    placement.assigned_class_id,
    coalesce(app.course_id, class_row.course_id)
  from public.student_placement_cases placement
  join public.students student on student.id = placement.student_id
  join public.registration_applications app on app.id = placement.registration_application_id
  join public.branches branch on branch.id = placement.branch_id
  left join public.classes class_row on class_row.id = placement.assigned_class_id
  left join public.courses program on program.id = coalesce(app.course_id, class_row.course_id)
  left join public.curriculums curriculum on curriculum.id = coalesce(app.curriculum_id, program.curriculum_id)
  left join public.curriculum_levels registration_level on registration_level.id = app.level_id
  left join public.curriculum_levels course_level on course_level.id = program.level_id
  where public.registration_can('student_placement.view', placement.branch_id)
    and (p_curriculum is null or coalesce(app.curriculum_id, program.curriculum_id) = p_curriculum)
    and (p_branch is null or placement.branch_id = p_branch)
    and placement.status in ('UNASSIGNED', 'MATCHING')
    and (
      coalesce(p_filter, 'ALL') = 'ALL'
      or (p_filter = 'UNASSIGNED' and placement.status = 'UNASSIGNED')
      or (p_filter = 'MATCHING' and placement.status = 'MATCHING')
    )
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or student.full_name ilike '%' || replace(btrim(p_search), '%', '') || '%'
      or student.student_code ilike '%' || replace(btrim(p_search), '%', '') || '%'
    )
  order by
    case
      when placement.desired_start_date is not null
        and placement.desired_start_date < public.registration_vietnam_today() then 0
      else 1
    end,
    placement.opened_at,
    student.full_name
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Close the previous recurring row and open the next one in one transaction.
-- Occurrences that already have attendance stay untouched.
create or replace function public.split_recurring_schedule(
  p_schedule uuid,
  p_from date,
  p_day smallint,
  p_start time,
  p_end time,
  p_room uuid
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  schedule public.schedules%rowtype;
  class_branch uuid;
  room_branch uuid;
  room_status text;
  occurrence uuid;
  created uuid;
begin
  if auth.uid() is null or not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  if p_from is null or p_day < 1 or p_day > 7 or p_start is null or p_end is null or p_end <= p_start or p_room is null then
    raise exception 'PLACEMENT_SCHEDULE_REQUIRED';
  end if;
  select * into schedule from public.schedules where id = p_schedule for update;
  if not found or schedule.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_SCHEDULE_REQUIRED';
  end if;
  select branch_id into class_branch from public.classes where id = schedule.class_id;
  select branch_id, status into room_branch, room_status from public.rooms where id = p_room;
  if room_status is distinct from 'ACTIVE' or room_branch is distinct from class_branch then
    raise exception 'PLACEMENT_ROOM_CONFLICT';
  end if;
  if exists (
    select 1
    from public.session_occurrences occurrence_row
    join public.attendance_records attendance on attendance.session_occurrence_id = occurrence_row.id
    where occurrence_row.schedule_id = schedule.id
      and occurrence_row.occurrence_date >= p_from
  ) then
    raise exception 'PLACEMENT_HISTORY_LOCKED';
  end if;
  for occurrence in
    select occurrence_row.id
    from public.session_occurrences occurrence_row
    where occurrence_row.schedule_id = schedule.id
      and occurrence_row.status = 'SCHEDULED'
      and occurrence_row.occurrence_date >= p_from
  loop
    perform public.set_session_occurrence_status(occurrence, 'CANCELLED');
  end loop;
  if schedule.effective_from < p_from then
    update public.schedules
    set effective_to = p_from - 1, updated_at = clock_timestamp()
    where id = schedule.id;
    insert into public.schedules (class_id, room_id, day_of_week, start_time, end_time, effective_from, timezone, status)
    values (schedule.class_id, p_room, p_day, p_start, p_end, p_from, 'Asia/Ho_Chi_Minh', 'ACTIVE')
    returning id into created;
  else
    update public.schedules
    set room_id = p_room,
        day_of_week = p_day,
        start_time = p_start,
        end_time = p_end,
        effective_from = p_from,
        updated_at = clock_timestamp()
    where id = schedule.id;
    created := schedule.id;
  end if;
  return created;
end;
$$;

revoke all on function public.split_recurring_schedule(uuid, date, smallint, time, time, uuid) from public, anon;
grant execute on function public.split_recurring_schedule(uuid, date, smallint, time, time, uuid) to authenticated;

-- Confirmation uses the same decision as search. Past dates are rejected here;
-- historical import writes enrollments through its own path.
create or replace function public.assign_student_placement(
  p_request uuid,
  p_placement uuid,
  p_version integer,
  p_class uuid,
  p_start date
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
  class_row public.classes%rowtype;
  app public.registration_applications%rowtype;
  occupied integer;
  v_enrollment uuid;
  teacher_id uuid;
  scope_code text;
  decision_outcome text;
  decision_reason text;
begin
  if actor is null or p_request is null or p_class is null or p_start is null then raise exception 'PLACEMENT_INVALID'; end if;
  if p_start < public.registration_vietnam_today() then raise exception 'PLACEMENT_START_PAST'; end if;
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then
    if exists(select 1 from public.student_placement_events where id = p_request and placement_id = p_placement
      and actor_id = actor and event_type = 'CLASS_ASSIGNED' and metadata->>'class_id' = p_class::text
      and metadata->>'start' = p_start::text) then return p_placement; end if;
    raise exception 'PLACEMENT_REQUEST_REUSED';
  end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status not in ('UNASSIGNED', 'MATCHING') or row.enrollment_id is not null then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  select * into class_row from public.classes where id = p_class for update;
  if not found or class_row.branch_id <> row.branch_id or class_row.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_CLASS_DENIED';
  end if;
  select * into app from public.registration_applications where id = row.registration_application_id;
  if public.registration_program_id(app.id) is distinct from public.shift_program_id(class_row.id) then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
  end if;
  scope_code := public.class_enrollment_compatibility(class_row.id, row.student_id);
  if scope_code is distinct from 'IN_SCOPE' then raise exception 'PLACEMENT_LEVEL_DENIED'; end if;
  if class_row.start_date is not null and p_start < class_row.start_date then raise exception 'PLACEMENT_START_DENIED'; end if;
  if class_row.end_date is not null and p_start > class_row.end_date then raise exception 'PLACEMENT_START_DENIED'; end if;
  select count(*) into occupied from public.enrollments
  where class_id = class_row.id and status in ('ACTIVE', 'PAUSED');
  if occupied >= class_row.capacity then raise exception 'PLACEMENT_CLASS_FULL'; end if;
  if exists(
    select 1 from public.enrollments
    where student_id = row.student_id and class_id = class_row.id and status in ('ACTIVE', 'PAUSED')
  ) then
    raise exception 'PLACEMENT_ALREADY_ENROLLED';
  end if;
  select (array_agg(ct.teacher_id))[1] into teacher_id
  from public.class_teachers ct
  where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY'
    and (ct.is_active or ct.ended_at is not null)
    and ct.assigned_at <= p_start and (ct.ended_at is null or ct.ended_at >= p_start)
  having count(*) = 1;
  if teacher_id is null then raise exception 'PLACEMENT_TEACHER_REQUIRED'; end if;
  if not exists(
    select 1 from public.schedules schedule
    where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
  ) then
    raise exception 'PLACEMENT_SCHEDULE_REQUIRED';
  end if;
  select decision.outcome, decision.reason_code
    into decision_outcome, decision_reason
  from public.placement_shift_decision(p_placement, p_class, p_start, null) decision;
  if decision_outcome is distinct from 'ELIGIBLE' then
    raise exception '%', coalesce(decision_reason, 'PLACEMENT_CLASS_DENIED');
  end if;
  v_enrollment := gen_random_uuid();
  perform set_config('registration.write', 'on', true);
  insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status)
  values (v_enrollment, row.student_id, class_row.id, public.registration_vietnam_today(), p_start, 'ACTIVE');
  update public.student_placement_cases set
    status = 'SCHEDULED',
    enrollment_id = v_enrollment,
    assigned_class_id = class_row.id,
    assigned_teacher_id = teacher_id,
    scheduled_start_date = p_start,
    scheduled_at = clock_timestamp(),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  update public.registration_applications set linked_enrollment_id = v_enrollment, updated_at = clock_timestamp()
  where id = row.registration_application_id;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id, metadata)
  values (p_request, row.id, 'CLASS_ASSIGNED', actor, jsonb_build_object('class_id', class_row.id, 'start', p_start, 'enrollment_id', v_enrollment));
  insert into public.registration_application_events(id, application_id, event_type, actor_id, metadata)
  values (gen_random_uuid(), row.registration_application_id, 'ENROLLMENT_CREATED', actor, jsonb_build_object('enrollment_id', v_enrollment));
  perform set_config('registration.write', 'off', true);
  return row.id;
end;
$$;

create or replace function public.change_future_student_placement(
  p_request uuid,
  p_placement uuid,
  p_version integer,
  p_enrollment uuid,
  p_class uuid,
  p_start date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
  enrollment public.enrollments%rowtype;
  class_row public.classes%rowtype;
  occupied integer;
  teacher_id uuid;
  reason text;
  decision_outcome text;
  decision_reason text;
begin
  if actor is null or p_request is null or p_enrollment is null or p_class is null or p_start is null then
    raise exception 'PLACEMENT_INVALID';
  end if;
  if p_start <= public.registration_vietnam_today() then raise exception 'PLACEMENT_START_DENIED'; end if;
  reason := public.placement_reason(p_reason);
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  if row.enrollment_id is distinct from p_enrollment then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then
    if exists(select 1 from public.student_placement_events where id = p_request and placement_id=p_placement
      and actor_id=actor and event_type='PLACEMENT_CHANGED' and metadata->>'new_class_id'=p_class::text
      and metadata->>'new_start'=p_start::text) then return p_placement; end if;
    raise exception 'PLACEMENT_REQUEST_REUSED';
  end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status <> 'SCHEDULED' then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  select * into enrollment from public.enrollments where id = row.enrollment_id for update;
  if not found or enrollment.student_id <> row.student_id or enrollment.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_TRANSITION_DENIED';
  end if;
  if enrollment.started_at is null or enrollment.started_at <= public.registration_vietnam_today() then
    raise exception 'PLACEMENT_ALREADY_STARTED';
  end if;
  if public.placement_learning_history_exists(enrollment.id) then raise exception 'PLACEMENT_HISTORY_LOCKED'; end if;
  select * into class_row from public.classes where id = p_class for update;
  if not found or class_row.branch_id <> row.branch_id or class_row.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_CLASS_DENIED';
  end if;
  if public.registration_program_id(row.registration_application_id) is distinct from public.shift_program_id(class_row.id) then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
  end if;
  if class_row.start_date is not null and p_start < class_row.start_date then raise exception 'PLACEMENT_START_DENIED'; end if;
  if class_row.end_date is not null and p_start > class_row.end_date then raise exception 'PLACEMENT_START_DENIED'; end if;
  if class_row.id = enrollment.class_id and p_start = enrollment.started_at then raise exception 'PLACEMENT_UNCHANGED'; end if;
  select count(*) into occupied from public.enrollments
  where class_id = class_row.id and status in ('ACTIVE', 'PAUSED') and id <> enrollment.id;
  if occupied >= class_row.capacity then raise exception 'PLACEMENT_CLASS_FULL'; end if;
  if exists(
    select 1 from public.enrollments
    where student_id = row.student_id and class_id = class_row.id and status in ('ACTIVE', 'PAUSED') and id <> enrollment.id
  ) then
    raise exception 'PLACEMENT_ALREADY_ENROLLED';
  end if;
  select (array_agg(ct.teacher_id))[1] into teacher_id
  from public.class_teachers ct
  where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY'
    and (ct.is_active or ct.ended_at is not null)
    and ct.assigned_at <= p_start and (ct.ended_at is null or ct.ended_at >= p_start)
  having count(*)=1;
  if teacher_id is null then raise exception 'PLACEMENT_TEACHER_REQUIRED'; end if;
  select decision.outcome, decision.reason_code
    into decision_outcome, decision_reason
  from public.placement_shift_decision(p_placement, p_class, p_start, enrollment.id) decision;
  if decision_outcome is distinct from 'ELIGIBLE' then
    raise exception '%', coalesce(decision_reason, 'PLACEMENT_CLASS_DENIED');
  end if;
  perform set_config('registration.write', 'on', true);
  update public.enrollments
  set class_id = class_row.id, started_at = p_start, updated_at = clock_timestamp()
  where id = enrollment.id;
  update public.student_placement_cases set
    assigned_class_id = class_row.id,
    assigned_teacher_id = teacher_id,
    scheduled_start_date = p_start,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id, metadata)
  values (
    p_request, row.id, 'PLACEMENT_CHANGED', actor,
    jsonb_build_object(
      'student_id', row.student_id,
      'enrollment_id', enrollment.id,
      'old_class_id', enrollment.class_id,
      'new_class_id', class_row.id,
      'old_start', enrollment.started_at,
      'new_start', p_start,
      'reason', reason
    )
  );
  perform set_config('registration.write', 'off', true);
  return row.id;
end;
$$;
