-- A verified subject is enough for timetable membership. Grade and progress
-- stay independent. The future dates below are synthetic test fixtures only,
-- not approved dates for any real student; the transaction rolls back below.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

insert into public.branches(id, code, name, status) values
  ('f2400000-0000-4000-8000-000000000001', 'TEST_CT_GRADE_PENDING', 'TEST CT Grade Pending', 'ACTIVE');
insert into public.curriculums(id, code, name, status) values
  ('f2400000-0000-4000-8000-000000000010', 'TEST_CT_PIANO_PENDING', 'TEST Piano', 'ACTIVE'),
  ('f2400000-0000-4000-8000-000000000011', 'TEST_CT_GUITAR_PENDING', 'TEST Guitar', 'ACTIVE');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status) values
  ('f2400000-0000-4000-8000-000000000021', 'f2400000-0000-4000-8000-000000000010', 'G1', 'Grade 1', 1, 'ACTIVE'),
  ('f2400000-0000-4000-8000-000000000025', 'f2400000-0000-4000-8000-000000000010', 'G5', 'Grade 5', 5, 'ACTIVE');
insert into public.courses(id, curriculum_id, code, name, status) values
  ('f2400000-0000-4000-8000-000000000030', 'f2400000-0000-4000-8000-000000000010', 'TEST_CT_PENDING_COURSE', 'TEST Piano Course', 'ACTIVE');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status) values
  ('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000001', 'f2400000-0000-4000-8000-000000000030', 'TEST_CT_PENDING_CLASS', 'TEST Mixed Piano', 'GROUP', 8, 'ACTIVE');
insert into public.rooms(id, branch_id, code, name, capacity) values
  ('f2400000-0000-4000-8000-000000000050', 'f2400000-0000-4000-8000-000000000001', 'TEST_CT_PENDING_ROOM', 'TEST Room', 8);
insert into auth.users(id) values
  ('f2400000-0000-4000-8000-000000000061'),
  ('f2400000-0000-4000-8000-000000000062'),
  ('f2400000-0000-4000-8000-000000000065'),
  ('f2400000-0000-4000-8000-000000000066');
insert into public.profiles(id, full_name, status) values
  ('f2400000-0000-4000-8000-000000000061', 'TEST Student Account', 'ACTIVE'),
  ('f2400000-0000-4000-8000-000000000062', 'TEST Teacher Account', 'ACTIVE'),
  ('f2400000-0000-4000-8000-000000000065', 'TEST Global Operations Lead', 'ACTIVE'),
  ('f2400000-0000-4000-8000-000000000066', 'TEST Scoped Operations Lead', 'ACTIVE');
insert into public.roles(code, name) values
  ('OPERATIONS_LEAD', 'TEST Operations Lead') on conflict (code) do nothing;
insert into public.user_roles(user_id, role_id, branch_id)
select 'f2400000-0000-4000-8000-000000000061', id, 'f2400000-0000-4000-8000-000000000001'
from public.roles where code = 'STUDENT';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f2400000-0000-4000-8000-000000000061', id, null
from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f2400000-0000-4000-8000-000000000062', id, 'f2400000-0000-4000-8000-000000000001'
from public.roles where code = 'TEACHER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f2400000-0000-4000-8000-000000000065', id, null
from public.roles where code = 'OPERATIONS_LEAD';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f2400000-0000-4000-8000-000000000066', id,
       'f2400000-0000-4000-8000-000000000001'
from public.roles where code = 'OPERATIONS_LEAD';
insert into public.teachers(id, user_id, teacher_code, full_name, status) values
  ('f2400000-0000-4000-8000-000000000063', 'f2400000-0000-4000-8000-000000000062', 'TEST_CT_PENDING_TEACHER', 'TEST Teacher', 'ACTIVE');
insert into public.teacher_branches(teacher_id, branch_id) values
  ('f2400000-0000-4000-8000-000000000063', 'f2400000-0000-4000-8000-000000000001');
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at) values
  ('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000063', 'PRIMARY', true, current_date - 1);
