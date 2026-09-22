-- ============================================================
-- VIBE ACADEMY
-- Auto-create Item Progress for Component Progress
--
-- Program
-- -> Level
-- -> Subject
-- -> Component
-- -> Item
-- ============================================================


-- ============================================================
-- 1. HELPER
-- ============================================================

create or replace function public.seed_component_item_progress(
  p_component_progress_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_component_id uuid;
  v_completion_rule text;
begin

  select
    scp.component_id,
    csc.completion_rule
  into
    v_component_id,
    v_completion_rule
  from public.student_component_progress scp
  join public.curriculum_subject_components csc
    on csc.id = scp.component_id
  where scp.id = p_component_progress_id;


  if v_component_id is null then
    return;
  end if;


  -- Only item-driven components require Item Progress.
  if v_completion_rule <> 'ALL_REQUIRED_ITEMS' then
    return;
  end if;


  insert into public.student_component_item_progress (
    component_progress_id,
    item_id,
    status
  )
  select
    p_component_progress_id,
    item.id,
    'NOT_STARTED'
  from public.curriculum_component_items item
  where item.component_id = v_component_id
    and item.status = 'ACTIVE'

  on conflict (
    component_progress_id,
    item_id
  )
  do nothing;

end;
$$;


-- ============================================================
-- 2. TRIGGER WRAPPER
-- ============================================================

create or replace function public.auto_seed_component_item_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  perform public.seed_component_item_progress(new.id);

  return new;

end;
$$;


-- ============================================================
-- 3. TRIGGER
-- ============================================================

drop trigger if exists
  trg_auto_seed_component_item_progress
on public.student_component_progress;


create trigger trg_auto_seed_component_item_progress
after insert
on public.student_component_progress
for each row
execute function public.auto_seed_component_item_progress();


-- ============================================================
-- 4. BACKFILL EXISTING COMPONENT PROGRESS
-- ============================================================

insert into public.student_component_item_progress (
  component_progress_id,
  item_id,
  status
)
select
  scp.id,
  item.id,
  'NOT_STARTED'

from public.student_component_progress scp

join public.curriculum_subject_components component
  on component.id = scp.component_id

join public.curriculum_component_items item
  on item.component_id = component.id
 and item.status = 'ACTIVE'

where component.completion_rule = 'ALL_REQUIRED_ITEMS'

on conflict (
  component_progress_id,
  item_id
)
do nothing;


-- ============================================================
-- 5. FUNCTION PRIVILEGES
-- ============================================================

revoke all on function
  public.seed_component_item_progress(uuid)
from public, anon, authenticated;


revoke all on function
  public.auto_seed_component_item_progress()
from public, anon, authenticated;