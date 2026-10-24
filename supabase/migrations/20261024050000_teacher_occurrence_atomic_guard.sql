-- Concrete reschedules and makeup sessions may choose different rooms, but
-- must still share one serialized teacher-capacity decision.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

create function maintenance_private.teacher_occurrence_conflict_code(
  p_class uuid, p_teacher uuid, p_role text,
  p_starts timestamptz, p_ends timestamptz, p_session_date date,
  p_exclude_occurrence uuid
) returns text
language plpgsql
volatile
security definer
set search_path to pg_catalog, pg_temp
as $$
begin
  if exists (
    select 1
    from public.class_teachers other_assignment
    join public.schedules other_schedule
      on other_schedule.class_id = other_assignment.class_id
    join public.session_occurrences other_occurrence
      on other_occurrence.schedule_id = other_schedule.id
    where other_assignment.teacher_id = p_teacher
      and other_assignment.class_id <> p_class
      and other_assignment.is_active
      and other_assignment.assigned_at <= p_session_date
      and (other_assignment.ended_at is null or other_assignment.ended_at >= p_session_date)
      and (p_role = 'ASSISTANT' or other_assignment.teacher_role = 'ASSISTANT')
      and other_occurrence.id is distinct from p_exclude_occurrence
      and other_occurrence.status <> 'CANCELLED'
      and other_occurrence.starts_at < p_ends
      and p_starts < other_occurrence.ends_at
  ) then
    return 'ASSISTANT_OVERLAP';
  end if;

  if p_role = 'PRIMARY' and exists (
    with others as (
      select other_assignment.class_id, other_occurrence.starts_at,
        other_occurrence.ends_at
      from public.class_teachers other_assignment
      join public.schedules other_schedule
        on other_schedule.class_id = other_assignment.class_id
      join public.session_occurrences other_occurrence
        on other_occurrence.schedule_id = other_schedule.id
      where other_assignment.teacher_id = p_teacher
        and other_assignment.class_id <> p_class
        and other_assignment.teacher_role = 'PRIMARY'
        and other_assignment.is_active
        and other_assignment.assigned_at <= p_session_date
        and (other_assignment.ended_at is null or other_assignment.ended_at >= p_session_date)
        and other_occurrence.id is distinct from p_exclude_occurrence
        and other_occurrence.status <> 'CANCELLED'
        and other_occurrence.starts_at < p_ends
        and p_starts < other_occurrence.ends_at
    )
    select 1 from others a join others b
      on a.class_id < b.class_id
     and a.starts_at < b.ends_at
     and b.starts_at < a.ends_at
  ) then
    return 'PRIMARY_LIMIT';
  end if;

  return 'CLEAR';
end;
$$;

revoke all on function maintenance_private.teacher_occurrence_conflict_code(
  uuid, uuid, text, timestamptz, timestamptz, date, uuid
) from public, anon, authenticated, service_role;

create function maintenance_private.guard_occurrence_teacher_atomic()
returns trigger
language plpgsql
volatile
security definer
set search_path to pg_catalog, pg_temp
as $$
declare
  source_schedule public.schedules%rowtype;
  slot_date date;
  assignment record;
  conflict_code text;
begin
  if new.status = 'CANCELLED' or new.ends_at <= now() then
    return new;
  end if;

  select * into source_schedule
  from public.schedules where id = new.schedule_id for share;
  if not found then raise exception 'OCCURRENCE_SCHEDULE_UNKNOWN'; end if;
  perform 1 from public.classes where id = source_schedule.class_id for update;
  if not found then raise exception 'OCCURRENCE_CLASS_UNKNOWN'; end if;
  slot_date := (new.starts_at at time zone source_schedule.timezone)::date;

  for assignment in
    select teacher_id, teacher_role
    from public.class_teachers
    where class_id = source_schedule.class_id
      and is_active
      and assigned_at <= slot_date
      and (ended_at is null or ended_at >= slot_date)
    order by teacher_id
  loop
    perform 1 from public.teachers where id = assignment.teacher_id for update;
    if not found then raise exception 'OCCURRENCE_TEACHER_UNKNOWN'; end if;
    conflict_code := maintenance_private.teacher_occurrence_conflict_code(
      source_schedule.class_id, assignment.teacher_id, assignment.teacher_role,
      new.starts_at, new.ends_at, slot_date, new.id
    );
    if conflict_code = 'ASSISTANT_OVERLAP' then
      raise exception 'A teacher assigned to this class is already teaching another class at that time';
    elsif conflict_code = 'PRIMARY_LIMIT' then
      raise exception 'A primary teacher already has two overlapping teaching shifts at that time';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function maintenance_private.guard_occurrence_teacher_atomic()
  from public, anon, authenticated, service_role;

create trigger trg_zz_occurrence_teacher_atomic
before insert or update of schedule_id, starts_at, ends_at, status
on public.session_occurrences
for each row execute function maintenance_private.guard_occurrence_teacher_atomic();

create function maintenance_private.guard_class_teacher_occurrence_atomic()
returns trigger
language plpgsql
volatile
security definer
set search_path to pg_catalog, pg_temp
as $$
declare
  slot record;
  conflict_code text;
begin
  if new.is_active is not true then return new; end if;
  perform 1 from public.classes where id = new.class_id for update;
  if not found then raise exception 'OCCURRENCE_CLASS_UNKNOWN'; end if;
  perform 1 from public.teachers where id = new.teacher_id for update;
  if not found then raise exception 'OCCURRENCE_TEACHER_UNKNOWN'; end if;

  for slot in
    select occurrence.id, occurrence.starts_at, occurrence.ends_at,
      (occurrence.starts_at at time zone schedule.timezone)::date as session_date
    from public.schedules schedule
    join public.session_occurrences occurrence on occurrence.schedule_id = schedule.id
    where schedule.class_id = new.class_id
      and occurrence.status <> 'CANCELLED'
      and occurrence.ends_at > now()
    order by occurrence.starts_at, occurrence.id
  loop
    if new.assigned_at <= slot.session_date
      and (new.ended_at is null or new.ended_at >= slot.session_date) then
      conflict_code := maintenance_private.teacher_occurrence_conflict_code(
        new.class_id, new.teacher_id, new.teacher_role,
        slot.starts_at, slot.ends_at, slot.session_date, slot.id
      );
      if conflict_code = 'ASSISTANT_OVERLAP' then
        raise exception 'A teacher assigned to this class is already teaching another class at that time';
      elsif conflict_code = 'PRIMARY_LIMIT' then
        raise exception 'A primary teacher already has two overlapping teaching shifts at that time';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function maintenance_private.guard_class_teacher_occurrence_atomic()
  from public, anon, authenticated, service_role;

create trigger trg_zzz_class_teacher_occurrence_atomic
before insert or update of class_id, teacher_id, teacher_role,
  is_active, assigned_at, ended_at
on public.class_teachers
for each row execute function maintenance_private.guard_class_teacher_occurrence_atomic();

commit;
