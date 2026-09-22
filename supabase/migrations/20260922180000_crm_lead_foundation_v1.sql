-- Sprint 2 CRM lead foundation.
-- Additive. No campaign, conversion, reactivation, or instrument-buyer behavior.
-- Students, parents, profiles, retention alerts, credits, instrument events, and invoices are unchanged.

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'CRM_LEAD_V1_REQUIRES_POSTGRES';
  end if;
  if to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.has_role(text)') is null
     or to_regprocedure('public.has_permission(text,uuid)') is null
     or to_regclass('public.branches') is null
     or to_regclass('public.permissions') is null
     or to_regclass('public.role_permissions') is null
     or to_regclass('public.user_roles') is null
     or to_regclass('public.profiles') is null
  then
    raise exception 'CRM_LEAD_V1_PREREQUISITE_MISSING';
  end if;
  if to_regclass('public.crm_leads') is not null
     or to_regclass('public.crm_lead_events') is not null
     or to_regprocedure('public.create_crm_lead(uuid,uuid,text,text,text,text,text,date,text,text,text,uuid)') is not null
  then
    raise exception 'CRM_LEAD_V1_ALREADY_EXISTS';
  end if;
end;
$preflight$;

insert into public.permissions(code, name, module)
values
  ('crm.view', 'View CRM leads in an authorized branch', 'crm'),
  ('crm.lead.create', 'Create a CRM lead in an authorized branch', 'crm'),
  ('crm.lead.update', 'Update a CRM lead and its pipeline in an authorized branch', 'crm'),
  ('crm.lead.assign', 'Assign a CRM lead owner in an authorized branch', 'crm')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('crm.view', 'crm.lead.create', 'crm.lead.update', 'crm.lead.assign')
where r.code = 'BRANCH_ADMIN'
on conflict do nothing;

create function public.crm_phone_key(p_phone text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '')
$$;