insert into public.schedules(id, class_id, room_id, day_of_week, start_time, end_time, effective_from, status) values
  ('f2400000-0000-4000-8000-000000000070', 'f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000050',
   extract(isodow from current_date + 1)::smallint, '16:00', '17:00', current_date, 'ACTIVE');

insert into public.students(id, student_code, full_name, default_branch_id, status, user_id) values
  ('f2400000-0000-4000-8000-000000000101', 'TEST_CT_PENDING_1', 'TEST Pending', 'f2400000-0000-4000-8000-000000000001', 'ACTIVE', 'f2400000-0000-4000-8000-000000000061'),
  ('f2400000-0000-4000-8000-000000000102', 'TEST_CT_PENDING_2', 'TEST Known Grade', 'f2400000-0000-4000-8000-000000000001', 'ACTIVE', null),
  ('f2400000-0000-4000-8000-000000000103', 'TEST_CT_PENDING_3', 'TEST Unknown Subject', 'f2400000-0000-4000-8000-000000000001', 'ACTIVE', null),
  ('f2400000-0000-4000-8000-000000000104', 'TEST_CT_PENDING_4', 'TEST Held Reference', 'f2400000-0000-4000-8000-000000000001', 'ACTIVE', null),
  ('f2400000-0000-4000-8000-000000000105', 'TEST_CT_PENDING_5', 'TEST Wrong Subject', 'f2400000-0000-4000-8000-000000000001', 'ACTIVE', null),
  ('f2400000-0000-4000-8000-000000000106', 'TEST_CT_PENDING_6', 'TEST Paused Academic', 'f2400000-0000-4000-8000-000000000001', 'ACTIVE', null);

insert into public.legacy_student_opening_batches
  (import_batch_id, source_system, source_file, source_sha256, authorization_sha256,
   rules_version, branch_id, cutover_date, source_shape, source_payload, status)
values
  ('f2400000-0000-4000-8000-000000000080', 'TEST_CT_PENDING', 'test-only.xlsx',
   repeat('a', 64), repeat('b', 64), 'TEST',
   'f2400000-0000-4000-8000-000000000001', current_date, 'TEST', '{}'::jsonb, 'IMPORTED');
insert into public.legacy_student_opening_rows
  (import_batch_id, source_reference, source_excel_row, identity_key,
   raw_payload, normalized_payload, disposition, reason, profile_action,
   target_student_id, curriculum_id, program_state, is_unlimited,
   date_state, term_state, legacy_paid_attested, opening_outstanding_attested,
   currency, review_reasons)
values
  ('f2400000-0000-4000-8000-000000000080', 'TEST-PENDING', 1, 'TEST-PENDING',
   '{}'::jsonb, '{}'::jsonb, 'IMPORT', 'test', 'LINKED_EXISTING',
   'f2400000-0000-4000-8000-000000000101', 'f2400000-0000-4000-8000-000000000010',
   'MAPPED_AWAITING_ACADEMIC_START', false, 'MISSING', 'PENDING_REVIEW', false, 0, 'VND', '{}'::text[]),
  ('f2400000-0000-4000-8000-000000000080', 'TEST-HELD', 2, 'TEST-HELD',
   '{}'::jsonb, '{}'::jsonb, 'HELD', 'test', 'HELD',
   'f2400000-0000-4000-8000-000000000104', 'f2400000-0000-4000-8000-000000000010',
   'OUTSIDE_SCOPE', false, 'MISSING', 'PENDING_REVIEW', false, 0, 'VND', '{}'::text[]),
  ('f2400000-0000-4000-8000-000000000080', 'TEST-WRONG', 3, 'TEST-WRONG',
   '{}'::jsonb, '{}'::jsonb, 'IMPORT', 'test', 'LINKED_EXISTING',
   'f2400000-0000-4000-8000-000000000105', 'f2400000-0000-4000-8000-000000000011',
   'MAPPED_AWAITING_ACADEMIC_START', false, 'MISSING', 'PENDING_REVIEW', false, 0, 'VND', '{}'::text[]),
  ('f2400000-0000-4000-8000-000000000080', 'TEST-INACTIVE', 4, 'TEST-INACTIVE',
   '{}'::jsonb, '{}'::jsonb, 'IMPORT', 'test', 'LINKED_EXISTING',
   'f2400000-0000-4000-8000-000000000106', 'f2400000-0000-4000-8000-000000000010',
   'MAPPED_AWAITING_ACADEMIC_START', false, 'MISSING', 'PENDING_REVIEW', false, 0, 'VND', '{}'::text[]);

