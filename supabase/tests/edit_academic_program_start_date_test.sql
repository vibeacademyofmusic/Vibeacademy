begin;

create extension if not exists pgtap;

select plan(9);
-- Business tests use an authorized identity after RPC authorization hardening.
insert into auth.users(id) values('ad000000-0000-4000-8000-000000000001');
insert into profiles(id) values('ad000000-0000-4000-8000-000000000001');
insert into user_roles(user_id,role_id) select 'ad000000-0000-4000-8000-000000000001',id from roles where code='SUPER_ADMIN';
select set_config('request.jwt.claim.sub','ad000000-0000-4000-8000-000000000001',true);

-- ============================================================
-- Fixtures
-- ============================================================

insert into public.branches (
  id,
  code,
  name,
  timezone,
  status
)
values (
  '81111111-1111-1111-1111-111111111111',
  'EDITDATE',
  'Edit Academic Date Test Branch',
  'Asia/Ho_Chi_Minh',
  'ACTIVE'
)
on conflict (id) do nothing;

insert into public.students (
  id,
  student_code,
  full_name,
  default_branch_id,
  status
)
values
(
  '82222222-2222-2222-2222-222222222221',
  'EDITDATE001',
  'Edit Date Student 1',
  '81111111-1111-1111-1111-111111111111',
  'ACTIVE'
),
(
  '82222222-2222-2222-2222-222222222222',
  'EDITDATE002',
  'Edit Date Student 2',
  '81111111-1111-1111-1111-111111111111',
  'ACTIVE'
),
(
  '82222222-2222-2222-2222-222222222223',
  'EDITDATE003',
  'Edit Date Student 3',
  '81111111-1111-1111-1111-111111111111',
  'ACTIVE'
),
(
  '82222222-2222-2222-2222-222222222224',
  'EDITDATE004',
  'Edit Date Student 4',
  '81111111-1111-1111-1111-111111111111',
  'ACTIVE'
),
(
  '82222222-2222-2222-2222-222222222225',
  'EDITDATE005',
  'Edit Date Student 5',
  '81111111-1111-1111-1111-111111111111',
  'ACTIVE'
)
on conflict (id) do nothing;

insert into public.curriculums (
  id,
  code,
  name,
  status
)
values (
  '83333333-3333-3333-3333-333333333333',
  'EDIT_DATE_CURR',
  'Edit Academic Date Curriculum',
  'ACTIVE'
)
on conflict (id) do nothing;

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no,
  level_number,
  level_type,
  completion_rule,
  status
)
values (
  '84444444-4444-4444-4444-444444444444',
  '83333333-3333-3333-3333-333333333333',
  'EDIT_G01',
  'Grade 1',
  1,
  1,
  'GRADE',
  'ALL_REQUIRED_SUBJECTS',
  'ACTIVE'
)
on conflict (id) do nothing;

insert into public.curriculum_subjects (
  id,
  level_id,
  family_code,
  code,
  name,
  subject_level,
  is_required,
  completion_rule,
  sort_order,
  status
)
values
(
  '85555555-5555-5555-5555-555555555551',
  '84444444-4444-4444-4444-444444444444',
  'THEORY',
  'EDIT_THEORY_1',
  'Theory 1',
  1,
  true,
  'DIRECT_ASSESSMENT',
  1,
  'ACTIVE'
),
(
  '85555555-5555-5555-5555-555555555552',
  '84444444-4444-4444-4444-444444444444',
  'TECHNIQUE',
  'EDIT_TECHNIQUE_1',
  'Technique 1',
  1,
  true,
  'ALL_REQUIRED_COMPONENTS',
  2,
  'ACTIVE'
)
on conflict (id) do nothing;

insert into public.curriculum_subject_components (
  id,
  subject_id,
  code,
  name,
  is_required,
  sort_order,
  status
)
values (
  '86666666-6666-6666-6666-666666666666',
  '85555555-5555-5555-5555-555555555552',
  'EDIT_SCALE_1',
  'Scale 1',
  true,
  1,
  'ACTIVE'
)
on conflict (id) do nothing;

-- ============================================================
-- Create five independent academic enrollments
-- ============================================================

select public.assign_student_academic_program(
  '82222222-2222-2222-2222-222222222221',
  '83333333-3333-3333-3333-333333333333',
  '84444444-4444-4444-4444-444444444444',
  ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 7),
  true
);

