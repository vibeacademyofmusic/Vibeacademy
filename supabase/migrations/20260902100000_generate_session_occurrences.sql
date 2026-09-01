-- =========================================================
-- VIBE ACADEMY
-- Session Engine: occurrence generator
-- =========================================================

-- Generates concrete sessions from active recurring schedules.
-- The unique key on (schedule_id, occurrence_date) makes repeated
-- calls safe: existing occurrences are left unchanged.

create or replace function public.generate_session_occurrences(
  p_from date,
  p_to date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted_count integer;
begin
  if p_from is null or p_to is null then
    raise exception 'Generation date range is required';
  end if;

  if p_to < p_from then
    raise exception 'Generation end date cannot be before start date';
  end if;

  if p_to - p_from > 366 then
    raise exception 'Generation date range cannot exceed 366 days';
  end if;

  insert into public.session_occurrences (
    schedule_id,
    occurrence_date,
    starts_at,
    ends_at,
    room_id,
    status
  )
  select
    schedule.id,
    generated.occurrence_date,
    (
      generated.occurrence_date
      + schedule.start_time
    ) at time zone schedule.timezone,
    (
      generated.occurrence_date
      + schedule.end_time
    ) at time zone schedule.timezone,
    schedule.room_id,
    'SCHEDULED'
  from public.schedules as schedule
  cross join lateral (
    select generated_at::date as occurrence_date
    from generate_series(
      greatest(
        p_from,
        schedule.effective_from
      )::timestamp,
      least(
        p_to,
        coalesce(schedule.effective_to, p_to)
      )::timestamp,
      interval '1 day'
    ) as generated_at
  ) as generated
  where schedule.status = 'ACTIVE'
    and schedule.effective_from <= p_to
    and (
      schedule.effective_to is null
      or schedule.effective_to >= p_from
    )
    and extract(
      isodow from generated.occurrence_date
    )::smallint = schedule.day_of_week
  on conflict (
    schedule_id,
    occurrence_date
  ) do nothing;

  get diagnostics
    v_inserted_count = row_count;

  return v_inserted_count;
end;
$$;

revoke all on function
  public.generate_session_occurrences(date, date)
from public;

grant execute on function
  public.generate_session_occurrences(date, date)
to authenticated;