insert into public.student_curriculum_enrollments
  (student_id, curriculum_id, current_level_id, status, started_at, is_primary)
values
  ('f2400000-0000-4000-8000-000000000102', 'f2400000-0000-4000-8000-000000000010', 'f2400000-0000-4000-8000-000000000025', 'ACTIVE', current_date - 7, true),
  ('f2400000-0000-4000-8000-000000000106', 'f2400000-0000-4000-8000-000000000010', 'f2400000-0000-4000-8000-000000000021', 'PAUSED', current_date - 7, true);

select has_function('public', 'has_verified_legacy_schedule_program', array['uuid','uuid','uuid'], 'subject evidence helper exists');
select has_table('maintenance_private', 'ct_schedule_import_batches', 'private import batch audit exists');
select has_table('maintenance_private', 'ct_schedule_import_rows', 'private import row audit exists');
select set_config('request.jwt.claim.sub', 'f2400000-0000-4000-8000-000000000061', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is(public.has_verified_legacy_schedule_program(
    'f2400000-0000-4000-8000-000000000101', 'f2400000-0000-4000-8000-000000000010',
    'f2400000-0000-4000-8000-000000000001'), true,
  'authorized admin may verify the subject without reading raw legacy payload');
select is(public.has_verified_legacy_schedule_program(
    'f2400000-0000-4000-8000-000000000101', 'f2400000-0000-4000-8000-000000000010',
    'f2400000-0000-4000-8000-000000000999'), false,
  'subject evidence cannot cross branches');
select set_config('request.jwt.claim.sub', 'f2400000-0000-4000-8000-000000000065', true);
select is(public.has_verified_legacy_schedule_program(
    'f2400000-0000-4000-8000-000000000101', 'f2400000-0000-4000-8000-000000000010',
    'f2400000-0000-4000-8000-000000000001'), true,
  'active global operations lead retains the production authorization');
select set_config('request.jwt.claim.sub', 'f2400000-0000-4000-8000-000000000066', true);
select is(public.has_verified_legacy_schedule_program(
    'f2400000-0000-4000-8000-000000000101', 'f2400000-0000-4000-8000-000000000010',
    'f2400000-0000-4000-8000-000000000001'), false,
  'branch-scoped operations lead does not gain global authorization');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000101'), 'IN_SCOPE', 'verified subject without Grade can enter an unrestricted mixed class');
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000102'), 'IN_SCOPE', 'existing valid Grade remains eligible in an unrestricted mixed class');
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000103'), 'ACADEMIC_PROGRAM_MISSING', 'no subject evidence stays blocked');
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000104'), 'ACADEMIC_PROGRAM_MISSING', 'held source row does not become active placement');
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000105'), 'ACADEMIC_PROGRAM_MISSING', 'another subject cannot be substituted');
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000106'), 'ACADEMIC_PROGRAM_INACTIVE', 'paused Academic program is not silently resumed');

update public.classes set accepted_from_level_id = 'f2400000-0000-4000-8000-000000000021',
  accepted_to_level_id = 'f2400000-0000-4000-8000-000000000021'
where id = 'f2400000-0000-4000-8000-000000000040';
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000101'), 'IN_SCOPE', 'pending Grade remains schedulable in a Grade-scoped class');
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000102'), 'OUTSIDE_SCOPE', 'known Grade outside configured range stays blocked');
update public.classes set accepted_from_level_id = null, accepted_to_level_id = null
where id = 'f2400000-0000-4000-8000-000000000040';

select set_config('registration.write', 'on', true);
select throws_ok($$insert into public.enrollments
  (id, student_id, class_id, enrolled_at, started_at, status)
  values ('f2400000-0000-4000-8000-000000000099',
          'f2400000-0000-4000-8000-000000000101',
          'f2400000-0000-4000-8000-000000000040', current_date, null, 'ACTIVE')$$,
  'P0001', 'PLACEMENT_START_DENIED',
  'ACTIVE placement cannot bypass approval by omitting operational start');
select lives_ok($$insert into public.enrollments
  (id, student_id, class_id, enrolled_at, started_at, status)
  values ('f2400000-0000-4000-8000-000000000091',
          'f2400000-0000-4000-8000-000000000101',
          'f2400000-0000-4000-8000-000000000040', current_date, current_date + 1, 'ACTIVE')$$,
  'pending Academic student is enrolled through all active DB guards');
select lives_ok($$insert into public.enrollments
  (id, student_id, class_id, enrolled_at, started_at, status)
  values ('f2400000-0000-4000-8000-000000000092',
          'f2400000-0000-4000-8000-000000000102',
          'f2400000-0000-4000-8000-000000000040', current_date, current_date + 1, 'ACTIVE')$$,
  'same class accepts another student with a known Grade');
select set_config('registration.write', 'off', true);
select is((select count(*) from public.student_curriculum_enrollments where student_id = 'f2400000-0000-4000-8000-000000000101'), 0::bigint, 'enrollment creates no fake Grade or Academic program');
select is((select count(*) from public.enrollment_tuition where enrollment_id in
  ('f2400000-0000-4000-8000-000000000091', 'f2400000-0000-4000-8000-000000000092')),
  0::bigint, 'synthetic placement does not create tuition');
select is((select count(*) from public.notification_jobs where student_id in
  ('f2400000-0000-4000-8000-000000000101', 'f2400000-0000-4000-8000-000000000102')),
  0::bigint, 'synthetic placement does not queue a notification');

insert into public.session_occurrences
  (id, schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type)
values
  ('f2400000-0000-4000-8000-000000000093',
   'f2400000-0000-4000-8000-000000000070', current_date + 1,
   (current_date + 1 + time '16:00') at time zone 'Asia/Ho_Chi_Minh',
   (current_date + 1 + time '17:00') at time zone 'Asia/Ho_Chi_Minh',
   'f2400000-0000-4000-8000-000000000050', 'SCHEDULED', 'REGULAR');

select is((select count(*) from public.session_teaching_roster('f2400000-0000-4000-8000-000000000093')), 2::bigint, 'session roster includes pending and known Grade students');
select set_config('request.jwt.claim.sub', 'f2400000-0000-4000-8000-000000000061', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*) from public.portal_upcoming_sessions('f2400000-0000-4000-8000-000000000101', 0)), 1::bigint, 'student sees the dated lesson without Grade');

