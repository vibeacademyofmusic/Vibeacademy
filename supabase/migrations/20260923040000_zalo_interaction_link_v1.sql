-- Registration Zalo interaction links.
-- A pending link stores only a stable non-PII external key.
-- widget_interaction_accepted is the only event that activates it.

alter table public.customer_channel_links
  alter column provider_user_id drop not null;

alter table public.customer_channel_links
  drop constraint customer_channel_links_provider_user_id_check;

alter table public.customer_channel_links
  add constraint customer_channel_links_provider_user_id_check
  check (provider_user_id is null or provider_user_id ~ '^[0-9]{8,32}$');

alter table public.customer_channel_links
  drop constraint customer_channel_links_status_check;

alter table public.customer_channel_links
  add constraint customer_channel_links_status_check
  check (status in ('PENDING', 'ACTIVE', 'REVOKED', 'REVIEW'));

alter table public.customer_channel_links
  add constraint customer_channel_links_active_identity_check
  check (status <> 'ACTIVE' or provider_user_id is not null);

alter table public.customer_channel_links
  add constraint customer_channel_links_review_identity_check
  check (
    status <> 'REVIEW'
    or (provider_user_id is null and linked_at is null and consent_at is null)
  );

create unique index customer_channel_links_registration_external_key_idx
  on public.customer_channel_links(provider, external_link_key)
  where registration_application_id is not null and status <> 'REVOKED';

alter table public.registration_application_events
  drop constraint registration_application_events_event_type_check;

alter table public.registration_application_events
  add constraint registration_application_events_event_type_check
  check (event_type in (
    'CREATED', 'SUBMITTED', 'VERIFIED', 'PAYMENT_CONFIRMED', 'IDENTITY_REVIEWED',
    'STUDENT_LINKED', 'PARENT_LINKED', 'ENROLLMENT_CREATED', 'REGISTRATION_COMPLETED',
    'PLACEMENT_OPENED', 'CANCELLED',
    'ZALO_LINK_REQUESTED', 'ZALO_LINK_CONFIRMED', 'ZALO_LINK_FAILED'
  ));

alter table public.registration_application_events
  alter column actor_id drop not null;

alter table public.registration_application_events
  add constraint registration_application_events_actor_check
  check (
    actor_id is not null
    or event_type in ('ZALO_LINK_CONFIRMED', 'ZALO_LINK_FAILED')
  );