create function public.crm_email_key(p_email text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(lower(btrim(coalesce(p_email, ''))), '')
$$;

create function public.crm_can(p_permission text, p_branch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.account_is_active()
    and p_branch is not null
    and exists(select 1 from public.branches where id = p_branch)
    and (
      public.has_role('SUPER_ADMIN')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where ur.user_id = auth.uid()
          and r.code <> 'SUPER_ADMIN'
          and ur.branch_id = p_branch
          and ur.is_active
          and (ur.valid_from is null or ur.valid_from <= now())
          and (ur.valid_until is null or ur.valid_until > now())
          and p.code = p_permission
      )
    )
$$;

create table public.crm_leads (
  id uuid primary key,
  branch_id uuid not null references public.branches(id),
  status text not null default 'NEW' check (status in (
    'NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED',
    'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST'
  )),
  full_name text check (full_name is null or char_length(full_name) between 1 and 200),
  phone text check (phone is null or char_length(phone) between 1 and 40),
  email text check (email is null or char_length(email) between 1 and 200),
  phone_key text check (phone_key is null or phone_key ~ '^[0-9]{6,20}$'),
  email_key text check (email_key is null or email_key ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  parent_name text check (parent_name is null or char_length(parent_name) between 1 and 200),
  student_name text check (student_name is null or char_length(student_name) between 1 and 200),
  student_date_of_birth date check (student_date_of_birth is null or isfinite(student_date_of_birth)),
  program_interest text check (program_interest is null or char_length(program_interest) between 1 and 200),
  instrument_interest text check (instrument_interest is null or char_length(instrument_interest) between 1 and 200),
  source_type text not null check (source_type in ('MANUAL', 'WALK_IN', 'REFERRAL', 'WEBSITE', 'ZALO', 'PHONE', 'OTHER')),
  owner_user_id uuid references auth.users(id),
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  next_follow_up_on date check (next_follow_up_on is null or isfinite(next_follow_up_on)),
  lost_reason text check (lost_reason is null or char_length(lost_reason) between 1 and 2000),
  converted_at timestamptz,
  converted_student_id uuid references public.students(id),
  converted_parent_id uuid references public.parents(id),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    full_name is not null or phone_key is not null or email_key is not null
    or parent_name is not null or student_name is not null
  ),
  check (status <> 'LOST' or lost_reason is not null),
  check (
    (converted_at is null and converted_student_id is null and converted_parent_id is null)
    or (converted_at is not null and (converted_student_id is not null or converted_parent_id is not null))
  ),
  check ((phone is null) = (phone_key is null)),
  check ((email is null) = (email_key is null))
);

create index crm_leads_branch_status_idx on public.crm_leads(branch_id, status, created_at desc, id);
create index crm_leads_owner_idx on public.crm_leads(owner_user_id, status) where owner_user_id is not null;
create index crm_leads_follow_up_idx on public.crm_leads(next_follow_up_on, id) where next_follow_up_on is not null;
create index crm_leads_phone_key_idx on public.crm_leads(phone_key) where phone_key is not null;
create index crm_leads_email_key_idx on public.crm_leads(email_key) where email_key is not null;

create table public.crm_lead_events (
  id uuid primary key,
  lead_id uuid not null references public.crm_leads(id),
  event_type text not null check (event_type in (
    'CREATED', 'UPDATED', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED',
    'TRIAL_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATION_UPDATED', 'WON', 'LOST',
    'NOTE_ADDED', 'FOLLOW_UP_SET'
  )),
  from_status text,
  to_status text,
  actor_id uuid not null references auth.users(id),
  channel text check (channel is null or channel in ('PHONE', 'ZALO', 'SMS', 'EMAIL', 'IN_PERSON', 'OTHER')),
  note text check (note is null or char_length(note) between 1 and 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index crm_lead_events_lead_idx on public.crm_lead_events(lead_id, created_at desc, id);

create function public.guard_crm_lead_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('crm.lead_write', true), '') <> 'on' then
    raise exception 'CRM_LEAD_DIRECT_WRITE_DENIED';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger crm_leads_write_guard
before insert or update or delete on public.crm_leads
for each row execute function public.guard_crm_lead_write();

create function public.guard_crm_lead_event_history() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'CRM_LEAD_EVENT_IMMUTABLE';
end $$;

create trigger crm_lead_events_immutable
before update or delete on public.crm_lead_events
for each row execute function public.guard_crm_lead_event_history();

alter table public.crm_leads enable row level security;
alter table public.crm_lead_events enable row level security;

create policy crm_leads_select on public.crm_leads
for select to authenticated
using (public.crm_can('crm.view', branch_id));

create policy crm_lead_events_select on public.crm_lead_events
for select to authenticated
using (
  exists (
    select 1 from public.crm_leads lead
    where lead.id = crm_lead_events.lead_id
      and public.crm_can('crm.view', lead.branch_id)
  )
);

revoke all on public.crm_leads from public, anon, authenticated, service_role;
revoke all on public.crm_lead_events from public, anon, authenticated, service_role;
grant select on public.crm_leads to authenticated;
grant select on public.crm_lead_events to authenticated;

create function public.crm_actor(p_permission text, p_branch uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null
     or not coalesce(public.account_is_active(), false)
     or not coalesce(public.crm_can(p_permission, p_branch), false)
  then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  return actor;
end $$;

create function public.crm_text(p_value text, p_limit integer) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  cleaned text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if cleaned is not null and char_length(cleaned) > p_limit then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  return cleaned;
end $$;

create function public.crm_channel(p_channel text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  cleaned text := nullif(upper(btrim(coalesce(p_channel, ''))), '');
begin
  if cleaned is not null and cleaned not in ('PHONE', 'ZALO', 'SMS', 'EMAIL', 'IN_PERSON', 'OTHER') then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  return cleaned;
end $$;

create function public.create_crm_lead(
  p_request uuid,
  p_branch uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_parent_name text,
  p_student_name text,
  p_student_date_of_birth date,
  p_program_interest text,
  p_instrument_interest text,
  p_source_type text,
  p_owner uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid;
  existing public.crm_leads%rowtype;
  source text := coalesce(nullif(upper(btrim(coalesce(p_source_type, ''))), ''), 'MANUAL');
  name text := public.crm_text(p_full_name, 200);
  phone text := public.crm_text(p_phone, 40);
  email text := public.crm_text(p_email, 200);
  parent_name text := public.crm_text(p_parent_name, 200);
  student_name text := public.crm_text(p_student_name, 200);
  program text := public.crm_text(p_program_interest, 200);
  instrument text := public.crm_text(p_instrument_interest, 200);
  phone_key text := public.crm_phone_key(phone);
  email_key text := public.crm_email_key(email);
  owner uuid := coalesce(p_owner, auth.uid());
begin
  if p_request is null or source not in ('MANUAL', 'WALK_IN', 'REFERRAL', 'WEBSITE', 'ZALO', 'PHONE', 'OTHER') then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if p_student_date_of_birth is not null and not isfinite(p_student_date_of_birth) then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if email_key is not null and email_key !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if phone is not null and (phone_key is null or phone_key !~ '^[0-9]{6,20}$') then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if name is null and phone_key is null and email_key is null and parent_name is null and student_name is null then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  actor := public.crm_actor('crm.lead.create', p_branch);
  if owner is distinct from actor then
    perform public.crm_actor('crm.lead.assign', p_branch);
  end if;
  if not exists(select 1 from public.profiles where id = owner and status = 'ACTIVE') then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('crm-lead-request:' || p_request::text, 0));
  select * into existing from public.crm_leads where id = p_request;
  if found then
    if existing.created_by is distinct from actor
       or existing.branch_id is distinct from p_branch
       or existing.full_name is distinct from name
       or existing.phone is distinct from phone
       or existing.email is distinct from email
       or existing.parent_name is distinct from parent_name
       or existing.student_name is distinct from student_name
       or existing.student_date_of_birth is distinct from p_student_date_of_birth
       or existing.program_interest is distinct from program
       or existing.instrument_interest is distinct from instrument
       or existing.source_type is distinct from source
       or existing.owner_user_id is distinct from owner
    then
      raise exception 'CRM_LEAD_REQUEST_MISMATCH';
    end if;
    return existing.id;
  end if;
  perform set_config('crm.lead_write', 'on', true);
  insert into public.crm_leads(
    id, branch_id, full_name, phone, email, phone_key, email_key, parent_name, student_name,
    student_date_of_birth, program_interest, instrument_interest, source_type, owner_user_id, created_by
  ) values (
    p_request, p_branch, name, phone, email, phone_key, email_key, parent_name, student_name,
    p_student_date_of_birth, program, instrument, source, owner, actor
  );
  insert into public.crm_lead_events(id, lead_id, event_type, to_status, actor_id, metadata)
  values (
    gen_random_uuid(), p_request, 'CREATED', 'NEW', actor,
    jsonb_build_object('owner_user_id', owner, 'source_type', source)
  );
  perform set_config('crm.lead_write', 'off', true);
  return p_request;
end $$;

create function public.crm_lead_lock(p_lead uuid, p_version integer, p_permission text)
returns public.crm_leads
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_leads%rowtype;
begin
  select * into row from public.crm_leads where id = p_lead for update;
  if not found then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  perform public.crm_actor(p_permission, row.branch_id);
  if row.version is distinct from p_version then
    raise exception 'CRM_LEAD_STALE';
  end if;
  return row;
end $$;

create function public.crm_lead_replay(
  p_request uuid,
  p_lead uuid,
  p_event text,
  p_actor uuid,
  p_note text,
  p_channel text,
  p_metadata jsonb,
  p_permission text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.crm_lead_events%rowtype;
  branch uuid;
begin
  if p_request is null then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('crm-lead-request:' || p_request::text, 0));
  select * into existing from public.crm_lead_events where id = p_request;
  if not found then
    return false;
  end if;
  select lead.branch_id into branch from public.crm_leads lead where lead.id = existing.lead_id;
  if branch is null then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  perform public.crm_actor(p_permission, branch);
  if existing.lead_id is distinct from p_lead
     or existing.event_type is distinct from p_event
     or existing.actor_id is distinct from p_actor
     or existing.note is distinct from p_note
     or existing.channel is distinct from p_channel
     or existing.metadata is distinct from p_metadata
  then
    raise exception 'CRM_LEAD_REQUEST_MISMATCH';
  end if;
  return true;
end $$;

create function public.update_crm_lead(
  p_request uuid,
  p_lead uuid,
  p_version integer,
  p_full_name text,
  p_phone text,
  p_email text,
  p_parent_name text,
  p_student_name text,
  p_student_date_of_birth date,
  p_program_interest text,
  p_instrument_interest text,
  p_source_type text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  row public.crm_leads%rowtype;
  actor uuid := auth.uid();
  source text := coalesce(nullif(upper(btrim(coalesce(p_source_type, ''))), ''), 'MANUAL');
  name text := public.crm_text(p_full_name, 200);
  phone text := public.crm_text(p_phone, 40);
  email text := public.crm_text(p_email, 200);
  parent_name text := public.crm_text(p_parent_name, 200);
  student_name text := public.crm_text(p_student_name, 200);
  program text := public.crm_text(p_program_interest, 200);
  instrument text := public.crm_text(p_instrument_interest, 200);
  phone_key text := public.crm_phone_key(phone);
  email_key text := public.crm_email_key(email);
  meta jsonb;
begin
  if actor is null or not coalesce(public.account_is_active(), false) then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  if source not in ('MANUAL', 'WALK_IN', 'REFERRAL', 'WEBSITE', 'ZALO', 'PHONE', 'OTHER')
     or (p_student_date_of_birth is not null and not isfinite(p_student_date_of_birth))
     or (email_key is not null and email_key !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
     or (phone is not null and (phone_key is null or phone_key !~ '^[0-9]{6,20}$'))
     or (name is null and phone_key is null and email_key is null and parent_name is null and student_name is null)
  then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  meta := jsonb_build_object(
    'full_name', name, 'phone', phone, 'email', email, 'parent_name', parent_name,
    'student_name', student_name, 'student_date_of_birth', p_student_date_of_birth,
    'program_interest', program, 'instrument_interest', instrument, 'source_type', source
  );
  if public.crm_lead_replay(p_request, p_lead, 'UPDATED', actor, null, null, meta, 'crm.lead.update') then
    return p_lead;
  end if;
  row := public.crm_lead_lock(p_lead, p_version, 'crm.lead.update');
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_leads set
    full_name = name, phone = phone, email = email, phone_key = phone_key, email_key = email_key,
    parent_name = parent_name, student_name = student_name, student_date_of_birth = p_student_date_of_birth,
    program_interest = program, instrument_interest = instrument, source_type = source,
    version = version + 1, updated_at = clock_timestamp()
  where id = row.id;
  insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, metadata)
  values (p_request, row.id, 'UPDATED', row.status, row.status, actor, meta);
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

create function public.assign_crm_lead(
  p_request uuid,
  p_lead uuid,
  p_version integer,
  p_owner uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_leads%rowtype;
  actor uuid := auth.uid();
  reason text := public.crm_text(p_reason, 2000);
  existing public.crm_lead_events%rowtype;
  branch uuid;
  meta jsonb;
begin
  if actor is null or not coalesce(public.account_is_active(), false) then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  if p_request is null or p_owner is null or reason is null
     or not exists(select 1 from public.profiles where id = p_owner and status = 'ACTIVE')
  then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('crm-lead-request:' || p_request::text, 0));
  select * into existing from public.crm_lead_events where id = p_request;
  if found then
    select lead.branch_id into branch from public.crm_leads lead where lead.id = existing.lead_id;
    if branch is null then
      raise exception 'CRM_LEAD_UNAUTHORIZED';
    end if;
    perform public.crm_actor('crm.lead.assign', branch);
    if existing.lead_id is distinct from p_lead
       or existing.event_type is distinct from 'ASSIGNED'
       or existing.actor_id is distinct from actor
       or existing.note is distinct from reason
       or existing.metadata->>'to_owner' is distinct from p_owner::text
    then
      raise exception 'CRM_LEAD_REQUEST_MISMATCH';
    end if;
    return p_lead;
  end if;
  row := public.crm_lead_lock(p_lead, p_version, 'crm.lead.assign');
  meta := jsonb_build_object('from_owner', row.owner_user_id, 'to_owner', p_owner);
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_leads set
    owner_user_id = p_owner, version = version + 1, updated_at = clock_timestamp()
  where id = row.id;
  insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, note, metadata)
  values (p_request, row.id, 'ASSIGNED', row.status, row.status, actor, reason, meta);
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

create function public.transition_crm_lead(
  p_request uuid,
  p_lead uuid,
  p_version integer,
  p_to_status text,
  p_note text,
  p_channel text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_leads%rowtype;
  actor uuid := auth.uid();
  target text := nullif(upper(btrim(coalesce(p_to_status, ''))), '');
  note text := public.crm_text(p_note, 4000);
  channel text := public.crm_channel(p_channel);
  event_type text;
  meta jsonb := '{}'::jsonb;
begin
  if actor is null or not coalesce(public.account_is_active(), false) then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  if target is null or target not in (
    'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATING', 'WON', 'LOST'
  ) then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if target = 'LOST' and note is null then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  event_type := case target when 'NEGOTIATING' then 'NEGOTIATION_UPDATED' else target end;
  if public.crm_lead_replay(p_request, p_lead, event_type, actor, note, channel, meta, 'crm.lead.update') then
    return p_lead;
  end if;
  row := public.crm_lead_lock(p_lead, p_version, 'crm.lead.update');
  if not (
    (row.status = 'NEW' and target in ('CONTACTED', 'LOST'))
    or (row.status = 'CONTACTED' and target in ('QUALIFIED', 'LOST'))
    or (row.status = 'QUALIFIED' and target in ('TRIAL_BOOKED', 'LOST'))
    or (row.status = 'TRIAL_BOOKED' and target in ('TRIAL_COMPLETED', 'LOST'))
    or (row.status = 'TRIAL_COMPLETED' and target in ('PROPOSAL_SENT', 'LOST'))
    or (row.status = 'PROPOSAL_SENT' and target in ('NEGOTIATING', 'LOST'))
    or (row.status = 'NEGOTIATING' and target in ('WON', 'LOST'))
  ) then
    raise exception 'CRM_LEAD_TRANSITION_DENIED';
  end if;
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_leads set
    status = target,
    lost_reason = case when target = 'LOST' then note else lost_reason end,
    first_contact_at = coalesce(first_contact_at, clock_timestamp()),
    last_contact_at = clock_timestamp(),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, channel, note, metadata)
  values (p_request, row.id, event_type, row.status, target, actor, channel, note, meta);
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

create function public.add_crm_lead_note(
  p_request uuid,
  p_lead uuid,
  p_version integer,
  p_note text,
  p_channel text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_leads%rowtype;
  actor uuid := auth.uid();
  note text := public.crm_text(p_note, 4000);
  channel text := public.crm_channel(p_channel);
begin
  if actor is null or not coalesce(public.account_is_active(), false) then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  if note is null then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  if public.crm_lead_replay(p_request, p_lead, 'NOTE_ADDED', actor, note, channel, '{}'::jsonb, 'crm.lead.update') then
    return p_lead;
  end if;
  row := public.crm_lead_lock(p_lead, p_version, 'crm.lead.update');
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_leads set
    first_contact_at = coalesce(first_contact_at, clock_timestamp()),
    last_contact_at = clock_timestamp(),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, channel, note)
  values (p_request, row.id, 'NOTE_ADDED', row.status, row.status, actor, channel, note);
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

create function public.set_crm_lead_follow_up(
  p_request uuid,
  p_lead uuid,
  p_version integer,
  p_follow_up_on date,
  p_note text,
  p_channel text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_leads%rowtype;
  actor uuid := auth.uid();
  note text := public.crm_text(p_note, 4000);
  channel text := public.crm_channel(p_channel);
  meta jsonb;
begin
  if actor is null or not coalesce(public.account_is_active(), false) then
    raise exception 'CRM_LEAD_UNAUTHORIZED';
  end if;
  if p_follow_up_on is null or not isfinite(p_follow_up_on) then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  meta := jsonb_build_object('next_follow_up_on', p_follow_up_on);
  if public.crm_lead_replay(p_request, p_lead, 'FOLLOW_UP_SET', actor, note, channel, meta, 'crm.lead.update') then
    return p_lead;
  end if;
  row := public.crm_lead_lock(p_lead, p_version, 'crm.lead.update');
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_leads set
    next_follow_up_on = p_follow_up_on,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, channel, note, metadata)
  values (p_request, row.id, 'FOLLOW_UP_SET', row.status, row.status, actor, channel, note, meta);
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

revoke all on function
  public.crm_phone_key(text),
  public.crm_email_key(text),
  public.crm_can(text, uuid),
  public.crm_actor(text, uuid),
  public.crm_text(text, integer),
  public.crm_channel(text),
  public.crm_lead_lock(uuid, integer, text),
  public.crm_lead_replay(uuid, uuid, text, uuid, text, text, jsonb, text),
  public.guard_crm_lead_write(),
  public.guard_crm_lead_event_history(),
  public.create_crm_lead(uuid, uuid, text, text, text, text, text, date, text, text, text, uuid),
  public.update_crm_lead(uuid, uuid, integer, text, text, text, text, text, date, text, text, text),
  public.assign_crm_lead(uuid, uuid, integer, uuid, text),
  public.transition_crm_lead(uuid, uuid, integer, text, text, text),
  public.add_crm_lead_note(uuid, uuid, integer, text, text),
  public.set_crm_lead_follow_up(uuid, uuid, integer, date, text, text)
from public, anon, authenticated, service_role;

grant execute on function public.crm_can(text, uuid) to authenticated;
grant execute on function public.create_crm_lead(uuid, uuid, text, text, text, text, text, date, text, text, text, uuid) to authenticated;
grant execute on function public.update_crm_lead(uuid, uuid, integer, text, text, text, text, text, date, text, text, text) to authenticated;
grant execute on function public.assign_crm_lead(uuid, uuid, integer, uuid, text) to authenticated;
grant execute on function public.transition_crm_lead(uuid, uuid, integer, text, text, text) to authenticated;
grant execute on function public.add_crm_lead_note(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.set_crm_lead_follow_up(uuid, uuid, integer, date, text, text) to authenticated;

comment on table public.crm_leads is
  'Prospective CRM household. Not a student, parent, or instrument buyer. Conversion columns stay empty until a later sprint.';