select set_config('request.jwt.claim.sub', 'f2400000-0000-4000-8000-000000000062', true);
select is(jsonb_array_length(public.teacher_session_workspace('f2400000-0000-4000-8000-000000000093')->'participants'), 2, 'teacher sees both students in one session');
select is((select value->'academic' from jsonb_array_elements(public.teacher_session_workspace('f2400000-0000-4000-8000-000000000093')->'participants') value where value->>'student_id' = 'f2400000-0000-4000-8000-000000000101'), 'null'::jsonb, 'pending student has no invented academic record');
select lives_ok($$select public.teacher_session_write('f2400000-0000-4000-8000-000000000093', 'attendance', 'f2400000-0000-4000-8000-000000000091', '{"status":"PRESENT"}'::jsonb)$$, 'teacher may mark attendance without Grade');
select is((select count(*) from public.attendance_records where enrollment_id = 'f2400000-0000-4000-8000-000000000091'), 1::bigint, 'attendance persists on the original enrollment');

select set_config('request.jwt.claim.sub', '', true);
insert into public.student_curriculum_enrollments
  (student_id, curriculum_id, current_level_id, status, started_at, is_primary)
values
  ('f2400000-0000-4000-8000-000000000101', 'f2400000-0000-4000-8000-000000000010', 'f2400000-0000-4000-8000-000000000021', 'ACTIVE', current_date + 1, true);
