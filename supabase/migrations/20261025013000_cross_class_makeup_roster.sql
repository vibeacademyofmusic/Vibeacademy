-- A makeup booking from another class is a real occupied seat when the
-- destination class accepts that student's program. The week board, attendance
-- roster and attendance write all use these functions. Omitting the guest
-- while still publishing a headcount is not allowed.

create or replace function public.validate_makeup_participant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_occurrence_type text;
  v_occurrence_class_id uuid;
  v_enrollment_class_id uuid;
  v_student_id uuid;
begin
  select occurrence.occurrence_type, schedule.class_id
  into v_occurrence_type, v_occurrence_class_id
  from public.session_occurrences occurrence
  join public.schedules schedule on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id;

  if v_occurrence_type is distinct from 'MAKEUP' then
    raise exception 'Explicit participants are only allowed for makeup sessions';
  end if;

  select enrollment.class_id, enrollment.student_id
  into v_enrollment_class_id, v_student_id
  from public.enrollments enrollment
  where enrollment.id = new.enrollment_id;

  if v_occurrence_class_id is distinct from v_enrollment_class_id
    and public.class_enrollment_compatibility(v_occurrence_class_id, v_student_id) is distinct from 'IN_SCOPE'
  then
    raise exception 'Makeup participant must belong to the occurrence class or a compatible program';
  end if;

  return new;
end;
$$;

create or replace function public.session_teaching_roster(p_session uuid)
returns table(enrollment_id uuid, student_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.student_id
  from public.session_occurrences o
  join public.schedules sc on sc.id = o.schedule_id
  join public.enrollments e on true
  where o.id = p_session
    and (
      (
        o.occurrence_type = 'REGULAR'
        and e.class_id = sc.class_id
        and e.started_at <= o.occurrence_date
        and (e.ended_at is null or e.ended_at >= o.occurrence_date)
        and not public.is_enrollment_paused_on(e.id, o.occurrence_date)
      )
      or exists (
        select 1
        from public.session_occurrence_participants p
        where p.session_occurrence_id = o.id
          and p.enrollment_id = e.id
          and p.booking_status in ('ACTIVE', 'RELEASED')
          and (
            o.occurrence_type = 'MAKEUP'
            or e.class_id is distinct from sc.class_id
          )
      )
    )
$$;

create or replace function public.validate_attendance_record_class()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_occurrence_class_id uuid;
  v_occurrence_status text;
  v_occurrence_type text;
  v_occurrence_date date;
  v_enrollment_class_id uuid;
  v_enrollment_student_id uuid;
  v_enrollment_started_at date;
  v_enrollment_ended_at date;
begin
  select schedule.class_id, occurrence.status, occurrence.occurrence_type, occurrence.occurrence_date
  into v_occurrence_class_id, v_occurrence_status, v_occurrence_type, v_occurrence_date
  from public.session_occurrences occurrence
  join public.schedules schedule on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id;

  if v_occurrence_status = 'CANCELLED' then
    raise exception 'Attendance cannot be recorded for a cancelled session';
  end if;

  select enrollment.class_id, enrollment.student_id, enrollment.started_at, enrollment.ended_at
  into v_enrollment_class_id, v_enrollment_student_id, v_enrollment_started_at, v_enrollment_ended_at
  from public.enrollments enrollment
  where enrollment.id = new.enrollment_id;

  if v_occurrence_class_id is distinct from v_enrollment_class_id
    and not (
      exists (
        select 1 from public.session_occurrence_participants participant
        where participant.session_occurrence_id = new.session_occurrence_id
          and participant.enrollment_id = new.enrollment_id
          and participant.booking_status = 'ACTIVE'
      )
      and public.class_enrollment_compatibility(v_occurrence_class_id, v_enrollment_student_id) = 'IN_SCOPE'
    )
  then
    raise exception 'Attendance enrollment must belong to the occurrence class';
  end if;

  if v_occurrence_type = 'REGULAR'
    and (
      v_enrollment_started_at is null
      or v_enrollment_started_at > v_occurrence_date
      or (v_enrollment_ended_at is not null and v_enrollment_ended_at < v_occurrence_date)
    )
  then
    raise exception 'Attendance cannot be recorded outside the enrollment study period';
  end if;

  if v_occurrence_type = 'REGULAR'
    and public.is_enrollment_paused_on(new.enrollment_id, v_occurrence_date)
  then
    raise exception 'Attendance cannot be recorded while the enrollment is paused';
  end if;

  if v_occurrence_type = 'MAKEUP'
    and not exists (
      select 1 from public.session_occurrence_participants
      where session_occurrence_id = new.session_occurrence_id
        and booking_status = 'ACTIVE'
        and enrollment_id = new.enrollment_id
    )
  then
    raise exception 'Attendance enrollment must be a makeup participant';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
