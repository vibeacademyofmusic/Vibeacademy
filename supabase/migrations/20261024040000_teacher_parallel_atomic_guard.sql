-- Serialize the two-parallel-primary-teacher rule across different rooms.
-- The earlier overlap trigger reads schedules but does not lock a teacher row;
-- two concurrent inserts can otherwise each see only one existing shift.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

-- A VOLATILE SQL function takes a fresh snapshot after a waiting transaction
-- commits. The existing predicate and its business rule remain unchanged.
alter function public.primary_recurring_overlap_blocked(
  uuid, uuid, smallint, time, time, date, date
) volatile;

-- An assistant cannot teach an overlapping class in either assignment order:
-- the newly edited class may hold the assistant role, or the existing class may.
create function maintenance_private.assistant_recurring_overlap_blocked(
  p_class uuid, p_teacher uuid, p_role text, p_day smallint,
  p_start time, p_end time, p_from date, p_to date
) returns boolean
language sql
volatile
set search_path to public, pg_temp
as $$
  select exists (
    select 1
    from public.class_teachers other_assignment
    join public.schedules other_schedule
      on other_schedule.class_id = other_assignment.class_id
     and other_schedule.status = 'ACTIVE'
    where other_assignment.teacher_id = p_teacher
      and other_assignment.class_id <> p_class
      and other_assignment.is_active
      and (p_role = 'ASSISTANT' or other_assignment.teacher_role = 'ASSISTANT')
      and other_schedule.day_of_week = p_day
      and other_schedule.start_time < p_end
      and p_start < other_schedule.end_time
      and daterange(other_schedule.effective_from,
            coalesce(other_schedule.effective_to, 'infinity'::date), '[]')
          && daterange(p_from, coalesce(p_to, 'infinity'::date), '[]')
  )
$$;

revoke all on function maintenance_private.assistant_recurring_overlap_blocked(
  uuid, uuid, text, smallint, time, time, date, date
) from public, anon, authenticated, service_role;

create function maintenance_private.guard_schedule_teacher_parallel_atomic()
returns trigger
language plpgsql
volatile
security definer
set search_path to public, pg_temp
as $$
declare
  assignment record;
begin
  if new.status <> 'ACTIVE' then return new; end if;

  -- Match the class -> room -> teacher order of the other schedule guards.
  -- The trigger name sorts after the room and single-shift guards.
  perform 1 from public.classes where id = new.class_id for update;
  if not found then raise exception 'SCHEDULE_CLASS_UNKNOWN'; end if;

  for assignment in
    select teacher_id, bool_or(teacher_role = 'ASSISTANT') as is_assistant,
      bool_or(teacher_role = 'PRIMARY') as is_primary
    from public.class_teachers
    where class_id = new.class_id and is_active
    group by teacher_id
    order by teacher_id
  loop
    perform 1 from public.teachers where id = assignment.teacher_id for update;
    if not found then raise exception 'SCHEDULE_TEACHER_UNKNOWN'; end if;
    if maintenance_private.assistant_recurring_overlap_blocked(
      new.class_id, assignment.teacher_id,
      case when assignment.is_assistant then 'ASSISTANT' else 'PRIMARY' end,
      new.day_of_week, new.start_time, new.end_time,
      new.effective_from, new.effective_to
    ) then
      raise exception 'A teacher assigned to this class is already teaching another class at that time';
    end if;
    if assignment.is_primary and public.primary_recurring_overlap_blocked(
      new.class_id, assignment.teacher_id, new.day_of_week, new.start_time,
      new.end_time, new.effective_from, new.effective_to
    ) then
      raise exception 'A primary teacher already has two overlapping teaching shifts at that time';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function maintenance_private.guard_schedule_teacher_parallel_atomic()
  from public, anon, authenticated, service_role;

create trigger trg_zz_schedule_teacher_parallel_atomic
before insert or update of class_id, day_of_week, start_time, end_time,
  effective_from, effective_to, status
on public.schedules
for each row execute function maintenance_private.guard_schedule_teacher_parallel_atomic();

create function maintenance_private.guard_class_teacher_parallel_atomic()
returns trigger
language plpgsql
volatile
security definer
set search_path to public, pg_temp
as $$
declare
  slot record;
begin
  if new.is_active is not true then
    return new;
  end if;

  perform 1 from public.classes where id = new.class_id for update;
  if not found then raise exception 'SCHEDULE_CLASS_UNKNOWN'; end if;
  perform 1 from public.teachers where id = new.teacher_id for update;
  if not found then raise exception 'SCHEDULE_TEACHER_UNKNOWN'; end if;

  for slot in
    select day_of_week, start_time, end_time, effective_from, effective_to
    from public.schedules
    where class_id = new.class_id and status = 'ACTIVE'
    order by day_of_week, start_time, effective_from
  loop
    if maintenance_private.assistant_recurring_overlap_blocked(
      new.class_id, new.teacher_id, new.teacher_role::text,
      slot.day_of_week, slot.start_time, slot.end_time,
      slot.effective_from, slot.effective_to
    ) then
      raise exception 'A teacher assigned to this class is already teaching another class at that time';
    end if;
    if new.teacher_role = 'PRIMARY' and public.primary_recurring_overlap_blocked(
      new.class_id, new.teacher_id, slot.day_of_week, slot.start_time,
      slot.end_time, slot.effective_from, slot.effective_to
    ) then
      raise exception 'A primary teacher already has two overlapping teaching shifts at that time';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function maintenance_private.guard_class_teacher_parallel_atomic()
  from public, anon, authenticated, service_role;

create trigger trg_zz_class_teacher_parallel_atomic
before insert or update of class_id, teacher_id, teacher_role,
  is_active, assigned_at, ended_at
on public.class_teachers
for each row execute function maintenance_private.guard_class_teacher_parallel_atomic();

commit;
