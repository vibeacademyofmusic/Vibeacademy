-- CRM wishes are distinct from confirmed teaching shifts. Existing free text is retained.
alter table public.crm_leads
  add column desired_start_date date,
  add column preferred_slots jsonb not null default '[]'::jsonb,
  add column preferred_sessions_per_week integer,
  add column schedule_note text,
  add constraint crm_leads_sessions_check check (preferred_sessions_per_week between 1 and 7),
  add constraint crm_leads_schedule_note_check check (schedule_note is null or char_length(schedule_note) <= 500);

alter table public.registration_applications
  add column preferred_slots jsonb not null default '[]'::jsonb,
  add column preferred_sessions_per_week integer,
  add column schedule_note text;

alter table public.student_placement_cases
  add column preferred_slots jsonb not null default '[]'::jsonb,
  add column preferred_sessions_per_week integer,
  add column schedule_note text;

create function public.crm_validate_slots(p_slots jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  slot jsonb;
  other_slot jsonb;
  weekday integer;
  start_time time;
  end_time time;
  slot_index bigint;
  other_index bigint;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then return false; end if;
  if jsonb_array_length(p_slots) > 14 then return false; end if;
  for slot, slot_index in select value, ordinality from jsonb_array_elements(p_slots) with ordinality loop
    if jsonb_typeof(slot) <> 'object' or coalesce(slot->>'weekday','') !~ '^[1-7]$'
       or coalesce(slot->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(slot->>'end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    weekday := (slot->>'weekday')::integer;
    start_time := (slot->>'start')::time;
    end_time := (slot->>'end')::time;
    if end_time <= start_time then return false; end if;
  end loop;
  for slot, slot_index in select value, ordinality from jsonb_array_elements(p_slots) with ordinality loop
    weekday := (slot->>'weekday')::integer;
    start_time := (slot->>'start')::time;
    end_time := (slot->>'end')::time;
    for other_slot, other_index in select value, ordinality from jsonb_array_elements(p_slots) with ordinality loop
      if other_index <> slot_index and (other_slot->>'weekday')::integer = weekday
         and (other_slot->>'start')::time < end_time
         and (other_slot->>'end')::time > start_time then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

alter table public.crm_leads add constraint crm_leads_slots_check check (public.crm_validate_slots(preferred_slots));
alter table public.registration_applications add constraint registration_slots_check check (public.crm_validate_slots(preferred_slots));
alter table public.student_placement_cases add constraint placement_slots_check check (public.crm_validate_slots(preferred_slots));

create function public.crm_slots_summary(p_slots jsonb, p_note text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select nullif(left(concat_ws(' · ',
    (select string_agg(case when value->>'weekday' = '7' then 'CN' else 'Thứ ' || ((value->>'weekday')::integer + 1)::text end
      || ' ' || (value->>'start') || '–' || (value->>'end'), '; ' order by ordinality)
      from jsonb_array_elements(p_slots) with ordinality), nullif(btrim(p_note), '')), 500), '')
$$;

-- A transaction-level lock precedes every replay check, including interest and schedule.
create function public.create_crm_lead_with_schedule(
  p_request uuid, p_branch uuid, p_full_name text, p_phone text, p_email text,
  p_parent_name text, p_student_name text, p_student_date_of_birth date,
  p_program_interest text, p_source_type text, p_interest_level text,
  p_desired_start date, p_preferred_slots jsonb, p_preferred_sessions_per_week integer,
  p_schedule_note text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.crm_leads%rowtype;
  v_id uuid;
  v_interest text := upper(btrim(coalesce(p_interest_level, '')));
  v_slots jsonb := coalesce(p_preferred_slots, '[]'::jsonb);
  v_note text := nullif(btrim(coalesce(p_schedule_note, '')), '');
begin
  if p_request is null or v_interest not in ('REFERENCE', 'INTERESTED', 'POTENTIAL')
     or not public.crm_validate_slots(v_slots)
     or (p_desired_start is not null and not isfinite(p_desired_start))
     or (p_preferred_sessions_per_week is not null and p_preferred_sessions_per_week not between 1 and 7)
     or char_length(v_note) > 500 then raise exception 'CRM_LEAD_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm-lead-request:' || p_request::text, 0));
  select * into existing from public.crm_leads where id = p_request;
  v_id := public.create_crm_lead(p_request, p_branch, p_full_name, p_phone, p_email,
    p_parent_name, p_student_name, p_student_date_of_birth, p_program_interest,
    null, p_source_type, null);
  if existing.id is not null then
    if existing.interest_level is distinct from v_interest
       or existing.desired_start_date is distinct from p_desired_start
       or existing.preferred_slots is distinct from v_slots
       or existing.preferred_sessions_per_week is distinct from p_preferred_sessions_per_week
       or existing.schedule_note is distinct from v_note then
      raise exception 'CRM_LEAD_REQUEST_MISMATCH';
    end if;
    return v_id;
  end if;
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_leads set interest_level = v_interest,
    version = version + case when v_interest <> 'REFERENCE' then 1 else 0 end,
    desired_start_date = p_desired_start, preferred_slots = v_slots,
    preferred_sessions_per_week = p_preferred_sessions_per_week,
    schedule_note = v_note where id = v_id;
  if v_interest <> 'REFERENCE' then
    insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, metadata)
    values (gen_random_uuid(), v_id, 'INTEREST_LEVEL_SET', 'NEW', 'NEW', auth.uid(),
      jsonb_build_object('from', 'REFERENCE', 'to', v_interest));
  end if;
  perform set_config('crm.lead_write', 'off', true);
  return v_id;
end $$;

create function public.registration_copy_crm_wishes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare lead public.crm_leads%rowtype;
begin
  if new.crm_lead_id is null then return new; end if;
  select * into lead from public.crm_leads where id = new.crm_lead_id;
  if not found then return new; end if;
  new.preferred_slots := lead.preferred_slots;
  new.preferred_sessions_per_week := lead.preferred_sessions_per_week;
  new.schedule_note := lead.schedule_note;
  new.desired_start_date := coalesce(new.desired_start_date, lead.desired_start_date);
  new.preferred_schedule := coalesce(new.preferred_schedule,
    public.crm_slots_summary(lead.preferred_slots, lead.schedule_note));
  return new;
end $$;

create trigger registration_copy_crm_wishes before insert on public.registration_applications
for each row execute function public.registration_copy_crm_wishes();

create function public.placement_copy_registration_wishes() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
begin
  select * into app from public.registration_applications where id = new.registration_application_id;
  if not found then return new; end if;
  new.preferred_slots := app.preferred_slots;
  new.preferred_sessions_per_week := app.preferred_sessions_per_week;
  new.schedule_note := app.schedule_note;
  new.desired_start_date := coalesce(new.desired_start_date, app.desired_start_date);
  new.preferred_schedule := coalesce(new.preferred_schedule, app.preferred_schedule);
  return new;
end $$;

create trigger placement_copy_registration_wishes before insert on public.student_placement_cases
for each row execute function public.placement_copy_registration_wishes();

revoke all on function public.create_crm_lead_with_schedule(uuid,uuid,text,text,text,text,text,date,text,text,text,date,jsonb,integer,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_crm_lead_with_schedule(uuid,uuid,text,text,text,text,text,date,text,text,text,date,jsonb,integer,text)
  to authenticated;
revoke all on function public.crm_validate_slots(jsonb), public.crm_slots_summary(jsonb,text),
  public.registration_copy_crm_wishes(), public.placement_copy_registration_wishes()
  from public, anon, authenticated, service_role;
