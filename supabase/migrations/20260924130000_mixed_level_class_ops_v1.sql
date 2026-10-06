-- Mixed-Level Class Operations v1 (LOCAL).
-- Class Accepted Level Scope + enrollment compatibility.
-- Does NOT remove courses.level_id, does NOT add enrollments.level_id,
-- does NOT delete Classes/Sessions/Attendance, does NOT auto-unenroll.

-- =========================================================
-- M1: accepted Level scope columns (nullable for transition)
-- =========================================================

alter table public.classes
  add column if not exists accepted_from_level_id uuid
    references public.curriculum_levels(id) on delete restrict,
  add column if not exists accepted_to_level_id uuid
    references public.curriculum_levels(id) on delete restrict;

comment on column public.classes.accepted_from_level_id is
  'Inclusive lower bound of accepted Student Levels for new enrollments. NULL = scope unconfigured.';
comment on column public.classes.accepted_to_level_id is
  'Inclusive upper bound of accepted Student Levels for new enrollments. NULL = scope unconfigured.';

create index if not exists classes_accepted_from_level_idx
  on public.classes(accepted_from_level_id);
create index if not exists classes_accepted_to_level_idx
  on public.classes(accepted_to_level_id);

-- =========================================================
-- Scope validation (both NULL OK; partial NOT OK; same curriculum + sequence)
-- =========================================================

