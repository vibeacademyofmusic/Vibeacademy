begin;

-- Counter intake. Old rows stay without an invented address or consent.
-- "Trên 18 tuổi" means the 18th birthday in Asia/Ho_Chi_Minh has already passed.
-- The birthday itself is exactly 18. This is not "từ đủ 18" (age >= 18).

alter table public.registration_applications
  add column if not exists student_over_18 boolean not null default false,
  add column if not exists zalo_phone text,
  add column if not exists home_address text;

alter table public.registration_applications
  drop constraint if exists registration_home_address_check;
alter table public.registration_applications
  add constraint registration_home_address_check
  check (home_address is null or (char_length(home_address) between 1 and 300 and home_address = btrim(home_address) and home_address !~ '\s{2,}'));

alter table public.registration_applications
  drop constraint if exists registration_zalo_phone_check;
alter table public.registration_applications
  add constraint registration_zalo_phone_check
  check (zalo_phone is null or zalo_phone ~ '^84[0-9]{9}$');

alter table public.students
  add column if not exists declares_over_18 boolean;

alter table public.registration_zalo_phone_consents
  add column if not exists consenter_role text;

alter table public.registration_zalo_phone_consents
  drop constraint if exists registration_zalo_phone_consents_consenter_check;
alter table public.registration_zalo_phone_consents
  add constraint registration_zalo_phone_consents_consenter_check
  check (consenter_role is null or consenter_role in ('STUDENT', 'PARENT'));

do $$
declare c name;
begin
  select con.conname into c
  from pg_constraint con
  where con.conrelid = 'public.registration_applications'::regclass
    and pg_get_constraintdef(con.oid) ilike '%linked_parent_id is not null%';
  if c is not null then
    execute format('alter table public.registration_applications drop constraint %I', c);
  end if;
end $$;

alter table public.registration_applications
  add constraint registration_completed_identity_check check (
    status <> 'COMPLETED'
    or (linked_student_id is not null and completed_at is not null and (linked_parent_id is not null or student_over_18))
  );

alter table public.registration_application_events
  drop constraint registration_application_events_event_type_check;
alter table public.registration_application_events
  add constraint registration_application_events_event_type_check
  check (event_type in (
    'CREATED', 'SUBMITTED', 'VERIFIED', 'PAYMENT_CONFIRMED', 'IDENTITY_REVIEWED',
    'STUDENT_LINKED', 'PARENT_LINKED', 'ENROLLMENT_CREATED', 'REGISTRATION_COMPLETED',
    'PLACEMENT_OPENED', 'CANCELLED',
    'ZALO_LINK_REQUESTED', 'ZALO_LINK_CONFIRMED', 'ZALO_LINK_FAILED',
    'BRANCH_SET', 'QUOTE_CORRECTED', 'INTAKE_UPDATED'
  ));

create or replace function public.registration_is_over_18(p_birth date)
returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare
  anniversary date;
  year_n integer;
  month_n integer;
  day_n integer;
  month_end integer;
begin
  if p_birth is null then return false; end if;
  year_n := extract(year from p_birth)::integer + 18;
  month_n := extract(month from p_birth)::integer;
  day_n := extract(day from p_birth)::integer;
  month_end := extract(day from (make_date(year_n, month_n, 1) + interval '1 month - 1 day'))::integer;
  anniversary := make_date(year_n, month_n, least(day_n, month_end));
  return anniversary < public.registration_vietnam_today();
end $$;

create or replace function public.registration_zalo_consent_consenter()
returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.consenter_role is null then
    select case when student_over_18 then 'STUDENT' else 'PARENT' end
      into new.consenter_role
    from public.registration_applications
    where id = new.application_id;
  end if;
  return new;
end $$;

drop trigger if exists registration_zalo_consent_consenter on public.registration_zalo_phone_consents;
create trigger registration_zalo_consent_consenter
before insert on public.registration_zalo_phone_consents
for each row execute function public.registration_zalo_consent_consenter();

