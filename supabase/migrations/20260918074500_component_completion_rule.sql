-- ============================================================
-- VIBE ACADEMY
-- Component Completion Rule
--
-- Component can be:
--   DIRECT_ASSESSMENT
--   ALL_REQUIRED_ITEMS
-- ============================================================


-- ============================================================
-- 1. ADD COMPLETION RULE
-- ============================================================

alter table public.curriculum_subject_components
add column if not exists completion_rule text;


-- ============================================================
-- 2. BACKFILL EXISTING COMPONENTS
-- ============================================================

update public.curriculum_subject_components
set completion_rule = 'DIRECT_ASSESSMENT'
where completion_rule is null;


-- ============================================================
-- 3. REQUIRE VALUE
-- ============================================================

alter table public.curriculum_subject_components
alter column completion_rule
set default 'DIRECT_ASSESSMENT';


alter table public.curriculum_subject_components
alter column completion_rule
set not null;


-- ============================================================
-- 4. CONSTRAINT
-- ============================================================

alter table public.curriculum_subject_components
drop constraint if exists curriculum_subject_components_completion_rule_check;


alter table public.curriculum_subject_components
add constraint curriculum_subject_components_completion_rule_check
check (
  completion_rule in (
    'DIRECT_ASSESSMENT',
    'ALL_REQUIRED_ITEMS'
  )
);