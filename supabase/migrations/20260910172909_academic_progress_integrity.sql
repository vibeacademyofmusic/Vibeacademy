-- ============================================================
-- VIBE ACADEMY
-- Academic Progress Integrity
--
-- 1. Required Components → Subject
-- 2. Required Subjects   → Level / Grade
-- 3. Progress timestamps
-- ============================================================


-- ============================================================
-- 1. PROGRESS TIMESTAMPS
-- ============================================================

create or replace function public.stamp_academic_progress_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if tg_op = 'INSERT'
     or new.status is distinct from old.status
  then

    -- Any status other than NOT_STARTED means learning has begun.
    if new.status <> 'NOT_STARTED' then
      new.started_at := coalesce(new.started_at, now());
    end if;

    -- PASS timestamp.
    if new.status = 'PASS' then
      new.passed_at := coalesce(new.passed_at, now());
    else
      new.passed_at := null;
    end if;

  end if;

  new.updated_at := now();

  return new;
end;
$$;


drop trigger if exists
  trg_stamp_student_component_progress
on public.student_component_progress;

create trigger trg_stamp_student_component_progress
before insert or update of status
on public.student_component_progress
for each row
execute function public.stamp_academic_progress_status();


drop trigger if exists
  trg_stamp_student_subject_progress
on public.student_subject_progress;

create trigger trg_stamp_student_subject_progress
before insert or update of status
on public.student_subject_progress
for each row
execute function public.stamp_academic_progress_status();


-- ============================================================
-- 2. LEVEL / GRADE TIMESTAMPS
-- ============================================================

create or replace function public.stamp_level_progress_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if tg_op = 'INSERT'
     or new.status is distinct from old.status
  then

    if new.status = 'IN_PROGRESS' then
      new.started_at := coalesce(new.started_at, now());
    end if;

    if new.status = 'COMPLETED' then
      new.started_at := coalesce(new.started_at, now());
      new.completed_at := coalesce(new.completed_at, now());
    elsif tg_op = 'UPDATE'
          and old.status = 'COMPLETED'
          and new.status <> 'COMPLETED'
    then
      new.completed_at := null;
    end if;

  end if;

  new.updated_at := now();

  return new;
end;
$$;


drop trigger if exists
  trg_stamp_student_level_progress
on public.student_level_progress;

create trigger trg_stamp_student_level_progress
before insert or update of status
on public.student_level_progress
for each row
execute function public.stamp_level_progress_status();


-- ============================================================
-- 3. REQUIRED COMPONENTS → SUBJECT
-- ============================================================

create or replace function public.sync_subject_progress_from_components()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_progress_id uuid;
  v_subject_id uuid;
  v_completion_rule text;

  v_total integer;
  v_not_started integer;
  v_pass integer;
  v_not_passed integer;
  v_exempt integer;

  v_new_status text;
begin

  if tg_op = 'DELETE' then
    v_subject_progress_id := old.subject_progress_id;
  else
    v_subject_progress_id := new.subject_progress_id;
  end if;


  select
    ssp.subject_id,
    cs.completion_rule
  into
    v_subject_id,
    v_completion_rule
  from public.student_subject_progress ssp
  join public.curriculum_subjects cs
    on cs.id = ssp.subject_id
  where ssp.id = v_subject_progress_id;


  -- Direct Assessment / Manual subjects
  -- are not calculated from components.
  if v_completion_rule is distinct from 'ALL_REQUIRED_COMPONENTS' then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  select
    count(*)::integer,

    count(*) filter (
      where scp.status = 'NOT_STARTED'
    )::integer,

    count(*) filter (
      where scp.status = 'PASS'
    )::integer,

    count(*) filter (
      where scp.status = 'NOT_PASSED'
    )::integer,

    count(*) filter (
      where scp.status = 'EXEMPT'
    )::integer

  into
    v_total,
    v_not_started,
    v_pass,
    v_not_passed,
    v_exempt

  from public.student_component_progress scp

  join public.curriculum_subject_components csc
    on csc.id = scp.component_id

  where scp.subject_progress_id = v_subject_progress_id
    and csc.is_required = true
    and csc.status = 'ACTIVE';


  -- No required components = do not auto-complete.
  if v_total = 0 then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  if v_not_started = v_total then

    v_new_status := 'NOT_STARTED';

  elsif (v_pass + v_exempt) = v_total then

    v_new_status := 'PASS';

  elsif
    v_not_passed > 0
    and (v_pass + v_exempt + v_not_passed) = v_total
  then

    v_new_status := 'NOT_PASSED';

  else

    v_new_status := 'IN_PROGRESS';

  end if;


  update public.student_subject_progress
  set status = v_new_status
  where id = v_subject_progress_id
    and status is distinct from v_new_status;


  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;

end;
$$;


drop trigger if exists
  trg_sync_subject_progress_from_components
on public.student_component_progress;

create trigger trg_sync_subject_progress_from_components
after insert or delete or update of status
on public.student_component_progress
for each row
execute function public.sync_subject_progress_from_components();


-- ============================================================
-- 4. REQUIRED SUBJECTS → LEVEL / GRADE
-- ============================================================

create or replace function public.sync_level_progress_from_subjects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_progress_id uuid;
  v_level_id uuid;
  v_completion_rule text;

  v_total integer;
  v_completed integer;
  v_started integer;

  v_current_status text;
  v_new_status text;
begin

  if tg_op = 'DELETE' then
    v_level_progress_id := old.level_progress_id;
  else
    v_level_progress_id := new.level_progress_id;
  end if;


  select
    slp.level_id,
    cl.completion_rule,
    slp.status
  into
    v_level_id,
    v_completion_rule,
    v_current_status
  from public.student_level_progress slp
  join public.curriculum_levels cl
    on cl.id = slp.level_id
  where slp.id = v_level_progress_id;


  -- Manual levels are not automatically completed.
  if v_completion_rule is distinct from 'ALL_REQUIRED_SUBJECTS' then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  select
    count(*)::integer,

    count(*) filter (
      where ssp.status in ('PASS', 'EXEMPT')
    )::integer,

    count(*) filter (
      where ssp.status <> 'NOT_STARTED'
    )::integer

  into
    v_total,
    v_completed,
    v_started

  from public.student_subject_progress ssp

  join public.curriculum_subjects cs
    on cs.id = ssp.subject_id

  where ssp.level_progress_id = v_level_progress_id
    and cs.is_required = true
    and cs.status = 'ACTIVE';


  -- No required subjects = do not auto-complete.
  if v_total = 0 then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  if v_completed = v_total then

    v_new_status := 'COMPLETED';

  elsif v_started > 0 then

    v_new_status := 'IN_PROGRESS';

  elsif v_current_status in ('IN_PROGRESS', 'COMPLETED') then

    v_new_status := 'IN_PROGRESS';

  else

    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;

  end if;


  update public.student_level_progress
  set status = v_new_status
  where id = v_level_progress_id
    and status is distinct from v_new_status;


  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;

end;
$$;


drop trigger if exists
  trg_sync_level_progress_from_subjects
on public.student_subject_progress;

create trigger trg_sync_level_progress_from_subjects
after insert or delete or update of status
on public.student_subject_progress
for each row
execute function public.sync_level_progress_from_subjects();