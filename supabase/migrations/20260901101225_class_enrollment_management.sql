-- =========================================================
-- VIBE ACADEMY
-- Sprint 2: Class & Enrollment Management
-- =========================================================

-- ---------------------------------------------------------
-- COURSES
-- A course represents an academic offering such as
-- Guitar Grade 1, Piano Foundation, Vocal Grade 2, etc.
-- ---------------------------------------------------------

create table public.courses (
  id uuid primary key default gen_random_uuid(),

  curriculum_id uuid not null
    references public.curriculums(id)
    on delete restrict,

  level_id uuid
    references public.curriculum_levels(id)
    on delete restrict,

  code text not null,
  name text not null,
  description text,

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint courses_code_key unique (code)
);

create index courses_curriculum_id_idx
  on public.courses(curriculum_id);

create index courses_level_id_idx
  on public.courses(level_id);

create index courses_status_idx
  on public.courses(status);


-- ---------------------------------------------------------
-- CLASSES
-- A class is an actual delivery instance of a course.
-- Supports both 1-on-1 and group classes.
-- ---------------------------------------------------------

create table public.classes (
  id uuid primary key default gen_random_uuid(),

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  course_id uuid not null
    references public.courses(id)
    on delete restrict,

  code text not null,
  name text not null,

  class_type text not null default 'ONE_ON_ONE'
    check (
      class_type in (
        'ONE_ON_ONE',
        'GROUP'
      )
    ),

  capacity integer not null default 1
    check (capacity > 0),

  start_date date,
  end_date date,

  notes text,

  status text not null default 'DRAFT'
    check (
      status in (
        'DRAFT',
        'ACTIVE',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint classes_branch_code_key
    unique (branch_id, code),

  constraint classes_date_check
    check (
      end_date is null
      or start_date is null
      or end_date >= start_date
    ),

  constraint classes_capacity_type_check
    check (
      (class_type = 'ONE_ON_ONE' and capacity = 1)
      or
      (class_type = 'GROUP' and capacity >= 2)
    )
);

create index classes_branch_id_idx
  on public.classes(branch_id);

create index classes_course_id_idx
  on public.classes(course_id);

create index classes_status_idx
  on public.classes(status);


-- ---------------------------------------------------------
-- CLASS TEACHERS
-- Allows one class to have a primary teacher and assistants.
-- ---------------------------------------------------------

create table public.class_teachers (
  id uuid primary key default gen_random_uuid(),

  class_id uuid not null
    references public.classes(id)
    on delete cascade,

  teacher_id uuid not null
    references public.teachers(id)
    on delete restrict,

  teacher_role text not null default 'PRIMARY'
    check (
      teacher_role in (
        'PRIMARY',
        'ASSISTANT'
      )
    ),

  is_active boolean not null default true,

  assigned_at date not null default current_date,
  ended_at date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint class_teachers_class_teacher_key
    unique (class_id, teacher_id),

  constraint class_teachers_dates_check
    check (
      ended_at is null
      or ended_at >= assigned_at
    )
);

create index class_teachers_class_id_idx
  on public.class_teachers(class_id);

create index class_teachers_teacher_id_idx
  on public.class_teachers(teacher_id);

create unique index class_teachers_one_active_primary_idx
  on public.class_teachers(class_id)
  where teacher_role = 'PRIMARY'
    and is_active = true;


-- ---------------------------------------------------------
-- ENROLLMENTS
-- Connects students to actual classes.
--
-- student_curriculum_enrollment_id is optional but allows
-- the class enrollment to connect to Academic Progress.
-- ---------------------------------------------------------

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null
    references public.students(id)
    on delete restrict,

  class_id uuid not null
    references public.classes(id)
    on delete restrict,

  student_curriculum_enrollment_id uuid
    references public.student_curriculum_enrollments(id)
    on delete set null,

  enrolled_at date not null default current_date,

  started_at date,
  ended_at date,

  status text not null default 'ACTIVE'
    check (
      status in (
        'ACTIVE',
        'PAUSED',
        'COMPLETED',
        'WITHDRAWN'
      )
    ),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint enrollments_student_class_key
    unique (student_id, class_id),

  constraint enrollments_dates_check
    check (
      ended_at is null
      or started_at is null
      or ended_at >= started_at
    )
);

create index enrollments_student_id_idx
  on public.enrollments(student_id);

create index enrollments_class_id_idx
  on public.enrollments(class_id);

create index enrollments_curriculum_enrollment_id_idx
  on public.enrollments(student_curriculum_enrollment_id);

create index enrollments_status_idx
  on public.enrollments(status);


-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================

create trigger trg_courses_updated_at
before update on public.courses
for each row
execute function public.set_updated_at();

create trigger trg_classes_updated_at
before update on public.classes
for each row
execute function public.set_updated_at();

create trigger trg_class_teachers_updated_at
before update on public.class_teachers
for each row
execute function public.set_updated_at();

create trigger trg_enrollments_updated_at
before update on public.enrollments
for each row
execute function public.set_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.courses
  enable row level security;

alter table public.classes
  enable row level security;

alter table public.class_teachers
  enable row level security;

alter table public.enrollments
  enable row level security;


-- =========================================================
-- SUPER ADMIN POLICIES
-- Phase 1: SUPER_ADMIN manages the full module.
-- Teacher / Student / Parent policies will be added when
-- their portals are implemented.
-- =========================================================

create policy "super_admin_manage_courses"
on public.courses
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);

create policy "super_admin_manage_classes"
on public.classes
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);

create policy "super_admin_manage_class_teachers"
on public.class_teachers
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);

create policy "super_admin_manage_enrollments"
on public.enrollments
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);