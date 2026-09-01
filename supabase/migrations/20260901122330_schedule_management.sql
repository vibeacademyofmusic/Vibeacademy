-- =========================================================
-- VIBE ACADEMY
-- Sprint 3: Schedule Management
-- =========================================================

-- ---------------------------------------------------------
-- ROOMS
-- Physical teaching rooms belonging to a branch.
-- ---------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  code text not null,
  name text not null,

  capacity integer
    check (
      capacity is null
      or capacity > 0
    ),

  notes text,

  status text not null default 'ACTIVE'
    check (
      status in (
        'ACTIVE',
        'INACTIVE'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rooms_branch_code_key
    unique (branch_id, code)
);

create index rooms_branch_id_idx
  on public.rooms(branch_id);

create index rooms_status_idx
  on public.rooms(status);


-- ---------------------------------------------------------
-- SCHEDULES
--
-- Represents a recurring weekly class schedule.
--
-- day_of_week uses ISO numbering:
-- 1 = Monday
-- 2 = Tuesday
-- 3 = Wednesday
-- 4 = Thursday
-- 5 = Friday
-- 6 = Saturday
-- 7 = Sunday
--
-- Example:
-- Guitar Grade 1
-- Saturday 09:00 - 10:00
-- Effective 2026-09-01 through 2026-12-31
-- ---------------------------------------------------------

create table public.schedules (
  id uuid primary key default gen_random_uuid(),

  class_id uuid not null
    references public.classes(id)
    on delete cascade,

  room_id uuid
    references public.rooms(id)
    on delete restrict,

  day_of_week smallint not null
    check (
      day_of_week between 1 and 7
    ),

  start_time time not null,
  end_time time not null,

  effective_from date not null,
  effective_to date,

  timezone text not null
    default 'Asia/Ho_Chi_Minh',

  notes text,

  status text not null default 'ACTIVE'
    check (
      status in (
        'ACTIVE',
        'INACTIVE'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint schedules_time_check
    check (
      end_time > start_time
    ),

  constraint schedules_dates_check
    check (
      effective_to is null
      or effective_to >= effective_from
    ),

  constraint schedules_class_slot_key
    unique (
      class_id,
      day_of_week,
      start_time,
      effective_from
    )
);

create index schedules_class_id_idx
  on public.schedules(class_id);

create index schedules_room_id_idx
  on public.schedules(room_id);

create index schedules_day_of_week_idx
  on public.schedules(day_of_week);

create index schedules_status_idx
  on public.schedules(status);

create index schedules_effective_dates_idx
  on public.schedules(
    effective_from,
    effective_to
  );


-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================

create trigger trg_rooms_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

create trigger trg_schedules_updated_at
before update on public.schedules
for each row
execute function public.set_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.rooms
  enable row level security;

alter table public.schedules
  enable row level security;


-- =========================================================
-- SUPER ADMIN POLICIES
--
-- Phase 1:
-- SUPER_ADMIN manages Rooms and Schedules.
-- More granular staff/teacher access will be added later.
-- =========================================================

create policy "super_admin_manage_rooms"
on public.rooms
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);

create policy "super_admin_manage_schedules"
on public.schedules
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);