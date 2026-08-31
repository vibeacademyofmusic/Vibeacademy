-- ============================================================
-- VIBE ACADEMY
-- Academic Progress Engine
--
-- Component Progress
--        ↓
-- Subject Progress
--        ↓
-- Level / Grade Progress
--
-- Created: 2026-09-01
-- ============================================================


-- ============================================================
-- 1. COMPONENT → SUBJECT
-- ============================================================

create or replace function public.sync_subject_progress_from_components()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_progress_id uuid;

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
    count(*)::integer,

    count(*) filter (
      where status = 'NOT_STARTED'
    )::integer,

    count(*) filter (
      where status = 'PASS'
    )::integer,

    count(*) filter (
      where status = 'NOT_PASSED'
    )::integer,

    count(*) filter (
      where status = 'EXEMPT'
    )::integer

  into
    v_total,
    v_not_started,
    v_pass,
    v_not_passed,
    v_exempt

  from public.student_component_progress
  where subject_progress_id = v_subject_progress_id;


  -- Subjects without components are managed directly.
  if v_total = 0 then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  -- All components have not started.
  if v_not_started = v_total then

    v_new_status := 'NOT_STARTED';


  -- All components successfully completed
  -- or formally exempted.
  elsif (v_pass + v_exempt) = v_total then

    v_new_status := 'PASS';


  -- All components have reached a final state,
  -- but at least one component was not passed.
  elsif
    v_not_passed > 0
    and (v_pass + v_exempt + v_not_passed) = v_total
  then

    v_new_status := 'NOT_PASSED';


  -- Any mixed or currently active state.
  else

    v_new_status := 'IN_PROGRESS';

  end if;


  update public.student_subject_progress
  set
    status = v_new_status,

    started_at =
      case
        when v_new_status = 'NOT_STARTED'
          then started_at
        else coalesce(started_at, now())
      end,

    passed_at =
      case
        when v_new_status = 'PASS'
          then coalesce(passed_at, now())
        else null
      end,

    updated_at = now()

  where id = v_subject_progress_id;


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
-- 2. SUBJECT → LEVEL / GRADE
-- ============================================================

create or replace function public.sync_level_progress_from_subjects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_progress_id uuid;

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
    count(*)::integer,

    count(*) filter (
      where status in ('PASS', 'EXEMPT')
    )::integer,

    count(*) filter (
      where status <> 'NOT_STARTED'
    )::integer

  into
    v_total,
    v_completed,
    v_started

  from public.student_subject_progress
  where level_progress_id = v_level_progress_id;


  if v_total = 0 then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  select status
  into v_current_status
  from public.student_level_progress
  where id = v_level_progress_id;


  -- Every required subject has been passed or exempted.
  if v_completed = v_total then

    v_new_status := 'COMPLETED';


  -- At least one subject has begun.
  elsif v_started > 0 then

    v_new_status := 'IN_PROGRESS';


  -- Do not silently return a previously active/completed
  -- level to AVAILABLE or LOCKED.
  elsif v_current_status in ('IN_PROGRESS', 'COMPLETED') then

    v_new_status := 'IN_PROGRESS';


  -- Preserve LOCKED / AVAILABLE when nothing has started.
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