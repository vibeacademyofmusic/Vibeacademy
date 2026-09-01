-- =========================================================
-- VIBE ACADEMY
-- Session Engine: dated session occurrences
-- =========================================================

-- schedules is the recurring weekly master.
-- session_occurrences stores each concrete, dated class session.
-- Future attendance records must reference session_occurrences.id,
-- not schedules.id.

create table public.session_occurrences (
  id uuid primary key default gen_random_uuid(),

  schedule_id uuid not null
    references public.schedules(id)
    on delete restrict,

  -- The date generated from the recurring schedule. It stays stable
  -- even when the concrete session is later rescheduled.
  occurrence_date date not null,

  starts_at timestamptz not null,
  ends_at timestamptz not null,

  -- Snapshot or override of the room for this concrete session.
  room_id uuid
    references public.rooms(id)
    on delete restrict,

  status text not null default 'SCHEDULED'
    check (
      status in (
        'SCHEDULED',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint session_occurrences_time_check
    check (ends_at > starts_at),

  constraint session_occurrences_schedule_date_key
    unique (schedule_id, occurrence_date)
);

create index session_occurrences_schedule_id_idx
  on public.session_occurrences(schedule_id);

create index session_occurrences_starts_at_idx
  on public.session_occurrences(starts_at);

create index session_occurrences_status_idx
  on public.session_occurrences(status);

create index session_occurrences_room_id_idx
  on public.session_occurrences(room_id);


-- =========================================================
-- UPDATED_AT TRIGGER
-- =========================================================

create trigger trg_session_occurrences_updated_at
before update on public.session_occurrences
for each row
execute function public.set_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.session_occurrences
  enable row level security;

-- Phase 1: keep access aligned with Rooms and Schedules.
-- Teacher-specific access can be added with attendance workflows.
create policy "super_admin_manage_session_occurrences"
on public.session_occurrences
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);
