-- Vercel Hobby can schedule this check only once per day. The previous
-- health function rejected any interval above one hour, so a daily run
-- could not record its next check.

create or replace function public.zalo_scheduler_health(p_result text default null, p_interval integer default 600)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_result is not null then
    if p_result !~ '^[A-Z][A-Z0-9_-]{1,79}$' or p_interval < 60 or p_interval > 86400 then
      raise exception 'INVALID_HEALTH';
    end if;
    insert into notification_private.zalo_scheduler
    values (true, clock_timestamp(), p_result, clock_timestamp() + make_interval(secs => p_interval))
    on conflict (id) do update
      set checked_at = excluded.checked_at,
          result = excluded.result,
          next_check_at = excluded.next_check_at;
  end if;
  return (select to_jsonb(s) - 'id' from notification_private.zalo_scheduler s where id);
end $$;
