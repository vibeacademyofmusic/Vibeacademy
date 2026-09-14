begin;

select plan(6);

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
  '11111111-1111-1111-1111-111111111111',
  'TEST',
  'Test Branch',
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
values (
  '22222222-2222-2222-2222-222222222222',
  'TEST001',
  'Future Academic Test Student',
  '11111111-1111-1111-1111-111111111111',
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
  '33333333-3333-3333-3333-333333333333',
  'TEST_CURR',
  'Test Curriculum',
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
values
(
  '44444444-4444-4444-4444-444444444441',
  '33333333-3333-3333-3333-333333333333',
  'G01',
  'Grade 1',
  1,
  1,
  'GRADE',
  'ALL_REQUIRED_SUBJECTS',
  'ACTIVE'
),
(
  '44444444-4444-4444-4444-444444444442',
  '33333333-3333-3333-3333-333333333333',
  'G02',
  'Grade 2',
  2,
  2,
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
  '55555555-5555-5555-5555-555555555551',
  '44444444-4444-4444-4444-444444444441',
  'THEORY',
  'THEORY_1',
  'Theory 1',
  1,
  true,
  'DIRECT_ASSESSMENT',
  1,
  'ACTIVE'
),
(
  '55555555-5555-5555-5555-555555555552',
  '44444444-4444-4444-4444-444444444442',
  'THEORY',
  'THEORY_2',
  'Theory 2',
  2,
  true,
  'DIRECT_ASSESSMENT',
  1,
  'ACTIVE'
)
on conflict (id) do nothing;


-- ============================================================
-- 1. Future academic assignment must succeed
-- ============================================================

select lives_ok(
  $$
    select public.assign_student_academic_program(
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444441',
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 7),
      true
    );
  $$,
  'future academic program assignment is allowed'
);


select is(
  (
    select started_at
    from public.student_curriculum_enrollments
    where student_id = '22222222-2222-2222-2222-222222222222'
      and curriculum_id = '33333333-3333-3333-3333-333333333333'
    limit 1
  ),
  ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 7),
  'future academic enrollment start date is stored'
);


-- ============================================================
-- 2. Progress before scheduled start must be blocked
-- ============================================================

select throws_ok(
  $$
    update public.student_subject_progress
    set status = 'PASS'
    where id = (
      select ssp.id
      from public.student_subject_progress ssp
      join public.student_level_progress slp
        on slp.id = ssp.level_progress_id
      join public.student_curriculum_enrollments sce
        on sce.id = slp.enrollment_id
      where sce.student_id = '22222222-2222-2222-2222-222222222222'
      order by ssp.created_at
      limit 1
    );
  $$,
  'P0001',
  'Academic progress cannot be updated before the scheduled start date',
  'subject progress is blocked before future start date'
);


-- ============================================================
-- 3. Prepare Grade 2 as AVAILABLE
-- ============================================================

update public.student_level_progress
set
  status = 'COMPLETED',
  completed_at = now()
where enrollment_id = (
  select id
  from public.student_curriculum_enrollments
  where student_id = '22222222-2222-2222-2222-222222222222'
    and curriculum_id = '33333333-3333-3333-3333-333333333333'
  limit 1
)
and level_id = '44444444-4444-4444-4444-444444444441';


insert into public.student_level_progress (
  enrollment_id,
  level_id,
  status,
  unlocked_at
)
values (
  (
    select id
    from public.student_curriculum_enrollments
    where student_id = '22222222-2222-2222-2222-222222222222'
      and curriculum_id = '33333333-3333-3333-3333-333333333333'
    limit 1
  ),
  '44444444-4444-4444-4444-444444444442',
  'AVAILABLE',
  now()
)
on conflict (enrollment_id, level_id)
do update set
  status = 'AVAILABLE',
  started_at = null,
  completed_at = null;


select lives_ok(
  $$
    select public.start_student_academic_level(
      (
        select id
        from public.student_curriculum_enrollments
        where student_id = '22222222-2222-2222-2222-222222222222'
          and curriculum_id = '33333333-3333-3333-3333-333333333333'
        limit 1
      ),
      '44444444-4444-4444-4444-444444444442',
      ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 14)
    );
  $$,
  'future next academic level start is allowed'
);


select is(
  (
    select status
    from public.student_level_progress
    where enrollment_id = (
      select id
      from public.student_curriculum_enrollments
      where student_id = '22222222-2222-2222-2222-222222222222'
        and curriculum_id = '33333333-3333-3333-3333-333333333333'
      limit 1
    )
      and level_id = '44444444-4444-4444-4444-444444444442'
  ),
  'IN_PROGRESS',
  'future scheduled level keeps existing IN_PROGRESS database status'
);


select throws_ok(
  $$
    update public.student_subject_progress
    set status = 'PASS'
    where id = (
      select ssp.id
      from public.student_subject_progress ssp
      where ssp.level_progress_id = (
        select id
        from public.student_level_progress
        where enrollment_id = (
          select id
          from public.student_curriculum_enrollments
          where student_id = '22222222-2222-2222-2222-222222222222'
            and curriculum_id = '33333333-3333-3333-3333-333333333333'
          limit 1
        )
          and level_id = '44444444-4444-4444-4444-444444444442'
      )
      order by ssp.created_at
      limit 1
    );
  $$,
  'P0001',
  'Academic progress cannot be updated before the scheduled start date',
  'future upgraded level progress is blocked before start date'
);


select * from finish();

rollback;