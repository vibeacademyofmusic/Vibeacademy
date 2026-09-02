begin;

create extension if not exists pgtap
with schema extensions;

select plan(27);

insert into public.branches (
  id,
  code,
  name
)
values (
  '16000000-0000-0000-0000-000000000001',
  'CREDIT-TEST-BRANCH',
  'Credit Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '26000000-0000-0000-0000-000000000001',
  'CREDIT-TEST-CURRICULUM',
  'Credit Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '36000000-0000-0000-0000-000000000001',
  '26000000-0000-0000-0000-000000000001',
  'CREDIT-TEST-LEVEL',
  'Credit Test Level',
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
  '46000000-0000-0000-0000-000000000001',
  '26000000-0000-0000-0000-000000000001',
  '36000000-0000-0000-0000-000000000001',
  'CREDIT-TEST-COURSE',
  'Credit Test Course'
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
  '56000000-0000-0000-0000-000000000001',
  '16000000-0000-0000-0000-000000000001',
  '46000000-0000-0000-0000-000000000001',
  'CREDIT-TEST-CLASS',
  'Credit Test Class',
  'ACTIVE'
);

insert into public.rooms (
  id,
  branch_id,
  code,
  name,
  status
)
values (
  '56000000-0000-0000-0000-000000000011',
  '16000000-0000-0000-0000-000000000001',
  'CREDIT-TEST-ROOM',
  'Credit Test Room',
  'ACTIVE'
);

insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values
  (
    '66000000-0000-0000-0000-000000000001',
    'CREDIT-TEST-STUDENT-A',
    '16000000-0000-0000-0000-000000000001',
    'Credit Test Student A'
  ),
  (
    '66000000-0000-0000-0000-000000000002',
    'CREDIT-TEST-STUDENT-B',
    '16000000-0000-0000-0000-000000000001',
    'Credit Test Student B'
  ),
  (
    '66000000-0000-0000-0000-000000000003',
    'CREDIT-TEST-STUDENT-C',
    '16000000-0000-0000-0000-000000000001',
    'Credit Test Student C'
  ),
  (
    '66000000-0000-0000-0000-000000000004',
    'CREDIT-TEST-STUDENT-D',
    '16000000-0000-0000-0000-000000000001',
    'Credit Test Student D'
  );

insert into public.enrollments (
  id,
  student_id,
  class_id,
  started_at,
  status
)
values
  (
    '76000000-0000-0000-0000-000000000001',
    '66000000-0000-0000-0000-000000000001',
    '56000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '76000000-0000-0000-0000-000000000002',
    '66000000-0000-0000-0000-000000000002',
    '56000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '76000000-0000-0000-0000-000000000003',
    '66000000-0000-0000-0000-000000000003',
    '56000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '76000000-0000-0000-0000-000000000004',
    '66000000-0000-0000-0000-000000000004',
    '56000000-0000-0000-0000-000000000001',
    '2026-09-15',
    'ACTIVE'
  );

insert into public.schedules (
  id,
  class_id,
  room_id,
  day_of_week,
  start_time,
  end_time,
  effective_from,
  timezone,
  status
)
values (
  '86000000-0000-0000-0000-000000000001',
  '56000000-0000-0000-0000-000000000001',
  '56000000-0000-0000-0000-000000000011',
  1,
  '09:00',
  '10:00',
  '2026-09-01',
  'Asia/Ho_Chi_Minh',
  'ACTIVE'
);

insert into public.session_occurrences (
  id,
  schedule_id,
  occurrence_date,
  starts_at,
  ends_at,
  room_id,
  status
)
values
  (
    '96000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001',
    '2026-09-07',
    '2026-09-07 09:00:00+07',
    '2026-09-07 10:00:00+07',
    '56000000-0000-0000-0000-000000000011',
    'SCHEDULED'
  ),
  (
    '96000000-0000-0000-0000-000000000002',
    '86000000-0000-0000-0000-000000000001',
    '2026-09-14',
    '2026-09-14 09:00:00+07',
    '2026-09-14 10:00:00+07',
    '56000000-0000-0000-0000-000000000011',
    'SCHEDULED'
  );

insert into public.attendance_records (
  session_occurrence_id,
  enrollment_id,
  status
)
values
  (
    '96000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000001',
    'EXCUSED'
  ),
  (
    '96000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000002',
    'PRESENT'
  ),
  (
    '96000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000003',
    'ABSENT'
  );

select is(
  public.set_session_occurrence_status(
    '96000000-0000-0000-0000-000000000001',
    'COMPLETED'
  ),
  'COMPLETED',
  'completes a fully marked regular source session'
);

