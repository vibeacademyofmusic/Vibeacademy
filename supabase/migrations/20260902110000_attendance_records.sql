-- =========================================================
-- VIBE ACADEMY
-- Attendance Phase 1
-- =========================================================

-- One row records one class enrollment's attendance at one
-- concrete session occurrence. Attendance never references the
-- recurring schedules table directly.

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),

  session_occurrence_id uuid not null
    references public.session_occurrences(id)
    on delete restrict,

  enrollment_id uuid not null
    references public.enrollments(id)
    on delete restrict,

  status text not null
    check (
      status in (
        'PRESENT',
        'ABSENT',
        'LATE',
        'EXCUSED'
      )
    ),

  notes text,

  marked_at timestamptz not null default now(),
  marked_by uuid default auth.uid()
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendance_records_occurrence_enrollment_key
    unique (
      session_occurrence_id,
      enrollment_id
    )
);

create index attendance_records_enrollment_id_idx
  on public.attendance_records(enrollment_id);

create index attendance_records_status_idx
  on public.attendance_records(status);


-- =========================================================
-- CLASS CONSISTENCY VALIDATION
-- =========================================================

create or replace function
  public.validate_attendance_record_class()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_occurrence_class_id uuid;
  v_enrollment_class_id uuid;
begin
  select schedule.class_id
  into v_occurrence_class_id
  from public.session_occurrences as occurrence
  join public.schedules as schedule
    on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id;

  select enrollment.class_id
  into v_enrollment_class_id
  from public.enrollments as enrollment
  where enrollment.id = new.enrollment_id;

  if v_occurrence_class_id is distinct from
    v_enrollment_class_id
  then
    raise exception
      'Attendance enrollment must belong to the occurrence class';
  end if;

  return new;
end;
$$;

create trigger trg_validate_attendance_record_class
before insert or update of
  session_occurrence_id,
  enrollment_id
on public.attendance_records
for each row
execute function
  public.validate_attendance_record_class();


-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

create trigger trg_attendance_records_updated_at
before update on public.attendance_records
for each row
execute function public.set_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.attendance_records
  enable row level security;

-- Phase 1: align access with the existing admin modules.
-- Teacher access will be added as a separate, auditable phase.
create policy "super_admin_manage_attendance_records"
on public.attendance_records
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);
