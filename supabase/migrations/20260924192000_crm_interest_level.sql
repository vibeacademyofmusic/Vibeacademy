-- Lead strength is independent of the sales workflow status.
alter table public.crm_leads add column interest_level text not null default 'REFERENCE'
  check (interest_level in ('REFERENCE', 'INTERESTED', 'POTENTIAL'));

alter table public.crm_lead_events drop constraint crm_lead_events_event_type_check;
alter table public.crm_lead_events add constraint crm_lead_events_event_type_check
  check (event_type in (
    'CREATED', 'UPDATED', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED',
    'TRIAL_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATION_UPDATED', 'WON', 'LOST',
    'NOTE_ADDED', 'FOLLOW_UP_SET', 'CONVERSION_REVIEWED', 'CONVERTED',
    'INTEREST_LEVEL_SET'
  ));

create function public.create_crm_lead_with_interest(
  p_request uuid, p_branch uuid, p_full_name text, p_phone text, p_email text,
  p_parent_name text, p_student_name text, p_student_date_of_birth date,
  p_program_interest text, p_instrument_interest text, p_source_type text,
  p_owner uuid, p_interest_level text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lead uuid;
  v_interest text := upper(btrim(coalesce(p_interest_level, '')));
  existing_interest text;
begin
  if v_interest not in ('REFERENCE', 'INTERESTED', 'POTENTIAL') then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  select interest_level into existing_interest from public.crm_leads where id = p_request;
  if existing_interest is not null and existing_interest <> v_interest then
    raise exception 'CRM_LEAD_REQUEST_MISMATCH';
  end if;
  v_lead := public.create_crm_lead(
    p_request, p_branch, p_full_name, p_phone, p_email, p_parent_name,
    p_student_name, p_student_date_of_birth, p_program_interest,
    p_instrument_interest, p_source_type, p_owner
  );
  if existing_interest is null and v_interest <> 'REFERENCE' then
    perform set_config('crm.lead_write', 'on', true);
    update public.crm_leads set interest_level = v_interest, version = version + 1,
      updated_at = clock_timestamp() where id = v_lead;
    insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, metadata)
    values (gen_random_uuid(), v_lead, 'INTEREST_LEVEL_SET', 'NEW', 'NEW', auth.uid(),
      jsonb_build_object('from', 'REFERENCE', 'to', v_interest));
    perform set_config('crm.lead_write', 'off', true);
  end if;
  return v_lead;
end $$;

create function public.set_crm_lead_interest(
  p_request uuid, p_lead uuid, p_version integer, p_interest_level text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.crm_leads%rowtype;
  v_interest text := upper(btrim(coalesce(p_interest_level, '')));
  v_actor uuid := auth.uid();
  v_meta jsonb;
begin
  if v_interest not in ('REFERENCE', 'INTERESTED', 'POTENTIAL') then
    raise exception 'CRM_LEAD_INVALID';
  end if;
  v_meta := jsonb_build_object('to', v_interest);
  if public.crm_lead_replay(p_request, p_lead, 'INTEREST_LEVEL_SET', v_actor,
    null, null, v_meta, 'crm.lead.update') then return p_lead; end if;
  row := public.crm_lead_lock(p_lead, p_version, 'crm.lead.update');
  perform set_config('crm.lead_write', 'on', true);
  update public.crm_leads set interest_level = v_interest, version = version + 1,
    updated_at = clock_timestamp() where id = row.id;
  insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, metadata)
  values (p_request, row.id, 'INTEREST_LEVEL_SET', row.status, row.status, v_actor, v_meta);
  perform set_config('crm.lead_write', 'off', true);
  return row.id;
end $$;

revoke all on function public.create_crm_lead_with_interest(uuid, uuid, text, text, text, text, text, date, text, text, text, uuid, text),
  public.set_crm_lead_interest(uuid, uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.create_crm_lead_with_interest(uuid, uuid, text, text, text, text, text, date, text, text, text, uuid, text),
  public.set_crm_lead_interest(uuid, uuid, integer, text) to authenticated;