create function public.request_registration_zalo_link(p_application uuid)
returns table(external_link_key text, link_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  branch uuid;
  existing public.customer_channel_links;
  created_key text;
begin
  if auth.uid() is null or not public.account_is_active() then
    raise exception 'Unauthorized';
  end if;
  select app.branch_id into branch
  from public.registration_applications app
  where app.id = p_application;
  if branch is null then
    raise exception 'Registration not found';
  end if;
  if not public.registration_can('registration.view', branch) then
    raise exception 'Unauthorized';
  end if;

  select * into existing
  from public.customer_channel_links
  where provider = 'ZALO'
    and registration_application_id = p_application
    and status <> 'REVOKED';
  if found then
    return query select existing.external_link_key, existing.status;
    return;
  end if;

  created_key := replace(gen_random_uuid()::text, '-', '');
  insert into public.customer_channel_links(
    provider, provider_user_id, external_link_key, registration_application_id, status
  ) values (
    'ZALO', null, created_key, p_application, 'PENDING'
  );

  perform set_config('registration.write', 'on', true);
  insert into public.registration_application_events(
    id, application_id, event_type, actor_id, metadata
  ) values (
    gen_random_uuid(), p_application, 'ZALO_LINK_REQUESTED', auth.uid(), '{}'::jsonb
  );

  return query select created_key, 'PENDING'::text;
end;
$$;

create function public.registration_zalo_connection(p_application uuid)
returns table(
  link_status text,
  external_link_key text,
  linked_at timestamptz,
  last_verified_at timestamptz,
  masked_user_id text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  branch uuid;
  existing public.customer_channel_links;
begin
  if auth.uid() is null or not public.account_is_active() then
    raise exception 'Unauthorized';
  end if;
  select app.branch_id into branch
  from public.registration_applications app
  where app.id = p_application;
  if branch is null then
    raise exception 'Registration not found';
  end if;
  if not public.registration_can('registration.view', branch) then
    raise exception 'Unauthorized';
  end if;

  select * into existing
  from public.customer_channel_links
  where provider = 'ZALO'
    and registration_application_id = p_application
    and status <> 'REVOKED';
  if not found then
    return query select 'NONE'::text, null::text, null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  return query select
    existing.status,
    existing.external_link_key,
    existing.linked_at,
    existing.last_verified_at,
    case
      when public.has_role('SUPER_ADMIN')
        and existing.provider_user_id is not null
        then '••••' || right(existing.provider_user_id, 4)
      else null
    end;
end;
$$;

create function public.apply_zalo_interaction_event(p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_name text := p_payload->>'event_name';
  event_data jsonb := p_payload->'data';
  zalo_user_id text := event_data->>'user_id';
  external_key text := event_data->>'user_external_id';
  event_timestamp text := p_payload->>'timestamp';
  event_consent timestamptz;
  link public.customer_channel_links;
  conflict public.customer_channel_links;
  failure_reason text;
begin
  if event_name is null
    or event_name not in ('widget_interaction_accepted', 'widget_failed_to_sync_user_external_id') then
    return 'ignored';
  end if;
  if external_key is null or external_key !~ '^[A-Za-z0-9_-]{6,80}$' then
    return 'missing';
  end if;
  if zalo_user_id is null or zalo_user_id !~ '^[0-9]{8,32}$' then
    return 'missing';
  end if;

  select * into link
  from public.customer_channel_links
  where provider = 'ZALO'
    and external_link_key = external_key
    and registration_application_id is not null
    and status <> 'REVOKED';
  if not found then
    return 'missing';
  end if;

  if event_name = 'widget_failed_to_sync_user_external_id' then
    if link.status in ('REVIEW', 'ACTIVE') then
      return 'idempotent';
    end if;
    failure_reason := case event_data->>'message'
      when 'user already has user_external_id' then 'external_id_already_set'
      when 'user_externa_id already belongs to another user' then 'external_id_owned_elsewhere'
      when 'user_external_id already belongs to another user' then 'external_id_owned_elsewhere'
      else 'external_id_sync_failed'
    end;
    update public.customer_channel_links
    set status = 'REVIEW'
    where id = link.id
      and status = 'PENDING';
    perform set_config('registration.write', 'on', true);
    insert into public.registration_application_events(
      id, application_id, event_type, actor_id, metadata
    ) values (
      gen_random_uuid(), link.registration_application_id, 'ZALO_LINK_FAILED', null,
      jsonb_build_object('reason', failure_reason)
    );
    return 'review';
  end if;

  if link.status = 'ACTIVE' and link.provider_user_id = zalo_user_id then
    update public.customer_channel_links
    set last_verified_at = clock_timestamp()
    where id = link.id;
    return 'idempotent';
  end if;
  if link.status = 'ACTIVE' then
    return 'review';
  end if;

  select * into conflict
  from public.customer_channel_links
  where provider = 'ZALO'
    and provider_user_id = zalo_user_id
    and status <> 'REVOKED'
    and id <> link.id;
  if found then
    if link.status = 'REVIEW' then
      return 'idempotent';
    end if;
    update public.customer_channel_links
    set status = 'REVIEW'
    where id = link.id
      and status = 'PENDING';
    perform set_config('registration.write', 'on', true);
    insert into public.registration_application_events(
      id, application_id, event_type, actor_id, metadata
    ) values (
      gen_random_uuid(), link.registration_application_id, 'ZALO_LINK_FAILED', null,
      jsonb_build_object('reason', 'provider_user_conflict')
    );
    return 'review';
  end if;

  if event_timestamp ~ '^\d{10,16}$' then
    event_consent := to_timestamp(event_timestamp::numeric / 1000.0);
  else
    event_consent := clock_timestamp();
  end if;

  update public.customer_channel_links
  set provider_user_id = zalo_user_id,
      status = 'ACTIVE',
      consent_at = event_consent,
      linked_at = clock_timestamp(),
      last_verified_at = clock_timestamp()
  where id = link.id
    and status in ('PENDING', 'REVIEW');
  if not found then
    return 'idempotent';
  end if;

  perform set_config('registration.write', 'on', true);
  insert into public.registration_application_events(
    id, application_id, event_type, actor_id, metadata
  ) values (
    gen_random_uuid(), link.registration_application_id, 'ZALO_LINK_CONFIRMED', null, '{}'::jsonb
  );
  return 'activated';
exception
  when unique_violation then
    update public.customer_channel_links
    set status = 'REVIEW',
        provider_user_id = null,
        linked_at = null,
        consent_at = null
    where id = link.id
      and status in ('PENDING', 'REVIEW');
    return 'review';
end;
$$;

revoke all on function public.request_registration_zalo_link(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.registration_zalo_connection(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_zalo_interaction_event(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.request_registration_zalo_link(uuid) to authenticated;
grant execute on function public.registration_zalo_connection(uuid) to authenticated;
grant execute on function public.apply_zalo_interaction_event(jsonb) to service_role;
