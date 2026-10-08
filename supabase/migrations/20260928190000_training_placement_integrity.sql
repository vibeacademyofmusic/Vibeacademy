-- Local training placement integrity. No IDs, academic levels or history are rewritten.
begin;
CREATE OR REPLACE FUNCTION public.assign_student_placement(p_request uuid, p_placement uuid, p_version integer, p_class uuid, p_start date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
  class_row public.classes%rowtype;
  occupied integer;
  v_enrollment uuid;
  teacher_id uuid;
  program_id uuid;
  scope_code text;
begin
  if actor is null or p_request is null or p_class is null or p_start is null then raise exception 'PLACEMENT_INVALID'; end if;
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then
    if exists(select 1 from public.student_placement_events where id = p_request and placement_id=p_placement
      and actor_id=actor and event_type='CLASS_ASSIGNED' and metadata->>'class_id'=p_class::text
      and metadata->>'start'=p_start::text) then return p_placement; end if;
    raise exception 'PLACEMENT_REQUEST_REUSED';
  end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status not in ('UNASSIGNED', 'MATCHING') or row.enrollment_id is not null then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  select * into class_row from public.classes where id = p_class for update;
  if not found or class_row.branch_id <> row.branch_id or class_row.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_CLASS_DENIED';
  end if;
  select app.course_id into program_id
  from public.registration_applications app
  where app.id = row.registration_application_id;
  if program_id is null or program_id is distinct from class_row.course_id then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
  end if;
  scope_code := public.class_enrollment_compatibility(class_row.id, row.student_id);
  if scope_code is distinct from 'IN_SCOPE' then
    raise exception 'PLACEMENT_LEVEL_DENIED';
  end if;
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
  having count(*)=1;
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
end $function$;

CREATE OR REPLACE FUNCTION public.change_future_student_placement(p_request uuid, p_placement uuid, p_version integer, p_enrollment uuid, p_class uuid, p_start date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
  enrollment public.enrollments%rowtype;
  class_row public.classes%rowtype;
  occupied integer;
  teacher_id uuid;
  program_id uuid;
  reason text;
begin
  if actor is null or p_request is null or p_enrollment is null or p_class is null or p_start is null then
    raise exception 'PLACEMENT_INVALID';
  end if;
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
  select app.course_id into program_id from public.registration_applications app where app.id = row.registration_application_id;
  if program_id is not null and program_id is distinct from class_row.course_id then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
  end if;
  if p_start <= public.registration_vietnam_today() then raise exception 'PLACEMENT_START_DENIED'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.list_placement_class_options(p_branch uuid)
 RETURNS TABLE(id uuid, name text, branch_id uuid, open_seats integer, code text, branch_name text, course_id uuid, curriculum_name text, level_label text, teacher_name text, room_name text, schedule_label text, duration_minutes integer, enrolled_count integer, capacity integer, status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select class_row.id,
    class_row.name,
    class_row.branch_id,
    class_row.capacity - coalesce(occupancy.n, 0),
    class_row.code,
    branch.name,
    class_row.course_id,
    curriculum.name,
    case
      when from_level.name is null or to_level.name is null then null
      when from_level.id = to_level.id then from_level.name
      else from_level.name || ' – ' || to_level.name
    end,
    (
      select min(coalesce(profile.full_name, teacher.full_name))
      from public.class_teachers ct
      join public.teachers teacher on teacher.id = ct.teacher_id
      left join public.profiles profile on profile.id = teacher.user_id
      where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY' and (ct.is_active or ct.ended_at is not null)
        and ct.assigned_at <= public.registration_vietnam_today()
        and (ct.ended_at is null or ct.ended_at >= public.registration_vietnam_today())
      having count(*)=1
    ),
    (
      select room.name
      from public.schedules schedule
      left join public.rooms room on room.id = schedule.room_id
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
      order by schedule.day_of_week, schedule.start_time
      limit 1
    ),
    (
      select string_agg(
        case schedule.day_of_week
          when 1 then 'Thứ 2'
          when 2 then 'Thứ 3'
          when 3 then 'Thứ 4'
          when 4 then 'Thứ 5'
          when 5 then 'Thứ 6'
          when 6 then 'Thứ 7'
          else 'Chủ nhật'
        end || ' ' || to_char(schedule.start_time, 'HH24:MI') || '–' || to_char(schedule.end_time, 'HH24:MI'),
        ', ' order by schedule.day_of_week, schedule.start_time
      )
      from public.schedules schedule
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
    ),
    (
      select (extract(epoch from (schedule.end_time - schedule.start_time)) / 60)::integer
      from public.schedules schedule
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
      order by schedule.day_of_week, schedule.start_time
      limit 1
    ),
    coalesce(occupancy.n, 0),
    class_row.capacity,
    class_row.status
  from public.classes class_row
  left join (
    select enrollment.class_id, count(*)::integer n from public.enrollments enrollment
    join public.classes c on c.id=enrollment.class_id
    where enrollment.status in ('ACTIVE','PAUSED') and (p_branch is null or c.branch_id=p_branch)
    group by enrollment.class_id
  ) occupancy on occupancy.class_id=class_row.id
  join public.branches branch on branch.id = class_row.branch_id
  join public.courses course on course.id = class_row.course_id
  join public.curriculums curriculum on curriculum.id = course.curriculum_id
  left join public.curriculum_levels from_level on from_level.id = class_row.accepted_from_level_id
  left join public.curriculum_levels to_level on to_level.id = class_row.accepted_to_level_id
  where class_row.status = 'ACTIVE'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_branch is null or class_row.branch_id = p_branch)
  order by class_row.name, class_row.id
$function$;

-- Effective timetable: materialized sessions replace their original recurring slot,
-- including cancellation, rescheduling and per-session teacher overrides/snapshots.
create function public.placement_timetable(p_class uuid, p_from date, p_to date)
returns table(session_id uuid, starts_at timestamptz, ends_at timestamptz, room_id uuid, teacher_id uuid, makeup boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.id, (d.day::date+s.start_time) at time zone s.timezone,
   (d.day::date+s.end_time) at time zone s.timezone, s.room_id, t.teacher_id, false
 from schedules s join classes c on c.id=s.class_id
 cross join lateral generate_series(greatest(p_from,s.effective_from,c.start_date)::timestamp,
   least(p_to,coalesce(s.effective_to,p_to),coalesce(c.end_date,p_to))::timestamp,interval '1 day') d(day)
 left join lateral (
   select (array_agg(ct.teacher_id))[1] teacher_id from class_teachers ct
   where ct.class_id=c.id and ct.teacher_role='PRIMARY' and (ct.is_active or ct.ended_at is not null)
     and ct.assigned_at<=d.day::date and (ct.ended_at is null or ct.ended_at>=d.day::date)
   having count(*)=1
 ) t on true
 where s.class_id=p_class and s.status='ACTIVE' and extract(isodow from d.day)=s.day_of_week
 and not exists(select 1 from session_occurrences o where o.schedule_id=s.id and o.occurrence_type='REGULAR'
   and coalesce((o.original_starts_at at time zone s.timezone)::date,o.occurrence_date)=d.day::date)
 union all
 select v.session_id,v.starts_at,v.ends_at,v.room_id,v.teacher_id,v.occurrence_type='MAKEUP'
 from session_actual_teachers v
 where v.class_id=p_class and v.status<>'CANCELLED'
 and v.starts_at < (p_to+1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
 and v.ends_at > p_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
$$;
revoke all on function public.placement_timetable(uuid,date,date) from public,anon,authenticated;

create function public.placement_schedule_check(p_class uuid,p_student uuid,p_start date,p_end date default null,p_exclude uuid default null)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare horizon date; first_day date:=greatest(p_start,registration_vietnam_today()); result text;
begin
 -- After the last known schedule/assignment/exception boundary, two more weeks
 -- cover every weekly recurrence. Unsupported timezones fail closed, not "clear".
 select greatest(first_day,
   (select max(start_date) from classes), (select max(end_date) from classes),
   (select max(effective_from) from schedules), (select max(effective_to) from schedules),
   (select max(assigned_at) from class_teachers), (select max(ended_at) from class_teachers),
   (select max((ends_at at time zone 'Asia/Ho_Chi_Minh')::date) from session_occurrences),
   (select max(started_at) from enrollments), (select max(ended_at) from enrollments),
   (select max(ends_on) from enrollment_pauses)) + 14 into horizon;
 horizon:=least(horizon,coalesce(p_end,horizon));
 if exists(select 1 from schedules where status='ACTIVE' and timezone<>'Asia/Ho_Chi_Minh') then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 if not exists(select 1 from placement_timetable(p_class,first_day,horizon) where not makeup) then
   return 'PLACEMENT_SCHEDULE_REQUIRED';
 end if;
 if exists(select 1 from placement_timetable(p_class,first_day,horizon) where teacher_id is null or room_id is null) then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 if exists(select 1 from enrollments e where e.student_id=p_student and e.id is distinct from p_exclude
   and e.class_id<>p_class and e.status in ('ACTIVE','PAUSED') and coalesce(e.ended_at,horizon)>=first_day
   and not exists(select 1 from placement_timetable(e.class_id,greatest(first_day,e.started_at),least(horizon,e.ended_at)))) then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 with target as materialized (select * from placement_timetable(p_class,first_day,horizon)),
 others as materialized (
   select c.id class_id,t.* from classes c
   cross join lateral placement_timetable(c.id,first_day,horizon) t
   where c.id<>p_class and c.status not in ('CANCELLED','COMPLETED')
 ), overlapping_slots as (
   select a.*,b.class_id other_class,b.session_id other_session,b.makeup other_makeup,
     b.room_id other_room,b.teacher_id other_teacher
   from target a join others b on a.starts_at<b.ends_at and b.starts_at<a.ends_at
 )
 select case
   when exists(select 1 from overlapping_slots where room_id=other_room) then 'PLACEMENT_ROOM_CONFLICT'
   when exists(select 1 from overlapping_slots where teacher_id=other_teacher) then 'PLACEMENT_TEACHER_CONFLICT'
   when exists(select 1 from overlapping_slots o join enrollments e on e.class_id=o.other_class
     where not o.makeup and e.student_id=p_student and e.id is distinct from p_exclude
       and e.status in ('ACTIVE','PAUSED')
       and (o.starts_at at time zone 'Asia/Ho_Chi_Minh')::date between coalesce(e.started_at,e.enrolled_at) and coalesce(e.ended_at,horizon)
       and not is_enrollment_paused_on(e.id,(o.starts_at at time zone 'Asia/Ho_Chi_Minh')::date)
       and (not o.other_makeup or exists(select 1 from session_occurrence_participants sp where sp.session_occurrence_id=o.other_session and sp.enrollment_id=e.id))) then 'PLACEMENT_STUDENT_CONFLICT'
   when exists(select 1 from target a join session_actual_teachers v on a.starts_at<v.ends_at and v.starts_at<a.ends_at
     join session_occurrence_participants sp on sp.session_occurrence_id=v.session_id
     join enrollments e on e.id=sp.enrollment_id
     where not a.makeup and v.class_id<>p_class and v.status<>'CANCELLED' and e.student_id=p_student) then 'PLACEMENT_STUDENT_CONFLICT'
   when exists(select 1 from overlapping_slots where other_room is null or other_teacher is null) then 'PLACEMENT_SCHEDULE_UNKNOWN'
   when exists(select 1 from target a join target b on a.starts_at<b.ends_at and b.starts_at<a.ends_at
     and (a.session_id,a.starts_at)<(b.session_id,b.starts_at)
     where a.room_id=b.room_id or a.teacher_id=b.teacher_id or (not a.makeup and not b.makeup)) then 'PLACEMENT_SCHEDULE_UNKNOWN'
   else 'CLEAR' end into result;
 return result;
end $$;
revoke all on function public.placement_schedule_check(uuid,uuid,date,date,uuid) from public,anon,authenticated;

-- All enrollment INSERT/reactivation/transfer paths converge here, including
-- direct PostgREST writes and legacy import RPCs. Paused memberships retain seats.
create function public.guard_placement_enrollment_integrity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c classes%rowtype; code text;
begin
 if tg_op='UPDATE' then
   if new.class_id is distinct from old.class_id or new.student_id is distinct from old.student_id then
     if coalesce(old.started_at,old.enrolled_at)<=registration_vietnam_today() or placement_learning_history_exists(old.id) then
       raise exception 'PLACEMENT_HISTORY_LOCKED';
     end if;
   end if;
   if (new.class_id,new.student_id,new.started_at,new.status) is not distinct from (old.class_id,old.student_id,old.started_at,old.status) then return new; end if;
   if new.status='PAUSED' and old.status='ACTIVE' and new.class_id=old.class_id and new.student_id=old.student_id and new.started_at is not distinct from old.started_at then return new; end if;
 end if;
 if new.status not in ('ACTIVE','PAUSED') then return new; end if;
 select * into c from classes where id=new.class_id for update;
 perform 1 from students where id=new.student_id for update;
 if c.id is null or c.status<>'ACTIVE' then raise exception 'PLACEMENT_CLASS_DENIED'; end if;
 if new.started_at is null or (c.start_date is not null and new.started_at<c.start_date) or (c.end_date is not null and new.started_at>c.end_date) then raise exception 'PLACEMENT_START_DENIED'; end if;
 if exists(select 1 from students where id=new.student_id and (status<>'ACTIVE' or default_branch_id is distinct from c.branch_id)) then raise exception 'PLACEMENT_CLASS_DENIED'; end if;
 if exists(select 1 from enrollments where class_id=c.id and student_id=new.student_id and id<>new.id and status in ('ACTIVE','PAUSED')) then raise exception 'PLACEMENT_ALREADY_ENROLLED'; end if;
 if (select count(*) from enrollments where class_id=c.id and id<>new.id and status in ('ACTIVE','PAUSED'))>=c.capacity then raise exception 'PLACEMENT_CLASS_FULL'; end if;
 code:=class_enrollment_compatibility(c.id,new.student_id);
 if code<>'IN_SCOPE' then raise exception 'PLACEMENT_LEVEL_DENIED'; end if;
 code:=placement_schedule_check(c.id,new.student_id,new.started_at,new.ended_at,new.id);
 if code<>'CLEAR' then raise exception '%',code; end if;
 return new;
end $$;
revoke all on function public.guard_placement_enrollment_integrity() from public,anon,authenticated;
create trigger trg_placement_enrollment_integrity before insert or update on public.enrollments
 for each row execute function public.guard_placement_enrollment_integrity();
-- Batch academic/date eligibility for just the visible page of placements.
create function public.placement_compatible_classes(p_cases uuid[])
returns table(placement_id uuid,class_id uuid) language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or cardinality(p_cases)>100 then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
 return query
 select p.id,c.id from student_placement_cases p
 join registration_applications a on a.id=p.registration_application_id
 join classes c on c.branch_id=p.branch_id and c.course_id=a.course_id
 where p.id=any(p_cases) and registration_can('student_placement.view',p.branch_id)
 and c.status='ACTIVE' and class_enrollment_compatibility(c.id,p.student_id)='IN_SCOPE'
 and (c.start_date is null or coalesce(p.scheduled_start_date,p.desired_start_date,c.start_date)>=c.start_date)
 and (c.end_date is null or c.end_date>=greatest(registration_vietnam_today(),p.scheduled_start_date,p.desired_start_date));
end $$;
revoke all on function public.placement_compatible_classes(uuid[]) from public,anon;
grant execute on function public.placement_compatible_classes(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
