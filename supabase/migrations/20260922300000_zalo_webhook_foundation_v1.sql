-- Local Zalo webhook foundation. Stores verified event metadata and explicit
-- channel links. Does not create students, enrollments, payments, or messages.

create table public.integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'ZALO'),
  external_event_id text,
  event_type text not null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  status text not null check (status in ('ACCEPTED', 'UNSUPPORTED')),
  payload jsonb not null,
  payload_digest text not null,
  verification_result text not null check (verification_result = 'VALID'),
  processing_error text,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  check (external_event_id is null or external_event_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  check (char_length(event_type) between 1 and 80),
  check (payload_digest ~ '^[0-9a-f]{64}$'),
  check (jsonb_typeof(payload) = 'object'),
  unique (provider, payload_digest)
);

create index integration_webhook_events_received_idx
  on public.integration_webhook_events(provider, received_at desc, id);

create table public.customer_channel_links (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'ZALO'),
  provider_user_id text not null check (provider_user_id ~ '^[0-9]{8,32}$'),
  external_link_key text not null check (external_link_key ~ '^[A-Za-z0-9_-]{6,80}$'),
  registration_application_id uuid references public.registration_applications(id),
  parent_id uuid references public.parents(id),
  student_id uuid references public.students(id),
  status text not null check (status in ('PENDING', 'ACTIVE', 'REVOKED')),
  linked_at timestamptz,
  consent_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (num_nonnulls(registration_application_id, parent_id, student_id) = 1),
  check ((status = 'ACTIVE') = (linked_at is not null and consent_at is not null)),
  check (status <> 'PENDING' or (linked_at is null and consent_at is null))
);

create unique index customer_channel_links_registration_idx
  on public.customer_channel_links(provider, registration_application_id)
  where registration_application_id is not null and status <> 'REVOKED';
create unique index customer_channel_links_parent_idx
  on public.customer_channel_links(provider, parent_id)
  where parent_id is not null and status <> 'REVOKED';
create unique index customer_channel_links_student_idx
  on public.customer_channel_links(provider, student_id)
  where student_id is not null and status <> 'REVOKED';
create unique index customer_channel_links_registration_user_idx
  on public.customer_channel_links(provider, provider_user_id)
  where registration_application_id is not null and status <> 'REVOKED';
create unique index customer_channel_links_parent_user_idx
  on public.customer_channel_links(provider, provider_user_id)
  where parent_id is not null and status <> 'REVOKED';
create unique index customer_channel_links_student_user_idx
  on public.customer_channel_links(provider, provider_user_id)
  where student_id is not null and status <> 'REVOKED';

alter table public.integration_webhook_events enable row level security;
alter table public.customer_channel_links enable row level security;

revoke all on public.integration_webhook_events, public.customer_channel_links
  from public, anon, authenticated, service_role;
grant select (
  id, provider, external_event_id, event_type, received_at, processed_at,
  status, verification_result, processing_error, attempt_count
) on public.integration_webhook_events to authenticated;
grant select on public.customer_channel_links to authenticated;

create policy integration_webhook_events_admin_read
  on public.integration_webhook_events
  for select to authenticated
  using (public.has_role('SUPER_ADMIN'));

create policy customer_channel_links_admin_read
  on public.customer_channel_links
  for select to authenticated
  using (public.has_role('SUPER_ADMIN'));

create function public.record_integration_webhook_event(
  p_provider text,
  p_external_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_payload_digest text,
  p_supported boolean
) returns table(event_id uuid, event_status text, is_duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.integration_webhook_events;
  next_status text;
begin
  if p_provider is distinct from 'ZALO' then
    raise exception 'Unsupported provider';
  end if;
  if p_payload_digest is null or p_payload_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Payload digest required';
  end if;
  if p_event_type is null or p_event_type !~ '^[A-Za-z0-9_]{1,80}$' then
    raise exception 'Event type required';
  end if;
  if p_external_event_id is not null and p_external_event_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'External event id invalid';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload object required';
  end if;
  if p_payload ?| array['access_token', 'refresh_token', 'app_secret', 'oa_secret', 'secret'] then
    raise exception 'Secret material refused';
  end if;
  if p_supported is null then
    raise exception 'Supported flag required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zalo-webhook:' || p_payload_digest, 0));
  select * into existing
  from public.integration_webhook_events
  where provider = 'ZALO' and payload_digest = p_payload_digest;
  if found then
    return query select existing.id, existing.status, true;
    return;
  end if;

  next_status := case when p_supported then 'ACCEPTED' else 'UNSUPPORTED' end;
  return query
  insert into public.integration_webhook_events(
    provider, external_event_id, event_type, status, payload, payload_digest,
    verification_result, attempt_count
  ) values (
    'ZALO', p_external_event_id, p_event_type, next_status, p_payload, p_payload_digest,
    'VALID', 1
  )
  returning id, status, false;
end;
$$;

create function public.link_customer_channel(
  p_provider text,
  p_provider_user_id text,
  p_external_link_key text,
  p_registration_application_id uuid,
  p_parent_id uuid,
  p_student_id uuid,
  p_consent_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.customer_channel_links;
  created uuid;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  if p_provider is distinct from 'ZALO' then
    raise exception 'Unsupported provider';
  end if;
  if p_provider_user_id is null or p_provider_user_id !~ '^[0-9]{8,32}$' then
    raise exception 'Invalid Zalo identity';
  end if;
  if p_external_link_key is null or p_external_link_key !~ '^[A-Za-z0-9_-]{6,80}$' then
    raise exception 'Invalid channel key';
  end if;
  if num_nonnulls(p_registration_application_id, p_parent_id, p_student_id) <> 1 then
    raise exception 'Exactly one channel subject';
  end if;
  if p_registration_application_id is not null and not exists(
    select 1 from public.registration_applications where id = p_registration_application_id
  ) then
    raise exception 'Channel subject not found';
  end if;
  if p_parent_id is not null and not exists(
    select 1 from public.parents where id = p_parent_id
  ) then
    raise exception 'Channel subject not found';
  end if;
  if p_student_id is not null and not exists(
    select 1 from public.students where id = p_student_id
  ) then
    raise exception 'Channel subject not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zalo-channel:' || p_provider_user_id, 0));
  select * into existing
  from public.customer_channel_links
  where provider = 'ZALO'
    and status <> 'REVOKED'
    and registration_application_id is not distinct from p_registration_application_id
    and parent_id is not distinct from p_parent_id
    and student_id is not distinct from p_student_id;
  if found then
    if existing.provider_user_id is distinct from p_provider_user_id
      or existing.external_link_key is distinct from p_external_link_key then
      raise exception 'Channel already linked';
    end if;
    return existing.id;
  end if;

  insert into public.customer_channel_links(
    provider, provider_user_id, external_link_key, registration_application_id,
    parent_id, student_id, status, linked_at, consent_at
  ) values (
    'ZALO', p_provider_user_id, p_external_link_key, p_registration_application_id,
    p_parent_id, p_student_id,
    case when p_consent_at is null then 'PENDING' else 'ACTIVE' end,
    case when p_consent_at is null then null else clock_timestamp() end,
    p_consent_at
  )
  returning id into created;
  return created;
exception
  when unique_violation then
    raise exception 'Channel already linked';
end;
$$;

revoke all on function public.record_integration_webhook_event(text, text, text, jsonb, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.link_customer_channel(text, text, text, uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_integration_webhook_event(text, text, text, jsonb, text, boolean)
  to service_role;
grant execute on function public.link_customer_channel(text, text, text, uuid, uuid, uuid, timestamptz)
  to authenticated;