select is(public.class_enrollment_compatibility('f2400000-0000-4000-8000-000000000040', 'f2400000-0000-4000-8000-000000000101'), 'IN_SCOPE', 'later Academic assignment retains placement');
select is((select count(*) from public.enrollments where student_id = 'f2400000-0000-4000-8000-000000000101' and class_id = 'f2400000-0000-4000-8000-000000000040'), 1::bigint, 'later Academic assignment does not duplicate enrollment');
select is((select student_curriculum_enrollment_id from public.enrollments where id = 'f2400000-0000-4000-8000-000000000091'), null::uuid, 'original enrollment ID and nullable academic pointer are preserved');

-- Rollback rehearsals use synthetic import ledger rows and never commit them.
insert into maintenance_private.ct_schedule_import_batches
  (import_batch_id, source_sha256, plan_sha256, branch_id,
   approved_enrollment_start_on, status)
values
  ('f2400000-0000-4000-8000-0000000000a1', repeat('c', 64), repeat('d', 64),
   'f2400000-0000-4000-8000-000000000001', current_date + 1, 'IMPORTED');
insert into maintenance_private.ct_schedule_import_rows
  (import_batch_id, source_reference, student_id, class_id,
   enrollment_id, enrollment_id_snapshot, action, enrollment_before,
   enrollment_after)
select 'f2400000-0000-4000-8000-0000000000a1', 'TEST-CREATED',
       enrollment.student_id, enrollment.class_id, enrollment.id, enrollment.id,
       'CREATED', null, to_jsonb(enrollment)
from public.enrollments enrollment
where enrollment.id = 'f2400000-0000-4000-8000-000000000092';
insert into maintenance_private.ct_schedule_import_rows
  (import_batch_id, source_reference, student_id, class_id,
   enrollment_id, enrollment_id_snapshot, action, enrollment_before,
   enrollment_after)
select 'f2400000-0000-4000-8000-0000000000a1', 'TEST-EXISTING',
       enrollment.student_id, enrollment.class_id, enrollment.id, enrollment.id,
       'EXISTING', to_jsonb(enrollment), to_jsonb(enrollment)
from public.enrollments enrollment
where enrollment.id = 'f2400000-0000-4000-8000-000000000091';
select is((maintenance_private.rollback_ct_schedule_import('f2400000-0000-4000-8000-0000000000a1')->>'deleted_enrollments')::integer,
  1, 'rollback deletes exactly the created enrollment');
select is((select count(*) from public.enrollments where id = 'f2400000-0000-4000-8000-000000000092'),
  0::bigint, 'created enrollment is absent after rollback');
select is((select count(*) from public.enrollments where id = 'f2400000-0000-4000-8000-000000000091'),
  1::bigint, 'pre-existing enrollment and its attendance are preserved');
select is((select status from maintenance_private.ct_schedule_import_batches where import_batch_id = 'f2400000-0000-4000-8000-0000000000a1'),
  'ROLLED_BACK', 'rollback marks batch as reversed');
select is((maintenance_private.rollback_ct_schedule_import('f2400000-0000-4000-8000-0000000000a1')->>'already_rolled_back')::boolean,
  true, 'repeated rollback is idempotent');
select throws_ok($$insert into maintenance_private.ct_schedule_import_batches
    (import_batch_id, source_sha256, plan_sha256, branch_id,
     approved_enrollment_start_on, status)
    values ('f2400000-0000-4000-8000-0000000000a2', repeat('c', 64), repeat('d', 64),
            'f2400000-0000-4000-8000-000000000001', current_date + 1, 'IMPORTED')$$,
  '23505', null, 'same source, plan, branch, and approved date cannot create a second batch');

