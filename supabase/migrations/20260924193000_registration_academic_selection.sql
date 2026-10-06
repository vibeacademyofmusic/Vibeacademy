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
