-- ============================================================
-- VIBE ACADEMY
-- Academic Structure Extension
--
-- Program
--   -> Level
--     -> Subject
--       -> Component
--         -> Item
-- ============================================================


-- ============================================================
-- 1. CURRICULUM COMPONENT ITEMS
-- ============================================================

create table public.curriculum_component_items (
  id uuid primary key default gen_random_uuid(),

  component_id uuid not null
    references public.curriculum_subject_components(id)
    on delete cascade,

  code text not null,

  name text not null,

  sort_order integer not null default 0,

  is_required boolean not null default true,

  status text not null default 'ACTIVE'
    check (
      status in (
        'ACTIVE',
        'INACTIVE'
      )
    ),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint curriculum_component_items_code_unique
    unique (
      component_id,
      code
    )
);


create index curriculum_component_items_component_idx
  on public.curriculum_component_items(component_id);


create index curriculum_component_items_status_idx
  on public.curriculum_component_items(status);


-- ============================================================
-- 2. STUDENT COMPONENT ITEM PROGRESS
-- ============================================================

create table public.student_component_item_progress (
  id uuid primary key default gen_random_uuid(),

  component_progress_id uuid not null
    references public.student_component_progress(id)
    on delete cascade,

  item_id uuid not null
    references public.curriculum_component_items(id)
    on delete restrict,

  status text not null default 'NOT_STARTED'
    check (
      status in (
        'NOT_STARTED',
        'IN_PROGRESS',
        'PASS',
        'MERIT',
        'DISTINCTION',
        'NOT_PASSED',
        'EXEMPT'
      )
    ),

  score numeric,

  started_at timestamptz,

  passed_at timestamptz,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint student_component_item_progress_unique
    unique (
      component_progress_id,
      item_id
    )
);


create index student_component_item_progress_component_idx
  on public.student_component_item_progress(component_progress_id);


create index student_component_item_progress_item_idx
  on public.student_component_item_progress(item_id);


create index student_component_item_progress_status_idx
  on public.student_component_item_progress(status);


-- ============================================================
-- 3. UPDATED_AT TRIGGERS
-- ============================================================

create trigger trg_curriculum_component_items_updated_at
before update on public.curriculum_component_items
for each row
execute function public.set_updated_at();


create trigger trg_student_component_item_progress_updated_at
before update on public.student_component_item_progress
for each row
execute function public.set_updated_at();


-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.curriculum_component_items
enable row level security;


alter table public.student_component_item_progress
enable row level security;


-- ============================================================
-- 5. READ ACCESS
-- ============================================================

revoke all
on public.curriculum_component_items
from public, anon, authenticated;


revoke all
on public.student_component_item_progress
from public, anon, authenticated;


grant select
on public.curriculum_component_items
to authenticated;


grant select
on public.student_component_item_progress
to authenticated;


-- Reuse SUPER_ADMIN access pattern for initial implementation.

create policy curriculum_component_items_super_admin_read
on public.curriculum_component_items
for select
to authenticated
using (
  public.has_role('SUPER_ADMIN')
);


create policy student_component_item_progress_super_admin_read
on public.student_component_item_progress
for select
to authenticated
using (
  public.has_role('SUPER_ADMIN')
);