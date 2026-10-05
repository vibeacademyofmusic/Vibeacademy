-- Read-only Zalo admin projections. No outbound messages, no payload, no channel identity.

create function public.zalo_integration_overview()
returns table (
  total_events bigint,
  events_today bigint,
  accepted_events bigint,
  pending_events bigint,
  failed_events bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  return query
  select
    count(*)::bigint,
    count(*) filter (
      where (received_at at time zone 'Asia/Ho_Chi_Minh')::date = public.registration_vietnam_today()
    )::bigint,
    count(*) filter (where status = 'ACCEPTED')::bigint,
    count(*) filter (where processed_at is null and processing_error is null)::bigint,
    count(*) filter (where processing_error is not null)::bigint
  from public.integration_webhook_events
  where provider = 'ZALO';
end;
$$;

create function public.zalo_recent_events(p_limit integer)
returns table (
  id uuid,
  received_at timestamptz,
  event_type text,
  external_event_id text,
  status text,
  processing_state text,
  processing_error text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Limit out of range';
  end if;
  return query
  select
    event.id,
    event.received_at,
    event.event_type,
    event.external_event_id,
    event.status,
    case
      when event.processing_error is not null then 'FAILED'
      when event.processed_at is not null then 'PROCESSED'
      else 'PENDING'
    end,
    event.processing_error
  from public.integration_webhook_events event
  where event.provider = 'ZALO'
  order by event.received_at desc, event.id desc
  limit p_limit;
end;
$$;

create function public.zalo_linked_customers()
returns table (
  link_id uuid,
  entity_type text,
  display_label text,
  branch_name text,
  linked_at timestamptz,
  last_verified_at timestamptz,
  link_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  return query
  select
    link.id,
    case
      when link.registration_application_id is not null then 'REGISTRATION'
      when link.parent_id is not null then 'PARENT'
      else 'STUDENT'
    end,
    case
      when link.registration_application_id is not null then coalesce(nullif(btrim(app.student_name), ''), app.application_code)
      when link.student_id is not null then coalesce(nullif(btrim(student.full_name), ''), student.student_code)
      else coalesce(
        (select profile.full_name from public.profiles profile where profile.id = parent.user_id),
        parent.parent_code
      )
    end,
    case
      when app.id is not null then branch.name
      when student.id is not null then student_branch.name
      else null
    end,
    link.linked_at,
    link.last_verified_at,
    link.status
  from public.customer_channel_links link
  left join public.registration_applications app on app.id = link.registration_application_id
  left join public.branches branch on branch.id = app.branch_id
  left join public.parents parent on parent.id = link.parent_id
  left join public.students student on student.id = link.student_id
  left join public.branches student_branch on student_branch.id = student.default_branch_id
  where link.provider = 'ZALO'
  order by link.created_at desc
  limit 100;
end;
$$;

create function public.registration_zalo_connection(p_registration uuid)
returns table (
  connection_state text,
  linked_at timestamptz,
  last_verified_at timestamptz,
  provider text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  branch uuid;
begin
  if auth.uid() is null or p_registration is null then
    return;
  end if;
  select app.branch_id into branch
  from public.registration_applications app
  where app.id = p_registration;
  if branch is null or not public.registration_can('registration.view', branch) then
    return;
  end if;

  return query
  select
    link.status,
    link.linked_at,
    link.last_verified_at,
    link.provider
  from public.customer_channel_links link
  where link.provider = 'ZALO'
    and link.registration_application_id = p_registration
  order by case link.status when 'ACTIVE' then 0 when 'PENDING' then 1 else 2 end, link.created_at desc
  limit 1;

  if not found then
    return query select 'NONE'::text, null::timestamptz, null::timestamptz, null::text;
  end if;
end;
$$;

revoke all on function public.zalo_integration_overview() from public, anon, authenticated, service_role;
revoke all on function public.zalo_recent_events(integer) from public, anon, authenticated, service_role;
revoke all on function public.zalo_linked_customers() from public, anon, authenticated, service_role;
revoke all on function public.registration_zalo_connection(uuid) from public, anon, authenticated, service_role;
grant execute on function public.zalo_integration_overview() to authenticated;
grant execute on function public.zalo_recent_events(integer) to authenticated;
grant execute on function public.zalo_linked_customers() to authenticated;
grant execute on function public.registration_zalo_connection(uuid) to authenticated;