create or replace function public.registration_zalo_consent_details(p_application uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
  if not exists(select 1 from registration_applications where id = p_application) then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  return jsonb_build_object('history', coalesce((select jsonb_agg(jsonb_build_object(
    'id', c.id, 'phone', left(c.normalized_phone, 4) || '…' || right(c.normalized_phone, 3),
    'at', c.consented_at, 'actor', coalesce(p.full_name, c.actor_id::text), 'source', c.source,
    'method', c.confirmation_method, 'consenter', c.consenter_role,
    'revokedAt', c.revoked_at, 'revokedBy', coalesce(r.full_name, c.revoked_by::text)) order by c.consented_at desc)
    from registration_zalo_phone_consents c
    left join profiles p on p.id = c.actor_id
    left join profiles r on r.id = c.revoked_by
    where c.application_id = p_application), '[]'::jsonb));
end $$;

create or replace function public.registration_academic_selection_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.curriculum_id is null and new.level_id is null and new.subject_id is null then
    return new;
  end if;
  if new.curriculum_id is null or new.level_id is null
     or not exists (select 1 from public.curriculums where id = new.curriculum_id and status = 'ACTIVE')
     or not exists (select 1 from public.curriculum_levels where id = new.level_id and curriculum_id = new.curriculum_id and status = 'ACTIVE')
     or (new.subject_id is not null and not exists (
       select 1 from public.curriculum_subjects where id = new.subject_id and level_id = new.level_id and status = 'ACTIVE'
     )) then
    raise exception 'REGISTRATION_ACADEMIC_SELECTION_INVALID';
  end if;
  return new;
end $$;

create or replace function public.create_registration_application_with_academics(
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
  if p_curriculum is null or p_level is null
     or not exists (select 1 from public.curriculums where id = p_curriculum and status = 'ACTIVE')
     or not exists (select 1 from public.curriculum_levels where id = p_level and curriculum_id = p_curriculum and status = 'ACTIVE')
     or (p_subject is not null and not exists (
       select 1 from public.curriculum_subjects where id = p_subject and level_id = p_level and status = 'ACTIVE'
     )) then
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
    and curriculum_id = p_curriculum and level_id = p_level and subject_id is not distinct from p_subject) then
    raise exception 'REGISTRATION_REQUEST_CONFLICT';
  end if;
  return v_id;
end $$;

create or replace function public.registration_prepare_intake(
  p_birth date, p_over_18 boolean, p_parent_name text, p_parent_phone text,
  p_zalo_phone text, p_home_address text, p_consent boolean, p_consent_method text
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  address text := regexp_replace(btrim(coalesce(p_home_address, '')), '\s+', ' ', 'g');
  zalo text;
  parent_phone text;
begin
  if address = '' or char_length(address) > 300 then raise exception 'ADDRESS_REQUIRED'; end if;
  if p_zalo_phone is null or btrim(p_zalo_phone) !~ '^\+?[0-9 () .-]+$' then raise exception 'PHONE_INVALID'; end if;
  zalo := notification_private.normalize_vn_phone(p_zalo_phone);
  if zalo is null then raise exception 'PHONE_INVALID'; end if;
  if p_birth is null or p_over_18 is distinct from public.registration_is_over_18(p_birth) then
    raise exception 'REGISTRATION_AGE_MISMATCH';
  end if;
  if nullif(btrim(coalesce(p_parent_phone, '')), '') is not null then
    if btrim(p_parent_phone) !~ '^\+?[0-9 () .-]+$' then raise exception 'PHONE_INVALID'; end if;
    parent_phone := notification_private.normalize_vn_phone(p_parent_phone);
    if parent_phone is null then raise exception 'PHONE_INVALID'; end if;
  end if;
  if not coalesce(p_over_18, false) and (nullif(btrim(coalesce(p_parent_name, '')), '') is null or parent_phone is null) then
    raise exception 'PARENT_REQUIRED';
  end if;
  if p_consent is true and (p_consent_method is null or p_consent_method not in ('IN_PERSON', 'PHONE', 'WRITTEN')) then
    raise exception 'PHONE_CONSENT_SOURCE_REQUIRED';
  end if;
  return jsonb_build_object(
    'address', address,
    'zalo', zalo,
    'parent_name', nullif(btrim(coalesce(p_parent_name, '')), ''),
    'parent_phone', parent_phone
  );
end $$;

drop function if exists public.create_registration_with_zalo_consent(uuid, uuid, uuid, text, date, text, text, uuid, uuid, uuid, date, text, boolean, text);

create function public.create_registration_with_zalo_consent(
  p_request uuid, p_branch uuid, p_lead uuid, p_student_name text, p_student_date_of_birth date,
  p_parent_name text, p_parent_phone text, p_curriculum uuid, p_level uuid, p_subject uuid,
  p_desired_start date, p_preferred_schedule text, p_consent boolean, p_consent_method text,
  p_over_18 boolean default false, p_zalo_phone text default null, p_home_address text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app_id uuid;
  prepared jsonb;
begin
  if p_request is null then raise exception 'REGISTRATION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('registration-intake:' || p_request::text, 0));
  if exists(select 1 from public.registration_application_events where id = p_request) then
    return (select application_id from public.registration_application_events where id = p_request);
  end if;
  prepared := public.registration_prepare_intake(
    p_student_date_of_birth, p_over_18, p_parent_name, p_parent_phone,
    p_zalo_phone, p_home_address, p_consent, p_consent_method
  );
  app_id := public.create_registration_application_with_academics(
    p_request, p_branch, p_lead, p_student_name, p_student_date_of_birth,
    prepared->>'parent_name', prepared->>'parent_phone', p_curriculum, p_level, p_subject,
    p_desired_start, p_preferred_schedule
  );
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set
    student_over_18 = coalesce(p_over_18, false),
    zalo_phone = prepared->>'zalo',
    home_address = prepared->>'address'
  where id = app_id;
  perform set_config('registration.write', 'off', true);
  if p_consent is true then
    perform public.update_registration_zalo_consent(app_id, null, 'RECORD', prepared->>'zalo', true, p_consent_method, 'REGISTRATION_FORM');
  end if;
  return app_id;
end $$;

create or replace function public.update_registration_intake(
  p_application uuid, p_version integer, p_request uuid, p_branch uuid, p_lead uuid,
  p_student_name text, p_student_date_of_birth date, p_parent_name text, p_parent_phone text,
  p_curriculum uuid, p_level uuid, p_subject uuid, p_desired_start date, p_preferred_schedule text,
  p_consent boolean, p_consent_method text, p_over_18 boolean, p_zalo_phone text, p_home_address text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.registration_applications%rowtype;
  prepared jsonb;
  new_role text;
  old_role text;
begin
  if p_request is null or auth.uid() is null then raise exception 'REGISTRATION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('registration-intake:' || p_request::text, 0));
  perform 1 from public.registration_applications where id = p_application for update;
  if exists(select 1 from public.registration_application_events where id = p_request and application_id = p_application) then
    return;
  end if;
  if exists(select 1 from public.registration_application_events where id = p_request) then
    raise exception 'REGISTRATION_REQUEST_CONFLICT';
  end if;
  row := public.registration_lock(p_application, p_version, 'registration.update');
  if row.status not in ('DRAFT', 'SUBMITTED') or row.branch_id is distinct from p_branch then
    raise exception 'REGISTRATION_TRANSITION_DENIED';
  end if;
  prepared := public.registration_prepare_intake(
    p_student_date_of_birth, p_over_18, p_parent_name, p_parent_phone,
    p_zalo_phone, p_home_address, p_consent, p_consent_method
  );
  if p_curriculum is null or p_level is null
     or not exists (select 1 from public.curriculums where id = p_curriculum and status = 'ACTIVE')
     or not exists (select 1 from public.curriculum_levels where id = p_level and curriculum_id = p_curriculum and status = 'ACTIVE')
     or (p_subject is not null and not exists (
       select 1 from public.curriculum_subjects where id = p_subject and level_id = p_level and status = 'ACTIVE'
     )) then
    raise exception 'REGISTRATION_ACADEMIC_SELECTION_INVALID';
  end if;
  new_role := case when p_over_18 then 'STUDENT' else 'PARENT' end;
  old_role := case when row.student_over_18 then 'STUDENT' else 'PARENT' end;
  if row.zalo_phone is distinct from (prepared->>'zalo') or old_role is distinct from new_role then
    update public.registration_zalo_phone_consents
      set revoked_at = clock_timestamp(), revoked_by = auth.uid()
    where application_id = p_application and revoked_at is null;
  end if;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set
    student_name = nullif(btrim(coalesce(p_student_name, '')), ''),
    student_date_of_birth = p_student_date_of_birth,
    student_over_18 = coalesce(p_over_18, false),
    parent_name = case when p_over_18 and prepared->>'parent_name' is null then parent_name else prepared->>'parent_name' end,
    parent_phone = case when p_over_18 and prepared->>'parent_phone' is null then parent_phone else prepared->>'parent_phone' end,
    zalo_phone = prepared->>'zalo',
    home_address = prepared->>'address',
    curriculum_id = p_curriculum,
    level_id = p_level,
    subject_id = case
      when p_subject is not null then p_subject
      when curriculum_id is not distinct from p_curriculum and level_id is not distinct from p_level then subject_id
      else null
    end,
    desired_start_date = p_desired_start,
    preferred_schedule = nullif(btrim(coalesce(p_preferred_schedule, '')), ''),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = p_application;
  insert into public.registration_application_events(id, application_id, event_type, from_status, to_status, actor_id)
  values (p_request, p_application, 'INTAKE_UPDATED', row.status, row.status, auth.uid());
  perform set_config('registration.write', 'off', true);
  if p_consent is true and not exists (
    select 1 from public.registration_zalo_phone_consents
    where application_id = p_application and revoked_at is null and normalized_phone = prepared->>'zalo'
  ) then
    perform public.update_registration_zalo_consent(p_application, null, 'RECORD', prepared->>'zalo', true, p_consent_method, 'REGISTRATION_FORM');
  end if;
end $$;

create or replace function public.copy_registration_intake_to_student()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' and new.linked_student_id is not null then
    update public.students set
      address = coalesce(nullif(btrim(new.home_address), ''), address),
      phone = coalesce(nullif(btrim(new.zalo_phone), ''), phone),
      declares_over_18 = new.student_over_18
    where id = new.linked_student_id;
  end if;
  return new;
end $$;

drop trigger if exists copy_registration_intake_to_student on public.registration_applications;
create trigger copy_registration_intake_to_student
after update on public.registration_applications
for each row execute function public.copy_registration_intake_to_student();

-- Parent is required only when the stored age flag says the student is not over 18.
-- Existing rows default to false, so current payment completion still requires a parent.

create or replace function public.complete_momo_deposit_registration(p_application uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
  student_id uuid; parent_id uuid; placement_id uuid; finance_id uuid;
  ord public.registration_momo_orders%rowtype; branch public.branches%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then
    raise exception 'MOMO_SERVER_ONLY';
  end if;
  select * into app from public.registration_applications where id = p_application for update;
  if app.status = 'COMPLETED' then return 'ALREADY_COMPLETED'; end if;
  if app.status <> 'PAID' or app.deposit_confirmed_at is null then
    raise exception 'REGISTRATION_PAYMENT_REQUIRED';
  end if;
  if nullif(btrim(coalesce(app.student_name, '')), '') is null or app.student_date_of_birth is null
     or (not coalesce(app.student_over_18, false) and nullif(btrim(coalesce(app.parent_name, '')), '') is null) then
    return 'REVIEW_INCOMPLETE_IDENTITY';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    lower(btrim(app.student_name)) || ':' || app.student_date_of_birth::text, 0));
  if exists(select 1 from public.students s where s.date_of_birth = app.student_date_of_birth
     and lower(btrim(coalesce(s.full_name, ''))) = lower(btrim(app.student_name))) then
    return 'REVIEW_POSSIBLE_DUPLICATE';
  end if;
  student_id := gen_random_uuid();
  parent_id := null;
  placement_id := gen_random_uuid();
  perform set_config('registration.write', 'on', true);
  insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status)
  values(student_id, null, btrim(app.student_name), app.student_date_of_birth,
    app.branch_id, public.registration_vietnam_today(), 'ACTIVE');
  if nullif(btrim(coalesce(app.parent_name, '')), '') is not null then
    parent_id := gen_random_uuid();
    insert into public.parents(id, parent_code, status)
    values(parent_id, 'PH-' || substr(replace(parent_id::text, '-', ''), 1, 8), 'ACTIVE');
    insert into public.student_parents(student_id, parent_id, relationship, is_primary)
    values(student_id, parent_id, 'GUARDIAN', true);
  end if;
  insert into public.student_placement_cases(id, student_id, registration_application_id,
    branch_id, status, desired_start_date, preferred_schedule)
  values(placement_id, student_id, app.id, app.branch_id, 'UNASSIGNED',
    app.desired_start_date, app.preferred_schedule);
  select * into branch from public.branches where id = app.branch_id;
  for ord in select * from public.registration_momo_orders
    where application_id = app.id and state = 'PAID' order by paid_at for update loop
    finance_id := gen_random_uuid();
    insert into public.payments(id, payment_number, student_id_snapshot, branch_id_snapshot,
      branch_code_snapshot, branch_name_snapshot, amount, currency, payment_method,
      paid_at, reference, notes, status)
    values(finance_id, 'PAY-' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY') || '-'
      || lpad(nextval('public.payment_number_seq')::text, 6, '0'), student_id,
      branch.id, branch.code, branch.name, ord.amount, 'VND', 'OTHER', ord.paid_at,
      'MOMO:' || ord.provider_transaction_id, 'Cọc hồ sơ ' || app.application_code, 'POSTED');
    update public.registration_momo_orders set finance_payment_id = finance_id where id = ord.id;
  end loop;
  update public.registration_applications set linked_student_id = student_id,
    linked_parent_id = parent_id, status = 'COMPLETED', completed_at = clock_timestamp(),
    version = version + 1, updated_at = clock_timestamp() where id = app.id;
  insert into public.registration_application_events(id, application_id, event_type,
    from_status, to_status, actor_id, metadata)
  values(gen_random_uuid(), app.id, 'REGISTRATION_COMPLETED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'MOMO_DEPOSIT', 'student_id', student_id, 'parent_id', parent_id)),
    (gen_random_uuid(), app.id, 'PLACEMENT_OPENED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'MOMO_DEPOSIT', 'placement_id', placement_id));
  insert into public.student_placement_events(id, placement_id, event_type, actor_id)
  values(gen_random_uuid(), placement_id, 'PLACEMENT_OPENED', null);
  perform set_config('registration.write', 'off', true);
  return 'COMPLETED';
end $$;

create or replace function public.complete_payos_registration(p_application uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
  student_id uuid; parent_id uuid; placement_id uuid; finance_id uuid;
  ord public.registration_payos_orders%rowtype; branch public.branches%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'PAYOS_SERVER_ONLY'; end if;
  select * into app from public.registration_applications where id = p_application for update;
  if app.status = 'COMPLETED' then return 'ALREADY_COMPLETED'; end if;
  if app.status <> 'PAID' or app.deposit_confirmed_at is null then
    raise exception 'REGISTRATION_PAYMENT_REQUIRED';
  end if;
  if nullif(btrim(coalesce(app.student_name, '')), '') is null or app.student_date_of_birth is null
     or (not coalesce(app.student_over_18, false) and nullif(btrim(coalesce(app.parent_name, '')), '') is null) then
    return 'REVIEW_INCOMPLETE_IDENTITY';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    lower(btrim(app.student_name)) || ':' || app.student_date_of_birth::text, 0));
  if exists(select 1 from public.students s where s.date_of_birth = app.student_date_of_birth
     and lower(btrim(coalesce(s.full_name, ''))) = lower(btrim(app.student_name))) then
    return 'REVIEW_POSSIBLE_DUPLICATE';
  end if;
  student_id := gen_random_uuid();
  parent_id := null;
  placement_id := gen_random_uuid();
  perform set_config('registration.write', 'on', true);
  insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status)
  values(student_id, null, btrim(app.student_name), app.student_date_of_birth,
    app.branch_id, public.registration_vietnam_today(), 'ACTIVE');
  if nullif(btrim(coalesce(app.parent_name, '')), '') is not null then
    parent_id := gen_random_uuid();
    insert into public.parents(id, parent_code, status)
    values(parent_id, 'PH-' || substr(replace(parent_id::text, '-', ''), 1, 8), 'ACTIVE');
    insert into public.student_parents(student_id, parent_id, relationship, is_primary)
    values(student_id, parent_id, 'GUARDIAN', true);
  end if;
  insert into public.student_placement_cases(id, student_id, registration_application_id,
    branch_id, status, desired_start_date, preferred_schedule)
  values(placement_id, student_id, app.id, app.branch_id, 'UNASSIGNED',
    app.desired_start_date, app.preferred_schedule);
  select * into branch from public.branches where id = app.branch_id;
  for ord in select * from public.registration_payos_orders
    where application_id = app.id and state = 'PAID' and finance_payment_id is null
    order by paid_at for update loop
    finance_id := gen_random_uuid();
    insert into public.payments(id, payment_number, student_id_snapshot, branch_id_snapshot,
      branch_code_snapshot, branch_name_snapshot, amount, currency, payment_method,
      paid_at, reference, notes, status)
    values(finance_id, 'PAY-' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY') || '-'
      || lpad(nextval('public.payment_number_seq')::text, 6, '0'), student_id,
      branch.id, branch.code, branch.name, ord.attributed_amount, 'VND', 'OTHER', ord.paid_at,
      'PAYOS:' || ord.provider_reference, 'Hoc phi ho so ' || app.application_code, 'POSTED');
    update public.registration_payos_orders set finance_payment_id = finance_id where id = ord.id;
  end loop;
  update public.registration_applications set linked_student_id = student_id,
    linked_parent_id = parent_id, status = 'COMPLETED', completed_at = clock_timestamp(),
    version = version + 1, updated_at = clock_timestamp() where id = app.id;
  insert into public.registration_application_events(id, application_id, event_type,
    from_status, to_status, actor_id, metadata)
  values(gen_random_uuid(), app.id, 'REGISTRATION_COMPLETED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'PAYOS', 'student_id', student_id, 'parent_id', parent_id)),
    (gen_random_uuid(), app.id, 'PLACEMENT_OPENED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'PAYOS', 'placement_id', placement_id));
  insert into public.student_placement_events(id, placement_id, event_type, actor_id)
  values(gen_random_uuid(), placement_id, 'PLACEMENT_OPENED', null);
  perform set_config('registration.write', 'off', true);
  return 'COMPLETED';
end $$;

create or replace function public.complete_registration_application(
  p_request uuid, p_application uuid, p_version integer, p_student uuid, p_parent uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.registration_applications%rowtype;
  v_student uuid := p_student;
  v_parent uuid := p_parent;
  matches integer;
  student_code text;
  parent_code text;
  placement_id uuid;
begin
  if actor is null or p_request is null then raise exception 'REGISTRATION_INVALID'; end if;
  if exists(select 1 from public.registration_application_events where id = p_request and event_type = 'REGISTRATION_COMPLETED') then
    return p_application;
  end if;
  if not public.registration_can('registration.complete', (select branch_id from public.registration_applications where id = p_application)) then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  select * into row from public.registration_applications where id = p_application for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if row.status = 'COMPLETED' then return row.id; end if;
  if row.version is distinct from p_version then raise exception 'REGISTRATION_STALE'; end if;
  if row.status not in ('VERIFIED', 'PAID', 'PAYMENT_PENDING') then raise exception 'REGISTRATION_TRANSITION_DENIED'; end if;
  if nullif(btrim(coalesce(row.student_name, '')), '') is null or row.student_date_of_birth is null
     or (not coalesce(row.student_over_18, false) and nullif(btrim(coalesce(row.parent_name, '')), '') is null) then
    raise exception 'REGISTRATION_INCOMPLETE';
  end if;
  if row.invoice_id is not null and not public.registration_invoice_settled(row.invoice_id) then
    raise exception 'REGISTRATION_PAYMENT_REQUIRED';
  end if;
  select count(*) into matches
  from public.students student
  where student.date_of_birth = row.student_date_of_birth
    and lower(btrim(coalesce(student.full_name, ''))) = lower(btrim(row.student_name));
  if v_student is null and matches > 0 then raise exception 'REGISTRATION_REVIEW_REQUIRED'; end if;
  if v_student is not null then
    if not exists(
      select 1 from public.students student
      where student.id = v_student and student.status = 'ACTIVE'
        and student.date_of_birth = row.student_date_of_birth
        and lower(btrim(coalesce(student.full_name, ''))) = lower(btrim(row.student_name))
    ) then
      raise exception 'REGISTRATION_MATCH_REJECTED';
    end if;
  end if;
  if nullif(btrim(coalesce(row.parent_name, '')), '') is null then
    v_parent := null;
  elsif v_parent is not null and not exists(select 1 from public.parents where id = v_parent and status = 'ACTIVE') then
    raise exception 'REGISTRATION_MATCH_REJECTED';
  end if;
  perform set_config('registration.write', 'on', true);
  if v_student is null then
    v_student := gen_random_uuid();
    student_code := 'HV-' || substr(replace(v_student::text, '-', ''), 1, 8);
    insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status)
    values (v_student, student_code, btrim(row.student_name), row.student_date_of_birth, row.branch_id, public.registration_vietnam_today(), 'ACTIVE');
  end if;
  if nullif(btrim(coalesce(row.parent_name, '')), '') is not null and v_parent is null then
    v_parent := gen_random_uuid();
    parent_code := 'PH-' || substr(replace(v_parent::text, '-', ''), 1, 8);
    insert into public.parents(id, parent_code, status) values (v_parent, parent_code, 'ACTIVE');
  end if;
  if v_parent is not null then
    insert into public.student_parents(student_id, parent_id, relationship, is_primary)
    values (v_student, v_parent, 'GUARDIAN', true)
    on conflict (student_id, parent_id) do nothing;
  end if;
  placement_id := gen_random_uuid();
  insert into public.student_placement_cases(
    id, student_id, registration_application_id, branch_id, status, desired_start_date, preferred_schedule, owner_user_id
  ) values (
    placement_id, v_student, row.id, row.branch_id, 'UNASSIGNED', row.desired_start_date, row.preferred_schedule, actor
  );
  update public.registration_applications set
    linked_student_id = v_student,
    linked_parent_id = v_parent,
    status = 'COMPLETED',
    payment_confirmed_at = case when invoice_id is not null then coalesce(payment_confirmed_at, clock_timestamp()) else payment_confirmed_at end,
    completed_at = clock_timestamp(),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.registration_application_events(id, application_id, event_type, from_status, to_status, actor_id, metadata)
  values
    (p_request, row.id, 'REGISTRATION_COMPLETED', row.status, 'COMPLETED', actor, jsonb_build_object('student_id', v_student, 'parent_id', v_parent)),
    (gen_random_uuid(), row.id, 'STUDENT_LINKED', row.status, 'COMPLETED', actor, jsonb_build_object('student_id', v_student)),
    (gen_random_uuid(), row.id, 'PLACEMENT_OPENED', row.status, 'COMPLETED', actor, jsonb_build_object('placement_id', placement_id));
  if v_parent is not null then
    insert into public.registration_application_events(id, application_id, event_type, from_status, to_status, actor_id, metadata)
    values (gen_random_uuid(), row.id, 'PARENT_LINKED', row.status, 'COMPLETED', actor, jsonb_build_object('parent_id', v_parent));
  end if;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id)
  values (gen_random_uuid(), placement_id, 'PLACEMENT_OPENED', actor);
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

revoke all on function public.registration_prepare_intake(date, boolean, text, text, text, text, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public.registration_is_over_18(date) from public, anon, authenticated, service_role;
revoke all on function public.registration_zalo_consent_consenter() from public, anon, authenticated, service_role;
revoke all on function public.copy_registration_intake_to_student() from public, anon, authenticated, service_role;
revoke all on function public.create_registration_with_zalo_consent(uuid, uuid, uuid, text, date, text, text, uuid, uuid, uuid, date, text, boolean, text, boolean, text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_registration_with_zalo_consent(uuid, uuid, uuid, text, date, text, text, uuid, uuid, uuid, date, text, boolean, text, boolean, text, text) to authenticated;
revoke all on function public.update_registration_intake(uuid, integer, uuid, uuid, uuid, text, date, text, text, uuid, uuid, uuid, date, text, boolean, text, boolean, text, text) from public, anon, authenticated, service_role;
grant execute on function public.update_registration_intake(uuid, integer, uuid, uuid, uuid, text, date, text, text, uuid, uuid, uuid, date, text, boolean, text, boolean, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