select ok(
  (
    select
      count(*) = 1
      and bool_and(
        enrollment_id =
          '76000000-0000-0000-0000-000000000001'
        and source_reason = 'EXCUSED'
        and status = 'AVAILABLE'
        and source_attendance_record_id is not null
      )
    from public.makeup_credits
    where source_occurrence_id =
      '96000000-0000-0000-0000-000000000001'
  ),
  'creates one available credit for the excused student'
);

select is(
  (
    select count(*)
    from public.makeup_credits
    where source_occurrence_id =
        '96000000-0000-0000-0000-000000000001'
      and enrollment_id in (
        '76000000-0000-0000-0000-000000000002',
        '76000000-0000-0000-0000-000000000003'
      )
  ),
  0::bigint,
  'does not grant credits for present or absent attendance'
);

select throws_ok(
  $$
    update public.attendance_records
    set notes = 'Too late to edit'
    where session_occurrence_id =
      '96000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Attendance can only be changed while the session is scheduled',
  'locks attendance after a regular session is completed'
);

select is(
  public.set_session_occurrence_status(
    '96000000-0000-0000-0000-000000000002',
    'CANCELLED'
  ),
  'CANCELLED',
  'cancels a regular source session without attendance'
);

select ok(
  (
    select
      count(*) = 3
      and bool_and(
        source_reason = 'SESSION_CANCELLED'
        and source_attendance_record_id is null
        and status = 'AVAILABLE'
      )
    from public.makeup_credits
    where source_occurrence_id =
      '96000000-0000-0000-0000-000000000002'
  ),
  'grants every source-date roster member a cancellation credit'
);

select is(
  public.set_session_occurrence_status(
    '96000000-0000-0000-0000-000000000002',
    'SCHEDULED'
  ),
  'SCHEDULED',
  'reopens a source while all credits remain available'
);

select ok(
  (
    select
      count(*) = 3
      and bool_and(
        status = 'CANCELLED'
        and cancelled_at is not null
      )
    from public.makeup_credits
    where source_occurrence_id =
      '96000000-0000-0000-0000-000000000002'
  ),
  'cancels unused credits when their source is reopened'
);

select is(
  public.set_session_occurrence_status(
    '96000000-0000-0000-0000-000000000002',
    'CANCELLED'
  ),
  'CANCELLED',
  'allows the reopened source to be cancelled again'
);

select ok(
  (
    select
      count(*) = 3
      and bool_and(
        status = 'AVAILABLE'
        and cancelled_at is null
      )
    from public.makeup_credits
    where source_occurrence_id =
      '96000000-0000-0000-0000-000000000002'
  ),
  'reactivates source credits idempotently after re-cancellation'
);

create temporary table credit_makeup_result (
  id uuid not null
) on commit drop;

select lives_ok(
  $$
    insert into credit_makeup_result (id)
    select public.create_makeup_session_occurrence(
      '96000000-0000-0000-0000-000000000001',
      '2026-09-20 10:00:00+07',
      '2026-09-20 11:00:00+07',
      '56000000-0000-0000-0000-000000000011',
      array[
        '76000000-0000-0000-0000-000000000001'::uuid,
        '76000000-0000-0000-0000-000000000002'::uuid
      ],
      'Credit ledger test makeup'
    )
  $$,
  'creates a makeup from credits with different sources'
);

select ok(
  (
    select
      count(*) = 2
      and count(distinct participant.makeup_credit_id) = 2
      and bool_and(credit.status = 'RESERVED')
    from public.session_occurrence_participants as participant
    join credit_makeup_result as result
      on result.id = participant.session_occurrence_id
    join public.makeup_credits as credit
      on credit.id = participant.makeup_credit_id
  ),
  'links two distinct reserved credits to the makeup roster'
);

select ok(
  (
    select
      count(*) filter (
        where participant.enrollment_id =
            '76000000-0000-0000-0000-000000000001'
          and credit.source_occurrence_id =
            '96000000-0000-0000-0000-000000000001'
      ) = 1
      and count(*) filter (
        where participant.enrollment_id =
            '76000000-0000-0000-0000-000000000002'
          and credit.source_occurrence_id =
            '96000000-0000-0000-0000-000000000002'
      ) = 1
    from public.session_occurrence_participants as participant
    join credit_makeup_result as result
      on result.id = participant.session_occurrence_id
    join public.makeup_credits as credit
      on credit.id = participant.makeup_credit_id
  ),
  'reserves the oldest available same-class credit per student'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '96000000-0000-0000-0000-000000000001',
      '2026-09-22 10:00:00+07',
      '2026-09-22 11:00:00+07',
      '56000000-0000-0000-0000-000000000011',
      array['76000000-0000-0000-0000-000000000004'::uuid],
      'Student without credit'
    )
  $$,
  'P0001',
  'Selected student does not have an available makeup credit for this class',
  'rejects a student without an available credit'
);

