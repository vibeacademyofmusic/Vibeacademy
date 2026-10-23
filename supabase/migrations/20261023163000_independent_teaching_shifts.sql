-- Each weekday and time is its own teaching shift.
-- A stated weekly session count can leave a placement open until that count is met.
-- No default of two sessions per week is stored.

alter table public.student_placement_cases
  add column if not exists required_weekly_sessions smallint;

alter table public.student_placement_cases
  drop constraint if exists student_placement_required_weekly_sessions;

alter table public.student_placement_cases
  add constraint student_placement_required_weekly_sessions
  check (required_weekly_sessions is null or required_weekly_sessions between 1 and 7);

create or replace function public.placement_week_still_open(p_placement uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select coalesce((
    select placement.required_weekly_sessions is not null
      and placement.status in ('UNASSIGNED', 'MATCHING')
      and (
        select count(*)
        from public.enrollments enrollment
        join public.classes shift on shift.id = enrollment.class_id
        join public.schedules schedule on schedule.class_id = shift.id and schedule.status = 'ACTIVE'
        where enrollment.student_id = placement.student_id
          and enrollment.status in ('ACTIVE', 'PAUSED')
          and shift.status = 'ACTIVE'
          and shift.branch_id = placement.branch_id
          and public.shift_program_id(shift.id) is not distinct from public.registration_program_id(placement.registration_application_id)
      ) < placement.required_weekly_sessions
    from public.student_placement_cases placement
    where placement.id = p_placement
  ), false);
$$;

revoke all on function public.placement_week_still_open(uuid) from public, anon, authenticated;

drop function if exists public.set_placement_availability(uuid, smallint[], time, time, text, text);

create function public.set_placement_availability(
  p_placement uuid,
  p_days smallint[],
  p_start time,
  p_end time,
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
  update public.student_placement_cases
  set availability_days = p_days,
      availability_start = p_start,
      availability_end = p_end,
      availability_mode = mode,
      availability_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
      required_weekly_sessions = p_required,
      updated_at = clock_timestamp()
  where id = placement.id;
  return placement.id;
end;
$$;

revoke all on function public.set_placement_availability(uuid, smallint[], time, time, text, text, integer) from public, anon;
grant execute on function public.set_placement_availability(uuid, smallint[], time, time, text, text, integer) to authenticated;

create or replace function public.assign_student_shift_set(
  p_request uuid,
  p_placement uuid,
  p_version integer,
  p_classes uuid[],
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
  next_class uuid;
  ordered uuid[];
  occupied integer;
  guests integer;
  teacher_id uuid;
  first_enrollment uuid;
  first_teacher uuid;
  first_class uuid;
  decision_outcome text;
  decision_reason text;
  weekly integer;
begin
  if actor is null or p_request is null or p_start is null or p_classes is null or cardinality(p_classes) < 1 then
    raise exception 'PLACEMENT_INVALID';
  end if;
  if p_start < public.registration_vietnam_today() then raise exception 'PLACEMENT_START_PAST'; end if;
  select coalesce(array_agg(class_id order by class_id), '{}'::uuid[])
    into ordered
  from (select distinct unnest(p_classes) as class_id) ids;
  if cardinality(ordered) > 7 then raise exception 'PLACEMENT_INVALID'; end if;

  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  if exists (
    select 1 from public.student_placement_events
    where id = p_request and placement_id = p_placement and actor_id = actor and event_type = 'CLASS_ASSIGNED'
      and metadata->>'start' = p_start::text
      and metadata->'class_ids' = to_jsonb(ordered)
  ) then
    return p_placement;
  end if;
  if exists (select 1 from public.student_placement_events where id = p_request) then
    raise exception 'PLACEMENT_REQUEST_REUSED';
  end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status not in ('UNASSIGNED', 'MATCHING') then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;

  if exists (
    select 1
    from public.schedules left_schedule
    join public.schedules right_schedule
      on left_schedule.class_id < right_schedule.class_id
     and left_schedule.day_of_week = right_schedule.day_of_week
     and left_schedule.start_time < right_schedule.end_time
     and right_schedule.start_time < left_schedule.end_time
     and daterange(left_schedule.effective_from, coalesce(left_schedule.effective_to, 'infinity'::date), '[]')
         && daterange(right_schedule.effective_from, coalesce(right_schedule.effective_to, 'infinity'::date), '[]')
    where left_schedule.class_id = any(ordered)
      and right_schedule.class_id = any(ordered)
      and left_schedule.status = 'ACTIVE'
      and right_schedule.status = 'ACTIVE'
  ) then
    raise exception 'PLACEMENT_STUDENT_CONFLICT';
  end if;

  foreach next_class in array ordered loop
    select * into class_row from public.classes where id = next_class for update;
    if not found or class_row.branch_id <> row.branch_id or class_row.status <> 'ACTIVE' then
      raise exception 'PLACEMENT_CLASS_DENIED';
    end if;
    if public.registration_program_id(row.registration_application_id) is distinct from public.shift_program_id(class_row.id) then
      raise exception 'PLACEMENT_PROGRAM_DENIED';
    end if;
    if public.class_enrollment_compatibility(class_row.id, row.student_id) is distinct from 'IN_SCOPE' then
      raise exception 'PLACEMENT_LEVEL_DENIED';
    end if;
    if class_row.start_date is not null and p_start < class_row.start_date then raise exception 'PLACEMENT_START_DENIED'; end if;
    if class_row.end_date is not null and p_start > class_row.end_date then raise exception 'PLACEMENT_START_DENIED'; end if;
    if exists (
      select 1 from public.enrollments
      where student_id = row.student_id and class_id = class_row.id and status in ('ACTIVE', 'PAUSED')
    ) then
      continue;
    end if;

    select count(*) into occupied
    from public.enrollments
    where class_id = class_row.id and status in ('ACTIVE', 'PAUSED');
    select count(distinct participant.enrollment_id) into guests
    from public.session_occurrence_participants participant
    join public.session_occurrences occurrence on occurrence.id = participant.session_occurrence_id
    join public.schedules schedule on schedule.id = occurrence.schedule_id
    join public.enrollments guest on guest.id = participant.enrollment_id
    where schedule.class_id = class_row.id
      and occurrence.status = 'SCHEDULED'
      and occurrence.occurrence_date >= p_start
      and guest.class_id is distinct from class_row.id
      and guest.status in ('ACTIVE', 'PAUSED');
    if occupied + guests >= class_row.capacity then raise exception 'PLACEMENT_CLASS_FULL'; end if;

    select (array_agg(ct.teacher_id))[1] into teacher_id
    from public.class_teachers ct
    where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY'
      and (ct.is_active or ct.ended_at is not null)
      and ct.assigned_at <= p_start and (ct.ended_at is null or ct.ended_at >= p_start)
    having count(*) = 1;
    if teacher_id is null then raise exception 'PLACEMENT_TEACHER_REQUIRED'; end if;
    if not exists (
      select 1 from public.schedules schedule
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
    ) then
      raise exception 'PLACEMENT_SCHEDULE_REQUIRED';
    end if;

    teacher_id := null;
    decision_outcome := null;
    decision_reason := null;
    select decision.outcome, decision.reason_code
      into decision_outcome, decision_reason
    from public.placement_shift_decision(p_placement, class_row.id, p_start, null) decision;
    if decision_outcome is distinct from 'ELIGIBLE' then
      raise exception '%', coalesce(decision_reason, 'PLACEMENT_CLASS_DENIED');
    end if;

    perform set_config('registration.write', 'on', true);
    insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status)
    values (gen_random_uuid(), row.student_id, class_row.id, public.registration_vietnam_today(), p_start, 'ACTIVE')
    returning id into first_enrollment;
    first_class := coalesce(first_class, class_row.id);
    first_teacher := coalesce(first_teacher, teacher_id);
  end loop;

  select count(*) into weekly
  from public.enrollments enrollment
  join public.classes shift on shift.id = enrollment.class_id
  join public.schedules schedule on schedule.class_id = shift.id and schedule.status = 'ACTIVE'
  where enrollment.student_id = row.student_id
    and enrollment.status in ('ACTIVE', 'PAUSED')
    and shift.status = 'ACTIVE'
    and shift.branch_id = row.branch_id
    and public.shift_program_id(shift.id) is not distinct from public.registration_program_id(row.registration_application_id);

  perform set_config('registration.write', 'on', true);
  update public.student_placement_cases set
    status = case
      when required_weekly_sessions is null or weekly >= required_weekly_sessions then 'SCHEDULED'
      else 'MATCHING'
    end,
    enrollment_id = coalesce(enrollment_id, first_enrollment),
    assigned_class_id = coalesce(assigned_class_id, first_class),
    assigned_teacher_id = coalesce(assigned_teacher_id, first_teacher),
    scheduled_start_date = p_start,
    scheduled_at = coalesce(scheduled_at, clock_timestamp()),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  if first_enrollment is not null then
    update public.registration_applications
    set linked_enrollment_id = coalesce(linked_enrollment_id, first_enrollment), updated_at = clock_timestamp()
    where id = row.registration_application_id;
  end if;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id, metadata)
  values (
    p_request, row.id, 'CLASS_ASSIGNED', actor,
    jsonb_build_object('class_ids', to_jsonb(ordered), 'start', p_start, 'enrollment_id', first_enrollment, 'weekly_sessions', weekly)
  );
  perform set_config('registration.write', 'off', true);
  return row.id;
end;
$$;

revoke all on function public.assign_student_shift_set(uuid, uuid, integer, uuid[], date) from public, anon;
grant execute on function public.assign_student_shift_set(uuid, uuid, integer, uuid[], date) to authenticated;

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
      not exists (
        select 1
        from public.enrollments open_enrollment
        join public.classes open_shift on open_shift.id = open_enrollment.class_id
        where open_enrollment.student_id = placement.student_id
          and open_enrollment.status in ('ACTIVE', 'PAUSED')
          and open_shift.status = 'ACTIVE'
      )
      or public.placement_week_still_open(placement.id)
    )
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

