-- =========================================================
-- VIBE ACADEMY
-- Teacher Profile Fields
-- =========================================================

alter table public.teachers
  add column if not exists full_name text,
  add column if not exists preferred_name text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists notes text;

alter table public.teachers
  drop constraint if exists teachers_gender_check;

alter table public.teachers
  add constraint teachers_gender_check
  check (
    gender is null
    or gender in (
      'MALE',
      'FEMALE',
      'OTHER',
      'UNSPECIFIED'
    )
  );

create index if not exists teachers_full_name_idx
  on public.teachers(full_name);

create index if not exists teachers_email_idx
  on public.teachers(email);