-- =========================================================
-- PAUSE -> TUITION EFFECTIVE END SYNCHRONIZATION
-- =========================================================
--
-- Business rules:
--
-- 1. base_ends_on is the immutable contractual end date.
--
-- 2. effective_ends_on is derived from ACTIVE enrollment
--    pauses.
--
-- 3. A pause only contributes days that intersect the
--    tuition entitlement window.
--
-- 4. Extending effective_ends_on may cause more days of an
--    existing pause, or a later pause, to enter the
--    entitlement window. Therefore calculation must repeat
--    until the effective end date reaches a fixed point.
--
-- 5. Cancelling a pause recalculates from source history.
--    We never increment/decrement effective_ends_on blindly.
--
-- 6. CANCELLED tuition terms are historical / void terms and
--    are not synchronized.
-- =========================================================


-- ---------------------------------------------------------
-- Calculate the effective end date for one tuition term.
-- ---------------------------------------------------------

create or replace function
public.calculate_enrollment_tuition_effective_end(
  p_tuition_id uuid
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
  v_starts_on date;
  v_base_ends_on date;

  v_effective_ends_on date;
  v_next_effective_ends_on date;

  v_pause_days integer;
  v_iteration integer := 0;
begin
  if p_tuition_id is null then
    raise exception
      'Tuition term id is required';
  end if;


  select
    tuition.enrollment_id,
    tuition.starts_on,
    tuition.base_ends_on
  into
    v_enrollment_id,
    v_starts_on,
    v_base_ends_on
  from public.enrollment_tuition as tuition
  where tuition.id = p_tuition_id;


  if not found then
    raise exception
      'Tuition term not found';
  end if;


  v_effective_ends_on :=
    v_base_ends_on;


  loop
    v_iteration :=
      v_iteration + 1;


    if v_iteration > 1000 then
      raise exception
        'Unable to calculate tuition effective end date';
    end if;


    select
      coalesce(
        sum(
          least(
            pause.ends_on,
            v_effective_ends_on
          )
          -
          greatest(
            pause.starts_on,
            v_starts_on
          )
          + 1
        ),
        0
      )::integer
    into v_pause_days
    from public.enrollment_pauses as pause
    where pause.enrollment_id =
        v_enrollment_id
      and pause.status = 'ACTIVE'
      and pause.starts_on <=
        v_effective_ends_on
      and pause.ends_on >=
        v_starts_on;


    v_next_effective_ends_on :=
      v_base_ends_on
      + v_pause_days;


    if v_next_effective_ends_on =
      v_effective_ends_on
    then
      exit;
    end if;


    v_effective_ends_on :=
      v_next_effective_ends_on;
  end loop;


  return v_effective_ends_on;
end;
$$;


-- ---------------------------------------------------------
-- Recalculate and persist one tuition term.
-- ---------------------------------------------------------

create or replace function
public.recalculate_enrollment_tuition_effective_end(
  p_tuition_id uuid
)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_effective_ends_on date;
begin
  if p_tuition_id is null then
    raise exception
      'Tuition term id is required';
  end if;


  select tuition.status
  into v_status
  from public.enrollment_tuition as tuition
  where tuition.id = p_tuition_id
  for update;


  if not found then
    raise exception
      'Tuition term not found';
  end if;


  if v_status = 'CANCELLED' then
    select tuition.effective_ends_on
    into v_effective_ends_on
    from public.enrollment_tuition as tuition
    where tuition.id = p_tuition_id;

    return v_effective_ends_on;
  end if;


  v_effective_ends_on :=
    public.calculate_enrollment_tuition_effective_end(
      p_tuition_id
    );


  update public.enrollment_tuition
  set effective_ends_on =
    v_effective_ends_on
  where id = p_tuition_id
    and effective_ends_on is distinct from
      v_effective_ends_on;


  return v_effective_ends_on;
end;
$$;


-- ---------------------------------------------------------
-- Whenever a pause is created or its ACTIVE/CANCELLED state
-- changes, rebuild all non-cancelled tuition terms for that
-- enrollment.
-- ---------------------------------------------------------

create or replace function
public.sync_enrollment_tuition_from_pause()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tuition record;
begin
  for v_tuition in
    select tuition.id
    from public.enrollment_tuition as tuition
    where tuition.enrollment_id =
        new.enrollment_id
      and tuition.status <> 'CANCELLED'
    order by
      tuition.starts_on,
      tuition.id
    for update
  loop
    perform
      public.recalculate_enrollment_tuition_effective_end(
        v_tuition.id
      );
  end loop;


  return new;
end;
$$;


drop trigger if exists
  trg_sync_enrollment_tuition_from_pause
on public.enrollment_pauses;


create trigger
  trg_sync_enrollment_tuition_from_pause
after insert or update of status
on public.enrollment_pauses
for each row
execute function
  public.sync_enrollment_tuition_from_pause();


-- ---------------------------------------------------------
-- If a tuition term is created while pauses already exist,
-- calculate its effective end immediately.
-- ---------------------------------------------------------

create or replace function
public.sync_new_enrollment_tuition_from_pauses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'CANCELLED' then
    perform
      public.recalculate_enrollment_tuition_effective_end(
        new.id
      );
  end if;


  return new;
end;
$$;


drop trigger if exists
  trg_sync_new_enrollment_tuition_from_pauses
on public.enrollment_tuition;


create trigger
  trg_sync_new_enrollment_tuition_from_pauses
after insert
on public.enrollment_tuition
for each row
execute function
  public.sync_new_enrollment_tuition_from_pauses();


-- ---------------------------------------------------------
-- Internal engine functions.
-- They are executed through database triggers rather than
-- directly by normal application users.
-- ---------------------------------------------------------

revoke all on function
  public.calculate_enrollment_tuition_effective_end(uuid)
from public;

revoke all on function
  public.recalculate_enrollment_tuition_effective_end(uuid)
from public;

revoke all on function
  public.sync_enrollment_tuition_from_pause()
from public;

revoke all on function
  public.sync_new_enrollment_tuition_from_pauses()
from public;
