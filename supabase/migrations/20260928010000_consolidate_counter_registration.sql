-- Local consolidation batch 1. Forward-only; preserves historical rows and main placement RPCs.
-- Sources reviewed: student code, CRM interest, academic selection in CRM reference.
-- Rollback: revert UI first; retain added columns/codes and historical rows. Do not drop populated objects.
-- Applied once by the migration ledger; trigger replacement is safe on a controlled retry.

-- Reviewed source: 20260924190000_student_code_sequence.sql
-- One academy-wide counter. Existing student codes remain unchanged.
create sequence if not exists public.student_code_number_seq as bigint;

do $$
declare
  highest bigint;
begin
  select max(substring(student_code from '^VIBE-([0-9]+)$')::bigint)
    into highest
    from public.students
   where student_code ~ '^VIBE-[0-9]+$';
  if highest is null then
    if not (select is_called from public.student_code_number_seq) then
      perform setval('public.student_code_number_seq', 1, false);
    end if;
  else
    perform setval('public.student_code_number_seq', greatest(highest, (select last_value from public.student_code_number_seq)), true);
  end if;
end $$;

create or replace function public.assign_student_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Blank values and the old registration UUID shorthand use the shared counter.
  -- Preserve explicit historical/import identifiers during data migration.
  if nullif(btrim(coalesce(new.student_code, '')), '') is null
     or new.student_code ~ '^HV-[0-9a-f]{8}$' then
    new.student_code := 'VIBE-' || lpad(nextval('public.student_code_number_seq')::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists assign_student_code_on_insert on public.students;
create trigger assign_student_code_on_insert
before insert on public.students
for each row execute function public.assign_student_code();

create or replace function public.keep_student_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.student_code := old.student_code;
  return new;
end $$;

drop trigger if exists keep_student_code_on_update on public.students;
create trigger keep_student_code_on_update
before update on public.students
for each row execute function public.keep_student_code();

comment on sequence public.student_code_number_seq is
  'Academy-wide student number; gaps after rolled-back transactions are expected.';

-- Reviewed source: 20260924192000_crm_interest_level.sql
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

-- Reviewed source: 20260924193000_registration_academic_selection.sql
-- Keep the selected academic path with the application and the waiting placement.
alter table public.registration_applications
  add column curriculum_id uuid references public.curriculums(id),
  add column level_id uuid references public.curriculum_levels(id),
  add column subject_id uuid references public.curriculum_subjects(id);

alter table public.student_placement_cases
  add column curriculum_id uuid references public.curriculums(id),
  add column level_id uuid references public.curriculum_levels(id),
  add column subject_id uuid references public.curriculum_subjects(id);

create function public.registration_academic_selection_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.curriculum_id is null and new.level_id is null and new.subject_id is null then
    return new; -- Historical applications remain readable.
  end if;
  if new.curriculum_id is null or new.level_id is null or new.subject_id is null
     or not exists (select 1 from public.curriculums where id = new.curriculum_id and status = 'ACTIVE')
     or not exists (select 1 from public.curriculum_levels where id = new.level_id and curriculum_id = new.curriculum_id and status = 'ACTIVE')
     or not exists (select 1 from public.curriculum_subjects where id = new.subject_id and level_id = new.level_id and status = 'ACTIVE') then
    raise exception 'REGISTRATION_ACADEMIC_SELECTION_INVALID';
  end if;
  return new;
end $$;

create trigger registration_academic_selection_guard
before insert or update on public.registration_applications
for each row execute function public.registration_academic_selection_guard();

create function public.create_registration_application_with_academics(
  p_request uuid, p_branch uuid, p_lead uuid, p_student_name text,
  p_student_date_of_birth date, p_parent_name text, p_parent_phone text,
  p_curriculum uuid, p_level uuid, p_subject uuid,
  p_desired_start date, p_preferred_schedule text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_program text;
  v_subject text;
begin
  if auth.uid() is null or not public.registration_can('registration.create', p_branch) then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  if p_curriculum is null or p_level is null or p_subject is null
     or not exists (select 1 from public.curriculums where id = p_curriculum and status = 'ACTIVE')
     or not exists (select 1 from public.curriculum_levels where id = p_level and curriculum_id = p_curriculum and status = 'ACTIVE')
     or not exists (select 1 from public.curriculum_subjects where id = p_subject and level_id = p_level and status = 'ACTIVE') then
    raise exception 'REGISTRATION_ACADEMIC_SELECTION_INVALID';
  end if;
  select name into v_program from public.curriculums where id = p_curriculum;
  select name into v_subject from public.curriculum_subjects where id = p_subject;
  v_id := public.create_registration_application(
    p_request, p_branch, p_lead, p_student_name, p_student_date_of_birth,
    p_parent_name, p_parent_phone, v_program, v_subject, p_desired_start, p_preferred_schedule
  );
  if not exists(select 1 from public.registration_applications where id = v_id and branch_id = p_branch and created_by = auth.uid()) then
    raise exception 'REGISTRATION_REQUEST_CONFLICT';
  end if;
  if exists(select 1 from public.registration_applications where id = v_id and curriculum_id is null) then
    perform set_config('registration.write', 'on', true);
    update public.registration_applications set curriculum_id = p_curriculum,
      level_id = p_level, subject_id = p_subject where id = v_id;
    perform set_config('registration.write', 'off', true);
  elsif not exists(select 1 from public.registration_applications where id = v_id
    and curriculum_id = p_curriculum and level_id = p_level and subject_id = p_subject) then
    raise exception 'REGISTRATION_REQUEST_CONFLICT';
  end if;
  return v_id;
end $$;

create function public.registration_copy_placement_academics() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  select curriculum_id, level_id, subject_id
    into new.curriculum_id, new.level_id, new.subject_id
  from public.registration_applications where id = new.registration_application_id;
  return new;
end $$;

create trigger registration_copy_placement_academics
before insert on public.student_placement_cases
for each row execute function public.registration_copy_placement_academics();

revoke all on function public.create_registration_application_with_academics(uuid,uuid,uuid,text,date,text,text,uuid,uuid,uuid,date,text) from public;
grant execute on function public.create_registration_application_with_academics(uuid,uuid,uuid,text,date,text,text,uuid,uuid,uuid,date,text) to authenticated;

revoke all on function public.assign_student_code(), public.keep_student_code(), public.registration_academic_selection_guard(), public.registration_copy_placement_academics() from public, anon, authenticated, service_role;
