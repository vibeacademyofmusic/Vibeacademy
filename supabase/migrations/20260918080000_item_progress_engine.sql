-- ============================================================
-- VIBE ACADEMY
-- Item Progress -> Component Progress Engine
--
-- Academic Structure:
-- Program
--   -> Level
--     -> Subject
--       -> Component
--         -> Item
--
-- Component completion_rule:
-- DIRECT_ASSESSMENT
-- ALL_REQUIRED_ITEMS
-- ============================================================


-- ============================================================
-- 1. SYNC COMPONENT FROM ITEMS
-- ============================================================

create or replace function public.sync_component_progress_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component_progress_id uuid;
  v_component_id uuid;
  v_completion_rule text;

  v_total integer;
  v_not_started integer;
  v_in_progress integer;
  v_completed integer;
  v_legacy_failed integer;

  v_new_status text;
begin

  if tg_op = 'DELETE' then
    v_component_progress_id := old.component_progress_id;
  else
    v_component_progress_id := new.component_progress_id;
  end if;


  select
    scp.component_id,
    csc.completion_rule
  into
    v_component_id,
    v_completion_rule
  from public.student_component_progress scp
  join public.curriculum_subject_components csc
    on csc.id = scp.component_id
  where scp.id = v_component_progress_id;


  -- Direct-assessment components are managed directly.
  if v_completion_rule is distinct from 'ALL_REQUIRED_ITEMS' then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  -- Count ACTIVE + REQUIRED curriculum items.
  -- Missing student progress counts as NOT_STARTED.
  select
    count(*)::integer,

    count(*) filter (
      where coalesce(scip.status, 'NOT_STARTED') = 'NOT_STARTED'
    )::integer,

    count(*) filter (
      where scip.status = 'IN_PROGRESS'
    )::integer,

    count(*) filter (
      where scip.status in (
        'PASS',
        'MERIT',
        'DISTINCTION',
        'EXEMPT'
      )
    )::integer,

    count(*) filter (
      where scip.status = 'NOT_PASSED'
    )::integer

  into
    v_total,
    v_not_started,
    v_in_progress,
    v_completed,
    v_legacy_failed

  from public.curriculum_component_items item

  left join public.student_component_item_progress scip
    on scip.item_id = item.id
   and scip.component_progress_id = v_component_progress_id

  where item.component_id = v_component_id
    and item.status = 'ACTIVE'
    and item.is_required = true;


  -- ALL_REQUIRED_ITEMS must actually have required active items.
  if v_total = 0 then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;


  -- All required items untouched.
  if v_not_started = v_total then
    v_new_status := 'NOT_STARTED';

  -- All required items completed successfully.
  elsif v_completed = v_total then
    v_new_status := 'PASS';

  -- Legacy final failure remains representable.
  elsif v_legacy_failed > 0
    and (v_completed + v_legacy_failed) = v_total
  then
    v_new_status := 'NOT_PASSED';

  -- Any mixed/active state.
  else
    v_new_status := 'IN_PROGRESS';

  end if;


  update public.student_component_progress
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

  where id = v_component_progress_id;


  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;

end;
$$;


-- ============================================================
-- 2. TRIGGER
-- ============================================================

drop trigger if exists
  trg_sync_component_progress_from_items
on public.student_component_item_progress;


create trigger trg_sync_component_progress_from_items
after insert or delete or update of status
on public.student_component_item_progress
for each row
execute function public.sync_component_progress_from_items();


-- ============================================================
-- 3. VALIDATE ALL_REQUIRED_ITEMS COMPONENTS
-- ============================================================

create or replace function public.validate_component_item_rule()
returns trigger
language plpgsql
set search_path = public
as $$
begin

  if new.completion_rule = 'ALL_REQUIRED_ITEMS'
    and not exists (
      select 1
      from public.curriculum_component_items item
      where item.component_id = new.id
        and item.status = 'ACTIVE'
        and item.is_required = true
    )
  then
    raise exception
      'ALL_REQUIRED_ITEMS component requires at least one required active item';
  end if;

  return new;
end;
$$;


drop trigger if exists
  trg_validate_component_item_rule
on public.curriculum_subject_components;


create trigger trg_validate_component_item_rule
before update of completion_rule
on public.curriculum_subject_components
for each row
execute function public.validate_component_item_rule();