create or replace function public.waiting_placement_summary(p_branch uuid)
returns table (
  waiting_count integer,
  unassigned_count integer,
  matching_count integer,
  scheduled_count integer,
  average_wait numeric,
  over_3 integer,
  over_7 integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  with visible as (
    select
      public.registration_vietnam_today() - placement.opened_at::date as days,
      placement.status,
      placement.scheduled_start_date
    from public.student_placement_cases placement
    where public.registration_can('student_placement.view', placement.branch_id)
      and (p_branch is null or placement.branch_id = p_branch)
      and (
        not exists (
          select 1
          from public.enrollments open_enrollment
          join public.classes open_shift on open_shift.id = open_enrollment.class_id
          where open_enrollment.student_id = placement.student_id
            and open_enrollment.status in ('ACTIVE', 'PAUSED')
            and open_shift.status = 'ACTIVE'
        )
        or public.placement_week_still_open(placement.id)
      )
      and (
        placement.status in ('UNASSIGNED', 'MATCHING')
        or (
          placement.status = 'SCHEDULED'
          and placement.scheduled_start_date > public.registration_vietnam_today()
        )
      )
  ),
  waiting as (
    select * from visible where status in ('UNASSIGNED', 'MATCHING')
  )
  select
    (select count(*)::integer from waiting),
    (select count(*)::integer from waiting where status = 'UNASSIGNED'),
    (select count(*)::integer from waiting where status = 'MATCHING'),
    (select count(*)::integer from visible where status = 'SCHEDULED'),
    (select coalesce(round(avg(days), 1), 0) from waiting),
    (select count(*)::integer from waiting where days > 3),
    (select count(*)::integer from waiting where days > 7)
$$;

create or replace function public.close_waiting_placement_on_enrollment()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  shift_branch uuid;
  shift_program uuid;
begin
  if new.status not in ('ACTIVE', 'PAUSED') then
    return new;
  end if;
  if current_setting('registration.write', true) = 'on' then
    return new;
  end if;
  select branch_id, public.shift_program_id(id)
    into shift_branch, shift_program
  from public.classes
  where id = new.class_id and status = 'ACTIVE';
  if shift_branch is null then
    return new;
  end if;
  perform set_config('registration.write', 'on', true);
  update public.student_placement_cases placement
  set status = 'SCHEDULED',
      enrollment_id = new.id,
      assigned_class_id = new.class_id,
      scheduled_start_date = coalesce(placement.scheduled_start_date, new.started_at, public.registration_vietnam_today()),
      scheduled_at = coalesce(placement.scheduled_at, clock_timestamp()),
      assigned_teacher_id = coalesce(placement.assigned_teacher_id, (
        select teacher.teacher_id
        from public.class_teachers teacher
        where teacher.class_id = new.class_id
          and teacher.teacher_role = 'PRIMARY'
          and teacher.is_active
        order by teacher.assigned_at desc
        limit 1
      )),
      version = placement.version + 1,
      updated_at = clock_timestamp()
  where placement.student_id = new.student_id
    and placement.status in ('UNASSIGNED', 'MATCHING')
    and placement.enrollment_id is null
    and placement.branch_id = shift_branch
    and public.registration_program_id(placement.registration_application_id) is not distinct from shift_program
    and not public.placement_week_still_open(placement.id);
  return new;
end;
$$;
