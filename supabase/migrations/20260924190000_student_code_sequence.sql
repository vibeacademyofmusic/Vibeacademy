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
    perform setval('public.student_code_number_seq', 1, false);
  else
    perform setval('public.student_code_number_seq', highest, true);
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