create or replace function public.validate_class_level_scope(
  p_course_id uuid,
  p_from uuid,
  p_to uuid
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_curriculum uuid;
  v_from_curriculum uuid;
  v_to_curriculum uuid;
  v_from_seq integer;
  v_to_seq integer;
begin
  if p_from is null and p_to is null then
    return;
  end if;

  if p_from is null or p_to is null then
    raise exception 'Class level scope requires both from and to Levels, or both null'
      using errcode = 'P0001';
  end if;

  select curriculum_id into v_curriculum
  from public.courses
  where id = p_course_id;

  if v_curriculum is null then
    raise exception 'Course not found for class level scope'
      using errcode = 'P0001';
  end if;

  select curriculum_id, sequence_no into v_from_curriculum, v_from_seq
  from public.curriculum_levels
  where id = p_from;

  if not found then
    raise exception 'From Level not found'
      using errcode = 'P0001';
  end if;

  select curriculum_id, sequence_no into v_to_curriculum, v_to_seq
  from public.curriculum_levels
  where id = p_to;

  if not found then
    raise exception 'To Level not found'
      using errcode = 'P0001';
  end if;

  if v_from_curriculum is distinct from v_curriculum
     or v_to_curriculum is distinct from v_curriculum then
    raise exception 'Class level scope must use Levels from the Course curriculum'
      using errcode = 'P0001';
  end if;

  if v_from_seq > v_to_seq then
    raise exception 'Class level scope from sequence cannot exceed to sequence'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.guard_class_level_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.validate_class_level_scope(
    new.course_id,
    new.accepted_from_level_id,
    new.accepted_to_level_id
  );
  return new;
end;
$$;

drop trigger if exists trg_guard_class_level_scope on public.classes;
create trigger trg_guard_class_level_scope
before insert or update of course_id, accepted_from_level_id, accepted_to_level_id
on public.classes
for each row execute function public.guard_class_level_scope();

-- Safe single-level backfill only when Course.level_id is set (intended mono-level).
update public.classes class_row
set
  accepted_from_level_id = course.level_id,
  accepted_to_level_id = course.level_id
from public.courses course
where class_row.course_id = course.id
  and course.level_id is not null
  and class_row.accepted_from_level_id is null
  and class_row.accepted_to_level_id is null;

-- =========================================================
-- M2: Student current Level + enrollment compatibility (derived, not copied)
-- =========================================================

create or replace function public.class_student_current_level(
  p_class uuid,
  p_student uuid
)
returns table (
  student_curriculum_enrollment_id uuid,
  current_level_id uuid,
  level_name text,
  sequence_no integer,
  curriculum_id uuid
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    sce.id,
    sce.current_level_id,
    level_row.name,
    level_row.sequence_no,
    course.curriculum_id
  from public.classes class_row
  join public.courses course on course.id = class_row.course_id
  join public.student_curriculum_enrollments sce
    on sce.student_id = p_student
   and sce.curriculum_id = course.curriculum_id
   and sce.status = 'ACTIVE'
  left join public.curriculum_levels level_row
    on level_row.id = sce.current_level_id
  where class_row.id = p_class
  order by sce.is_primary desc nulls last, sce.started_at desc nulls last, sce.id
  limit 1;
$$;

create or replace function public.class_enrollment_compatibility(
  p_class uuid,
  p_student uuid
)
returns text
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_from uuid;
  v_to uuid;
  v_course uuid;
  v_curriculum uuid;
  v_prog record;
  v_from_seq integer;
  v_to_seq integer;
begin
  select class_row.accepted_from_level_id, class_row.accepted_to_level_id, class_row.course_id, course.curriculum_id
  into v_from, v_to, v_course, v_curriculum
  from public.classes class_row
  join public.courses course on course.id = class_row.course_id
  where class_row.id = p_class;

  if not found then
    raise exception 'Class not found' using errcode = 'P0001';
  end if;

  if v_from is null or v_to is null then
    return 'CLASS_SCOPE_UNCONFIGURED';
  end if;

  select * into v_prog
  from public.class_student_current_level(p_class, p_student);

  if not found then
    -- Distinguish wrong curriculum vs missing program: any active SCE for student?
    if exists (
      select 1 from public.student_curriculum_enrollments sce
      where sce.student_id = p_student and sce.status = 'ACTIVE'
    ) then
      return 'WRONG_PROGRAM';
    end if;
    return 'ACADEMIC_PROGRAM_MISSING';
  end if;

  if v_prog.current_level_id is null then
    return 'CURRENT_LEVEL_MISSING';
  end if;

  if v_prog.curriculum_id is distinct from v_curriculum then
    return 'WRONG_PROGRAM';
  end if;

  select sequence_no into v_from_seq from public.curriculum_levels where id = v_from;
  select sequence_no into v_to_seq from public.curriculum_levels where id = v_to;

  if v_prog.sequence_no is null then
    return 'CURRENT_LEVEL_MISSING';
  end if;

  if v_prog.sequence_no < v_from_seq or v_prog.sequence_no > v_to_seq then
    return 'OUTSIDE_SCOPE';
  end if;

  return 'IN_SCOPE';
end;
$$;

-- Block NEW enrollments that fail compatibility. Existing rows untouched by this trigger
-- (only fires on INSERT of ACTIVE/PAUSED). Reactivation of WITHDRAWN is also guarded.
create or replace function public.guard_enrollment_class_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if new.status not in ('ACTIVE', 'PAUSED') then
    return new;
  end if;

  -- Allow historical rows that already exist when only non-status fields change is N/A on INSERT.
  v_code := public.class_enrollment_compatibility(new.class_id, new.student_id);

  if v_code = 'IN_SCOPE' then
    return new;
  end if;

  raise exception 'Enrollment blocked: %', v_code
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_guard_enrollment_class_scope on public.enrollments;
create trigger trg_guard_enrollment_class_scope
before insert on public.enrollments
for each row execute function public.guard_enrollment_class_scope();

-- Also guard reactivation via UPDATE to ACTIVE/PAUSED from non-active.
create or replace function public.guard_enrollment_class_scope_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_code text;
begin
  if new.status in ('ACTIVE', 'PAUSED')
     and old.status is distinct from new.status
     and old.status not in ('ACTIVE', 'PAUSED') then
    v_code := public.class_enrollment_compatibility(new.class_id, new.student_id);
    if v_code <> 'IN_SCOPE' then
      raise exception 'Enrollment blocked: %', v_code
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_enrollment_class_scope_update on public.enrollments;
create trigger trg_guard_enrollment_class_scope_update
before update of status on public.enrollments
for each row execute function public.guard_enrollment_class_scope_update();

-- Operator RPC: set scope with validation (SUPER_ADMIN for V1 local ops parity with class writes)
create or replace function public.set_class_level_scope(
  p_class uuid,
  p_from uuid,
  p_to uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'Unauthorized' using errcode = 'P0001';
  end if;

  select course_id into v_course from public.classes where id = p_class;
  if v_course is null then
    raise exception 'Class not found' using errcode = 'P0001';
  end if;

  perform public.validate_class_level_scope(v_course, p_from, p_to);

  update public.classes
  set accepted_from_level_id = p_from,
      accepted_to_level_id = p_to,
      updated_at = now()
  where id = p_class;

  return p_class;
end;
$$;

revoke all on function
  public.validate_class_level_scope(uuid, uuid, uuid),
  public.guard_class_level_scope(),
  public.class_student_current_level(uuid, uuid),
  public.class_enrollment_compatibility(uuid, uuid),
  public.guard_enrollment_class_scope(),
  public.guard_enrollment_class_scope_update(),
  public.set_class_level_scope(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.class_student_current_level(uuid, uuid),
  public.class_enrollment_compatibility(uuid, uuid),
  public.set_class_level_scope(uuid, uuid, uuid)
to authenticated;

grant execute on function
  public.validate_class_level_scope(uuid, uuid, uuid)
to authenticated;