select public.assign_student_academic_program(
  '82222222-2222-2222-2222-222222222222',
  '83333333-3333-3333-3333-333333333333',
  '84444444-4444-4444-4444-444444444444',
  (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  true
);

select public.assign_student_academic_program(
  '82222222-2222-2222-2222-222222222223',
  '83333333-3333-3333-3333-333333333333',
  '84444444-4444-4444-4444-444444444444',
  (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  true
);

select public.assign_student_academic_program(
  '82222222-2222-2222-2222-222222222224',
  '83333333-3333-3333-3333-333333333333',
  '84444444-4444-4444-4444-444444444444',
  (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  true
);

select public.assign_student_academic_program(
  '82222222-2222-2222-2222-222222222225',
  '83333333-3333-3333-3333-333333333333',
  '84444444-4444-4444-4444-444444444444',
  (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  true
);

-- ============================================================
-- 1. Future scheduled enrollment can be moved
-- ============================================================

select lives_ok(
  $$
    select public.update_student_academic_enrollment_start_date(
      (
        select id
        from public.student_curriculum_enrollments
        where student_id = '82222222-2222-2222-2222-222222222221'
          and curriculum_id = '83333333-3333-3333-3333-333333333333'
      ),
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 14)
    );
  $$,
  'future academic enrollment start date can be changed'
);

-- ============================================================
-- 2. Enrollment date is updated
-- ============================================================

select is(
  (
    select started_at
    from public.student_curriculum_enrollments
    where student_id = '82222222-2222-2222-2222-222222222221'
      and curriculum_id = '83333333-3333-3333-3333-333333333333'
  ),
  ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 14),
  'academic enrollment stores the new start date'
);

-- ============================================================
-- 3. Current level start date stays synchronized
-- ============================================================

select is(
  (
    select
      (slp.started_at at time zone 'Asia/Ho_Chi_Minh')::date
    from public.student_level_progress slp
    join public.student_curriculum_enrollments sce
      on sce.id = slp.enrollment_id
    where sce.student_id = '82222222-2222-2222-2222-222222222221'
      and slp.level_id = '84444444-4444-4444-4444-444444444444'
  ),
  ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 14),
  'current grade start date stays synchronized'
);

-- ============================================================
-- 4. Re-saving the same date is a safe no-op
-- ============================================================

select lives_ok(
  $$
    select public.update_student_academic_enrollment_start_date(
      (
        select id
        from public.student_curriculum_enrollments
        where student_id = '82222222-2222-2222-2222-222222222221'
          and curriculum_id = '83333333-3333-3333-3333-333333333333'
      ),
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 14)
    );
  $$,
  'saving the existing academic start date is allowed'
);

-- ============================================================
-- 5. Unknown enrollment is blocked
-- ============================================================

select throws_ok(
  $$
    select public.update_student_academic_enrollment_start_date(
      '89999999-9999-9999-9999-999999999999',
      (now() at time zone 'Asia/Ho_Chi_Minh')::date
    );
  $$,
  'P0001',
  'Academic enrollment does not exist',
  'unknown academic enrollment is rejected'
);

-- ============================================================
-- 6. Non-active enrollment is blocked
-- ============================================================

update public.student_curriculum_enrollments
set status = 'PAUSED'
where student_id = '82222222-2222-2222-2222-222222222222'
  and curriculum_id = '83333333-3333-3333-3333-333333333333';

select throws_ok(
  $$
    select public.update_student_academic_enrollment_start_date(
      (
        select id
        from public.student_curriculum_enrollments
        where student_id = '82222222-2222-2222-2222-222222222222'
          and curriculum_id = '83333333-3333-3333-3333-333333333333'
      ),
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)
    );
  $$,
  'P0001',
  'Only active academic enrollments can change their start date',
  'paused academic enrollment cannot change start date'
);

-- ============================================================
-- 7. Subject activity makes the original date historical
-- ============================================================

update public.student_subject_progress
set status = 'IN_PROGRESS'
where id = (
  select ssp.id
  from public.student_subject_progress ssp
  join public.student_level_progress slp
    on slp.id = ssp.level_progress_id
  join public.student_curriculum_enrollments sce
    on sce.id = slp.enrollment_id
  where sce.student_id = '82222222-2222-2222-2222-222222222223'
    and ssp.subject_id = '85555555-5555-5555-5555-555555555551'
);

select throws_ok(
  $$
    select public.update_student_academic_enrollment_start_date(
      (
        select id
        from public.student_curriculum_enrollments
        where student_id = '82222222-2222-2222-2222-222222222223'
          and curriculum_id = '83333333-3333-3333-3333-333333333333'
      ),
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)
    );
  $$,
  'P0001',
  'Academic enrollment start date cannot be changed after subject progress has started',
  'subject progress blocks rewriting the academic start date'
);

-- ============================================================
-- 8. Component activity makes the original date historical
-- ============================================================

update public.student_component_progress
set status = 'IN_PROGRESS'
where id = (
  select scp.id
  from public.student_component_progress scp
  join public.student_subject_progress ssp
    on ssp.id = scp.subject_progress_id
  join public.student_level_progress slp
    on slp.id = ssp.level_progress_id
  join public.student_curriculum_enrollments sce
    on sce.id = slp.enrollment_id
  where sce.student_id = '82222222-2222-2222-2222-222222222224'
    and scp.component_id = '86666666-6666-6666-6666-666666666666'
);

select throws_ok(
  $$
    select public.update_student_academic_enrollment_start_date(
      (
        select id
        from public.student_curriculum_enrollments
        where student_id = '82222222-2222-2222-2222-222222222224'
          and curriculum_id = '83333333-3333-3333-3333-333333333333'
      ),
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)
    );
  $$,
  'P0001',
  'Academic enrollment start date cannot be changed after component progress has started',
  'component progress blocks rewriting the academic start date'
);

-- ============================================================
-- 9. Completed grade makes the original date historical
-- ============================================================

update public.student_level_progress
set
  status = 'COMPLETED',
  completed_at = now()
where enrollment_id = (
  select id
  from public.student_curriculum_enrollments
  where student_id = '82222222-2222-2222-2222-222222222225'
    and curriculum_id = '83333333-3333-3333-3333-333333333333'
);

select throws_ok(
  $$
    select public.update_student_academic_enrollment_start_date(
      (
        select id
        from public.student_curriculum_enrollments
        where student_id = '82222222-2222-2222-2222-222222222225'
          and curriculum_id = '83333333-3333-3333-3333-333333333333'
      ),
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)
    );
  $$,
  'P0001',
  'Academic enrollment start date cannot be changed after a grade has been completed',
  'completed grade blocks rewriting the academic start date'
);

select * from finish();

rollback;
