begin;

-- The registration already chose Chương trình and Trình độ.
-- Completing it opens that academic path. A future first class may exist as
-- NOT_STARTED. Teaching results still cannot move before the level start date.

create or replace function public.guard_future_academic_progress()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_level_started_at timestamptz;
begin
  if tg_table_name = 'student_subject_progress' then
    select slp.started_at into v_level_started_at
    from public.student_level_progress slp
    where slp.id = new.level_progress_id;
  elsif tg_table_name = 'student_component_progress' then
    select slp.started_at into v_level_started_at
    from public.student_subject_progress ssp
    join public.student_level_progress slp on slp.id = ssp.level_progress_id
    where ssp.id = new.subject_progress_id;
  else
    raise exception 'Unsupported academic progress table';
  end if;

  if v_level_started_at is null then
    raise exception 'Academic level has no start date';
  end if;

  if v_level_started_at > now()
     and (new.status is distinct from 'NOT_STARTED' or new.score is not null or new.passed_at is not null) then
    raise exception 'Academic progress cannot be updated before the scheduled start date';
  end if;

  return new;
end;
$$;

create or replace function public.registration_open_academic_path(p_application uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app public.registration_applications%rowtype;
  existing uuid;
begin
  select * into app from public.registration_applications where id = p_application;
  if app.linked_student_id is null or app.curriculum_id is null or app.level_id is null then
    return null;
  end if;
  select id into existing
  from public.student_curriculum_enrollments
  where student_id = app.linked_student_id
    and curriculum_id = app.curriculum_id
    and status in ('ACTIVE', 'PAUSED')
  limit 1;
  if existing is not null then
    return existing;
  end if;
  perform set_config('registration.academic_seed', 'on', true);
  return public.assign_student_academic_program(
    app.linked_student_id,
    app.curriculum_id,
    app.level_id,
    coalesce(app.desired_start_date, public.registration_vietnam_today()),
    true
  );
end;
$$;

create or replace function public.copy_registration_intake_to_student()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' and new.linked_student_id is not null then
    update public.students set
      address = coalesce(nullif(btrim(new.home_address), ''), address),
      phone = coalesce(nullif(btrim(new.zalo_phone), ''), phone),
      declares_over_18 = new.student_over_18
    where id = new.linked_student_id;
    perform public.registration_open_academic_path(new.id);
  end if;
  return new;
end;
$$;

-- A counter registration has no intermediate course. A ca matches the recorded curriculum.
create or replace function public.assign_student_placement(p_request uuid, p_placement uuid, p_version integer, p_class uuid, p_start date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
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
begin
  if actor is null or p_request is null or p_class is null or p_start is null then raise exception 'PLACEMENT_INVALID'; end if;
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
  if app.course_id is not null and app.course_id is distinct from class_row.course_id then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
  end if;
  if app.course_id is null and not exists (
    select 1 from public.courses course
    where course.id = class_row.course_id and course.curriculum_id = app.curriculum_id
  ) then
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

create or replace function public.placement_compatible_classes(p_cases uuid[])
returns table(placement_id uuid, class_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or cardinality(p_cases) > 100 then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  return query
  select p.id, c.id
  from public.student_placement_cases p
  join public.registration_applications a on a.id = p.registration_application_id
  join public.classes c on c.branch_id = p.branch_id and c.status = 'ACTIVE'
  join public.courses course on course.id = c.course_id
  where p.id = any(p_cases)
    and public.registration_can('student_placement.view', p.branch_id)
    and (
      (a.course_id is not null and c.course_id = a.course_id)
      or (a.course_id is null and course.curriculum_id = a.curriculum_id)
    )
    and public.class_enrollment_compatibility(c.id, p.student_id) = 'IN_SCOPE'
    and (c.start_date is null or coalesce(p.scheduled_start_date, p.desired_start_date, c.start_date) >= c.start_date)
    and (c.end_date is null or c.end_date >= greatest(public.registration_vietnam_today(), p.scheduled_start_date, p.desired_start_date));
end;
$$;

create or replace function public.list_waiting_placements(
  p_branch uuid,
  p_filter text,
  p_search text,
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  placement_id uuid, placement_version integer, student_id uuid, student_name text, parent_name text,
  branch_id uuid, branch_name text, program_name text, level_name text, desired_start date,
  preferred_schedule text, placement_status text, class_name text, teacher_name text,
  scheduled_start date, owner_name text, completed_on date, days_waiting integer, opened_on date,
  enrollment_id uuid, class_id uuid, course_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(curriculum.name, program.name, app.program_interest),
    coalesce(registration_level.name, course_level.name),
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
  order by placement.opened_at, student.full_name
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
$$;

revoke all on function public.registration_open_academic_path(uuid) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_student_academic_program(p_student_id uuid, p_curriculum_id uuid, p_level_id uuid, p_started_at date, p_is_primary boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enrollment_id uuid;
  v_level_progress_id uuid;
begin

  if auth.uid() is not null
     and not public.has_role('SUPER_ADMIN')
     and coalesce(current_setting('registration.academic_seed', true), '') is distinct from 'on'
  then
    raise exception
      'Only SUPER_ADMIN can assign an academic program';
  end if;


  if p_student_id is null
     or p_curriculum_id is null
     or p_level_id is null
     or p_started_at is null
  then
    raise exception
      'Student, curriculum, level and start date are required';
  end if;


  -- Serialize assignment / primary changes for this student.
  perform 1
  from public.students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'Student does not exist';
  end if;


  if not exists (
    select 1
    from public.curriculums
    where id = p_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Curriculum does not exist or is inactive';
  end if;


  if not exists (
    select 1
    from public.curriculum_levels
    where id = p_level_id
      and curriculum_id = p_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Level does not belong to this curriculum or is inactive';
  end if;


  if exists (
    select 1
    from public.student_curriculum_enrollments
    where student_id = p_student_id
      and curriculum_id = p_curriculum_id
      and status in ('ACTIVE', 'PAUSED')
  ) then
    raise exception
      'Student already has an active enrollment in this curriculum';
  end if;


  if not exists (
    select 1
    from public.curriculum_subjects
    where level_id = p_level_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Selected level has no active subjects';
  end if;


  if exists (
    select 1
    from public.curriculum_subjects s
    where s.level_id = p_level_id
      and s.status = 'ACTIVE'
      and s.is_required = true
      and s.completion_rule = 'ALL_REQUIRED_COMPONENTS'
      and not exists (
        select 1
        from public.curriculum_subject_components c
        where c.subject_id = s.id
          and c.is_required = true
          and c.status = 'ACTIVE'
      )
  ) then
    raise exception
      'A required subject has no required active components';
  end if;


  if p_is_primary then
    update public.student_curriculum_enrollments
    set
      is_primary = false,
      updated_at = now()
    where student_id = p_student_id
      and is_primary = true
      and status in ('ACTIVE', 'PAUSED');
  end if;


  insert into public.student_curriculum_enrollments (
    student_id,
    curriculum_id,
    current_level_id,
    is_primary,
    status,
    started_at
  )
  values (
    p_student_id,
    p_curriculum_id,
    p_level_id,
    p_is_primary,
    'ACTIVE',
    p_started_at
  )
  returning id
  into v_enrollment_id;


  insert into public.student_level_progress (
    enrollment_id,
    level_id,
    status,
    unlocked_at,
    started_at
  )
  values (
    v_enrollment_id,
    p_level_id,
    'IN_PROGRESS',
    now(),
    p_started_at::timestamp
      at time zone 'Asia/Ho_Chi_Minh'
  )
  returning id
  into v_level_progress_id;


  with inserted_subjects as (

    insert into public.student_subject_progress (
      level_progress_id,
      subject_id,
      status
    )

    select
      v_level_progress_id,
      s.id,
      'NOT_STARTED'

    from public.curriculum_subjects s

    where s.level_id = p_level_id
      and s.status = 'ACTIVE'

    order by s.sort_order

    returning
      id,
      subject_id
  )

  insert into public.student_component_progress (
    subject_progress_id,
    component_id,
    status
  )

  select
    isp.id,
    c.id,
    'NOT_STARTED'

  from inserted_subjects isp

  join public.curriculum_subject_components c
    on c.subject_id = isp.subject_id
   and c.status = 'ACTIVE'

  order by
    isp.subject_id,
    c.sort_order;


  return v_enrollment_id;

end;
$function$;


do $$
declare app_id uuid;
begin
  for app_id in
    select id from public.registration_applications
    where status = 'COMPLETED' and linked_student_id is not null and curriculum_id is not null and level_id is not null
  loop
    perform public.registration_open_academic_path(app_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
