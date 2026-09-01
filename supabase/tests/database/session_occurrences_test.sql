begin;

create extension if not exists pgtap
with schema extensions;

select plan(8);

insert into public.branches (
  id,
  code,
  name
)
values (
  '10000000-0000-0000-0000-000000000001',
  'TEST-BRANCH',
  'Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '20000000-0000-0000-0000-000000000001',
  'TEST-CURRICULUM',
  'Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'TEST-LEVEL',
  'Test Level',
  1
);

insert into public.courses (
  id,
  curriculum_id,
  level_id,
  code,
  name
)
values (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'TEST-COURSE',
  'Test Course'
);

insert into public.classes (
  id,
  branch_id,
  course_id,
  code,
  name,
  status
)
values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'TEST-CLASS',
  'Test Class',
  'ACTIVE'
);

insert into public.rooms (
  id,
  branch_id,
  code,
  name
)
values (
  '60000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'TEST-ROOM',
  'Test Room'
);

insert into public.schedules (
  id,
  class_id,
  room_id,
  day_of_week,
  start_time,
  end_time,
  effective_from,
  effective_to,
  timezone,
  status
)
values (
  '70000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  1,
  '09:00',
  '10:00',
  '2026-09-01',
  '2026-09-30',
  'Asia/Ho_Chi_Minh',
  'ACTIVE'
);

select is(
  public.generate_session_occurrences(
    '2026-09-07',
    '2026-09-20'
  ),
  2,
  'generates one occurrence for each matching Monday'
);

select is(
  public.generate_session_occurrences(
    '2026-09-07',
    '2026-09-20'
  ),
  0,
  'repeated generation is idempotent'
);

select is(
  (
    select count(*)::integer
    from public.session_occurrences
    where schedule_id =
      '70000000-0000-0000-0000-000000000001'
  ),
  2,
  'stores exactly two occurrences'
);

select results_eq(
  $$
    select occurrence_date
    from public.session_occurrences
    where schedule_id =
      '70000000-0000-0000-0000-000000000001'
    order by occurrence_date
  $$,
  $$
    values
      (date '2026-09-07'),
      (date '2026-09-14')
  $$,
  'stores the expected occurrence dates'
);

select is(
  (
    select starts_at
    from public.session_occurrences
    where schedule_id =
      '70000000-0000-0000-0000-000000000001'
      and occurrence_date = '2026-09-07'
  ),
  timestamptz '2026-09-07 09:00:00+07',
  'converts local schedule time using its timezone'
);

select is(
  (
    select room_id
    from public.session_occurrences
    where schedule_id =
      '70000000-0000-0000-0000-000000000001'
      and occurrence_date = '2026-09-07'
  ),
  '60000000-0000-0000-0000-000000000001'::uuid,
  'snapshots the schedule room'
);

select throws_ok(
  $$
    select public.generate_session_occurrences(
      '2026-09-20',
      '2026-09-07'
    )
  $$,
  'P0001',
  'Generation end date cannot be before start date',
  'rejects a reversed date range'
);

select throws_ok(
  $$
    select public.generate_session_occurrences(
      '2026-01-01',
      '2027-01-03'
    )
  $$,
  'P0001',
  'Generation date range cannot exceed 366 days',
  'rejects a date range longer than 366 days'
);

select * from finish();

rollback;
