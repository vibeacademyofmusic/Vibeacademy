-- Independent placement windows. Each selected day and time is stored as its own row.
-- The schedule is not packed into availability_note.

create table public.placement_time_windows (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references public.student_placement_cases(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  constraint placement_time_windows_order check (end_time > start_time),
  constraint placement_time_windows_unique unique (placement_id, day_of_week, start_time, end_time)
);

create index placement_time_windows_placement_idx
  on public.placement_time_windows(placement_id, sort_order, day_of_week, start_time);

alter table public.placement_time_windows enable row level security;

create policy placement_time_windows_select on public.placement_time_windows
for select to authenticated
using (exists (
  select 1 from public.student_placement_cases placement
  where placement.id = placement_id
    and public.registration_can('student_placement.view', placement.branch_id)
));

revoke all on table public.placement_time_windows from public, anon, authenticated;
grant select on table public.placement_time_windows to authenticated;

-- Keep both RPC signatures valid after exact windows become available.
-- Six arguments preserve the weekly target; seven arguments change it.
create or replace function public.set_placement_availability(
  p_placement uuid,
  p_days smallint[],
  p_start time,
  p_end time,
  p_mode text,
  p_note text,
  p_required integer
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
  if p_required is not null and p_required not between 1 and 7 then
    raise exception 'PLACEMENT_AVAILABILITY';
  end if;
  perform set_config('registration.write', 'on', true);
  -- The legacy day/range form supersedes any exact windows saved earlier.
  -- Otherwise placement_shift_decision would keep reading stale windows.
  delete from public.placement_time_windows where placement_id = placement.id;
  update public.student_placement_cases
  set availability_days = p_days,
      availability_start = p_start,
      availability_end = p_end,
      availability_mode = mode,
      availability_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      required_weekly_sessions = p_required,
      updated_at = clock_timestamp()
  where id = placement.id;
  perform set_config('registration.write', 'off', true);
  return placement.id;
end;
$$;

revoke all on function public.set_placement_availability(uuid, smallint[], time, time, text, text, integer) from public, anon;
grant execute on function public.set_placement_availability(uuid, smallint[], time, time, text, text, integer) to authenticated;

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
begin
  if auth.uid() is null then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  select * into placement from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', placement.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  return public.set_placement_availability(
    p_placement, p_days, p_start, p_end, p_mode, p_note,
    placement.required_weekly_sessions::integer
  );
end;
$$;

revoke all on function public.set_placement_availability(uuid, smallint[], time, time, text, text) from public, anon;
grant execute on function public.set_placement_availability(uuid, smallint[], time, time, text, text) to authenticated;

create or replace function public.placement_window_fit(p_placement uuid, p_class uuid)
returns text
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  with schedules as (
    select day_of_week, start_time, end_time
    from public.schedules
    where class_id = p_class and status = 'ACTIVE'
  ), matched as (
    select schedule.day_of_week, schedule.start_time, schedule.end_time
    from schedules schedule
    where exists (
      select 1 from public.placement_time_windows window_row
      where window_row.placement_id = p_placement
        and window_row.day_of_week = schedule.day_of_week
        and window_row.start_time = schedule.start_time
        and window_row.end_time = schedule.end_time
    )
  )
  select case
    when (select count(*) from schedules) = 0 then 'NONE'
    when (select count(*) from schedules) = (select count(*) from matched) then 'MATCH'
    when (select count(*) from matched) > 0 then 'PARTIAL'
    else 'NONE'
  end;
$$;

revoke all on function public.placement_window_fit(uuid, uuid) from public, anon, authenticated;
-- The existing postgres-owned placement decision function calls this helper.
-- Keep it private when migrations run as supabase_admin.
grant execute on function public.placement_window_fit(uuid, uuid) to postgres;

create or replace function public.set_placement_time_windows(
  p_placement uuid,
  p_days smallint[],
  p_starts time[],
  p_ends time[],
  p_mode text,
  p_note text,
  p_required integer default null
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  placement public.student_placement_cases%rowtype;
  mode text := nullif(upper(btrim(coalesce(p_mode, ''))), '');
  window_count integer := coalesce(cardinality(p_days), 0);
  shared_start time;
  shared_end time;
begin
  if auth.uid() is null then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  select * into placement from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', placement.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  if mode is not null and mode not in ('PREFERENCE', 'HARD') then
    raise exception 'PLACEMENT_AVAILABILITY';
  end if;
  if p_required is not null and p_required not between 1 and 7 then
    raise exception 'PLACEMENT_AVAILABILITY';
  end if;
  if window_count > 14
    or cardinality(coalesce(p_starts, '{}')) is distinct from window_count
    or cardinality(coalesce(p_ends, '{}')) is distinct from window_count
    or exists (select 1 from unnest(coalesce(p_days, '{}')) day where day < 1 or day > 7)
    or exists (
      select 1 from unnest(coalesce(p_starts, '{}'), coalesce(p_ends, '{}')) as span(start_time, end_time)
      where span.end_time <= span.start_time
    )
    or exists (
      select 1
      from unnest(coalesce(p_days, '{}'), coalesce(p_starts, '{}'), coalesce(p_ends, '{}')) with ordinality as left_window(day, start_time, end_time, n)
      join unnest(coalesce(p_days, '{}'), coalesce(p_starts, '{}'), coalesce(p_ends, '{}')) with ordinality as right_window(day, start_time, end_time, n)
        on left_window.n < right_window.n
       and left_window.day = right_window.day
       and left_window.start_time < right_window.end_time
       and right_window.start_time < left_window.end_time
    ) then
    raise exception 'PLACEMENT_AVAILABILITY';
  end if;
  if mode = 'HARD' and window_count = 0 then
    raise exception 'PLACEMENT_AVAILABILITY';
  end if;

  perform set_config('registration.write', 'on', true);
  delete from public.placement_time_windows where placement_id = placement.id;
  insert into public.placement_time_windows(placement_id, day_of_week, start_time, end_time, sort_order)
  select placement.id, window_row.day, window_row.start_time, window_row.end_time, window_row.n::smallint
  from unnest(coalesce(p_days, '{}'), coalesce(p_starts, '{}'), coalesce(p_ends, '{}')) with ordinality as window_row(day, start_time, end_time, n);

  select case when count(distinct start_time) = 1 and count(distinct end_time) = 1 then min(start_time) end,
         case when count(distinct start_time) = 1 and count(distinct end_time) = 1 then min(end_time) end
    into shared_start, shared_end
  from public.placement_time_windows
  where placement_id = placement.id;

  update public.student_placement_cases
  set availability_days = (
        select array_agg(distinct day_of_week order by day_of_week)
        from public.placement_time_windows
        where placement_id = placement.id
      ),
      availability_start = shared_start,
      availability_end = shared_end,
      availability_mode = mode,
      availability_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      required_weekly_sessions = p_required,
      updated_at = clock_timestamp()
  where id = placement.id;
  perform set_config('registration.write', 'off', true);
  return placement.id;
end;
$$;

revoke all on function public.set_placement_time_windows(uuid, smallint[], time[], time[], text, text, integer) from public, anon;
grant execute on function public.set_placement_time_windows(uuid, smallint[], time[], time[], text, text, integer) to authenticated;

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

  if exists (
    select 1 from public.placement_time_windows window_row
    where window_row.placement_id = placement.id
  ) then
    fit := public.placement_window_fit(placement.id, p_class);
  elsif placement.availability_days is null then
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
        elsif placement.availability_mode = 'HARD' and fit <> 'MATCH' then
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

notify pgrst, 'reload schema';