select set_config('registration.write', 'on', true);
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status)
values ('f2400000-0000-4000-8000-000000000094', 'f2400000-0000-4000-8000-000000000102',
        'f2400000-0000-4000-8000-000000000040', current_date, current_date + 1, 'ACTIVE');
select set_config('registration.write', 'off', true);
insert into maintenance_private.ct_schedule_import_batches
  (import_batch_id, source_sha256, plan_sha256, branch_id,
   approved_enrollment_start_on, status)
values ('f2400000-0000-4000-8000-0000000000a3', repeat('e', 64), repeat('f', 64),
        'f2400000-0000-4000-8000-000000000001', current_date + 1, 'IMPORTED');
insert into maintenance_private.ct_schedule_import_rows
  (import_batch_id, source_reference, student_id, class_id,
   enrollment_id, enrollment_id_snapshot, action, enrollment_before,
   enrollment_after)
select 'f2400000-0000-4000-8000-0000000000a3', 'TEST-EDITED',
       enrollment.student_id, enrollment.class_id, enrollment.id, enrollment.id,
       'CREATED', null, to_jsonb(enrollment)
from public.enrollments enrollment
where enrollment.id = 'f2400000-0000-4000-8000-000000000094';
update public.enrollments set notes = 'edited after synthetic import'
where id = 'f2400000-0000-4000-8000-000000000094';
select throws_ok($$select maintenance_private.rollback_ct_schedule_import('f2400000-0000-4000-8000-0000000000a3')$$,
  'P0001', 'Imported enrollment changed; manual reconciliation required',
  'rollback refuses an edited enrollment');
select is((select count(*) from public.enrollments where id = 'f2400000-0000-4000-8000-000000000094'),
  1::bigint, 'edited enrollment remains intact after refusal');

insert into public.student_curriculum_enrollments
  (student_id, curriculum_id, current_level_id, status, started_at, is_primary)
values ('f2400000-0000-4000-8000-000000000103', 'f2400000-0000-4000-8000-000000000010',
        'f2400000-0000-4000-8000-000000000021', 'ACTIVE', current_date + 1, true);
select set_config('registration.write', 'on', true);
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status)
values ('f2400000-0000-4000-8000-000000000095', 'f2400000-0000-4000-8000-000000000103',
        'f2400000-0000-4000-8000-000000000040', current_date, current_date + 1, 'ACTIVE');
select set_config('registration.write', 'off', true);
insert into maintenance_private.ct_schedule_import_batches
  (import_batch_id, source_sha256, plan_sha256, branch_id,
   approved_enrollment_start_on, status)
values ('f2400000-0000-4000-8000-0000000000a4', repeat('1', 64), repeat('2', 64),
        'f2400000-0000-4000-8000-000000000001', current_date + 1, 'IMPORTED');
insert into maintenance_private.ct_schedule_import_rows
  (import_batch_id, source_reference, student_id, class_id,
   enrollment_id, enrollment_id_snapshot, action, enrollment_before,
   enrollment_after)
select 'f2400000-0000-4000-8000-0000000000a4', 'TEST-ATTENDED',
       enrollment.student_id, enrollment.class_id, enrollment.id, enrollment.id,
       'CREATED', null, to_jsonb(enrollment)
from public.enrollments enrollment
where enrollment.id = 'f2400000-0000-4000-8000-000000000095';
select set_config('request.jwt.claim.sub', 'f2400000-0000-4000-8000-000000000062', true);
select public.teacher_session_write('f2400000-0000-4000-8000-000000000093', 'attendance',
  'f2400000-0000-4000-8000-000000000095', '{"status":"PRESENT"}'::jsonb);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select maintenance_private.rollback_ct_schedule_import('f2400000-0000-4000-8000-0000000000a4')$$,
  'P0001', null, 'rollback refuses an enrollment with attendance dependency');
select is((select count(*) from public.enrollments where id = 'f2400000-0000-4000-8000-000000000095'),
  1::bigint, 'attended enrollment remains intact after refusal');

select * from finish();
rollback;