select is(
  (
    select count(*)
    from public.session_occurrences
    where occurrence_type = 'MAKEUP'
  ),
  1::bigint,
  'rolls back the whole makeup when credit reservation fails'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '96000000-0000-0000-0000-000000000001',
      'SCHEDULED'
    )
  $$,
  'P0001',
  'Cannot reopen a source session while its makeup credit is reserved or used',
  'prevents reopening a source with a reserved credit'
);

select lives_ok(
  $$
    delete from public.session_occurrence_participants
    where session_occurrence_id =
        (select id from credit_makeup_result)
      and enrollment_id =
        '76000000-0000-0000-0000-000000000002'
  $$,
  'removes an unattended participant from a scheduled makeup'
);

select ok(
  (
    select
      status = 'AVAILABLE'
      and reserved_occurrence_id is null
      and reserved_at is null
    from public.makeup_credits
    where source_occurrence_id =
        '96000000-0000-0000-0000-000000000002'
      and enrollment_id =
        '76000000-0000-0000-0000-000000000002'
  ),
  'returns the credit when a participant is removed'
);

insert into public.session_occurrence_participants (
  session_occurrence_id,
  enrollment_id
)
select
  result.id,
  '76000000-0000-0000-0000-000000000002'
from credit_makeup_result as result;

insert into public.attendance_records (
  session_occurrence_id,
  enrollment_id,
  status
)
select
  result.id,
  participant.enrollment_id,
  'PRESENT'
from credit_makeup_result as result
join public.session_occurrence_participants as participant
  on participant.session_occurrence_id = result.id;

select is(
  public.set_session_occurrence_status(
    (select id from credit_makeup_result),
    'COMPLETED'
  ),
  'COMPLETED',
  'completes a fully marked makeup session'
);

select ok(
  (
    select
      count(*) = 2
      and bool_and(
        credit.status = 'USED'
        and credit.used_at is not null
      )
    from public.makeup_credits as credit
    where credit.reserved_occurrence_id =
      (select id from credit_makeup_result)
  ),
  'consumes every reserved credit when makeup is completed'
);

select throws_ok(
  $$
    update public.attendance_records
    set notes = 'Finalized makeup edit'
    where session_occurrence_id =
      (select id from credit_makeup_result)
  $$,
  'P0001',
  'Attendance can only be changed while the session is scheduled',
  'locks attendance after a makeup session is completed'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      (select id from credit_makeup_result),
      'SCHEDULED'
    )
  $$,
  'P0001',
  'Completed or cancelled makeup sessions cannot be reopened',
  'prevents reopening a completed makeup session'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '96000000-0000-0000-0000-000000000001',
      'SCHEDULED'
    )
  $$,
  'P0001',
  'Cannot reopen a source session while its makeup credit is reserved or used',
  'prevents reopening a source after its credit is used'
);

create temporary table cancelled_makeup_result (
  id uuid not null
) on commit drop;

select lives_ok(
  $$
    insert into cancelled_makeup_result (id)
    select public.create_makeup_session_occurrence(
      '96000000-0000-0000-0000-000000000002',
      '2026-09-22 10:00:00+07',
      '2026-09-22 11:00:00+07',
      '56000000-0000-0000-0000-000000000011',
      array['76000000-0000-0000-0000-000000000003'::uuid],
      'Cancelled makeup test'
    )
  $$,
  'creates another makeup with an available credit'
);

select is(
  public.set_session_occurrence_status(
    (select id from cancelled_makeup_result),
    'CANCELLED'
  ),
  'CANCELLED',
  'cancels a makeup session without attendance'
);

select ok(
  (
    select
      status = 'AVAILABLE'
      and reserved_occurrence_id is null
      and reserved_at is null
      and used_at is null
    from public.makeup_credits
    where source_occurrence_id =
        '96000000-0000-0000-0000-000000000002'
      and enrollment_id =
        '76000000-0000-0000-0000-000000000003'
  ),
  'returns a reserved credit when makeup is cancelled'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      (select id from cancelled_makeup_result),
      'SCHEDULED'
    )
  $$,
  'P0001',
  'Completed or cancelled makeup sessions cannot be reopened',
  'prevents reopening a cancelled makeup session'
);

select * from finish();

rollback;
