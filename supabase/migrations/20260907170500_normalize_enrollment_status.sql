-- =========================================================
-- VIBE ACADEMY
-- Normalize Class Enrollment Status
-- =========================================================
--
-- Class enrollment pause is now represented by
-- public.enrollment_pauses with dated periods.
--
-- public.enrollments.status represents the enrollment
-- lifecycle only:
--
-- ACTIVE
-- COMPLETED
-- WITHDRAWN
--
-- PAUSED is intentionally removed.
-- =========================================================

alter table public.enrollments
drop constraint if exists enrollments_status_check;

alter table public.enrollments
add constraint enrollments_status_check
check (
  status in (
    'ACTIVE',
    'COMPLETED',
    'WITHDRAWN'
  )
);