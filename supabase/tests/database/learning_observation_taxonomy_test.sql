begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values ('f9100000-0000-4000-8000-000000000001', 'TAX-A', 'Taxonomy A');
insert into auth.users(id) values
  ('f9200000-0000-4000-8000-000000000001'),
  ('f9200000-0000-4000-8000-000000000002'),
  ('f9200000-0000-4000-8000-000000000003'),
  ('f9200000-0000-4000-8000-000000000004'),
  ('f9200000-0000-4000-8000-000000000005'),
  ('f9200000-0000-4000-8000-000000000006');
insert into public.profiles(id, full_name, status) values
  ('f9200000-0000-4000-8000-000000000001', 'Tax Super', 'ACTIVE'),
  ('f9200000-0000-4000-8000-000000000002', 'Tax Teacher', 'ACTIVE'),
  ('f9200000-0000-4000-8000-000000000003', 'Tax Other', 'ACTIVE'),
  ('f9200000-0000-4000-8000-000000000004', 'Tax Admin', 'ACTIVE'),
  ('f9200000-0000-4000-8000-000000000005', 'Tax Parent', 'ACTIVE'),
  ('f9200000-0000-4000-8000-000000000006', 'Tax Student', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'f9200000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f9200000-0000-4000-8000-000000000002', id, 'f9100000-0000-4000-8000-000000000001' from public.roles where code = 'TEACHER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f9200000-0000-4000-8000-000000000003', id, 'f9100000-0000-4000-8000-000000000001' from public.roles where code = 'TEACHER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f9200000-0000-4000-8000-000000000004', id, 'f9100000-0000-4000-8000-000000000001' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f9200000-0000-4000-8000-000000000005', id, 'f9100000-0000-4000-8000-000000000001' from public.roles where code = 'PARENT';
insert into public.user_roles(user_id, role_id, branch_id)
select 'f9200000-0000-4000-8000-000000000006', id, 'f9100000-0000-4000-8000-000000000001' from public.roles where code = 'STUDENT';
insert into public.teachers(id, teacher_code, full_name, user_id, status) values
  ('f9300000-0000-4000-8000-000000000002', 'TAX-T', 'Tax Teacher', 'f9200000-0000-4000-8000-000000000002', 'ACTIVE'),
  ('f9300000-0000-4000-8000-000000000003', 'TAX-O', 'Tax Other', 'f9200000-0000-4000-8000-000000000003', 'ACTIVE');
insert into public.curriculums(id, code, name) values ('f9400000-0000-4000-8000-000000000001', 'TAX-CUR', 'Tax Curriculum');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values
  ('f9400000-0000-4000-8000-000000000002', 'f9400000-0000-4000-8000-000000000001', 'TAX-L', 'Level', 1);
insert into public.courses(id, curriculum_id, level_id, code, name) values
  ('f9400000-0000-4000-8000-000000000003', 'f9400000-0000-4000-8000-000000000001', 'f9400000-0000-4000-8000-000000000002', 'TAX-COURSE', 'Piano');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status) values
  ('f9500000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001', 'f9400000-0000-4000-8000-000000000003', 'TAX-CLASS', 'Tax Group', 'GROUP', 8, 'ACTIVE');
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at) values
  ('f9500000-0000-4000-8000-000000000001', 'f9300000-0000-4000-8000-000000000002', 'PRIMARY', true, '2026-09-01');
insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('f9600000-0000-4000-8000-000000000001', 'TAX-A', 'Tax Student A', 'f9100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('f9600000-0000-4000-8000-000000000002', 'TAX-B', 'Tax Student B', 'f9100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('f9600000-0000-4000-8000-000000000003', 'TAX-C', 'Tax Student C', 'f9100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('f9600000-0000-4000-8000-000000000004', 'TAX-D', 'Tax Student D', 'f9100000-0000-4000-8000-000000000001', 'ACTIVE');
insert into public.parents(id, parent_code, user_id, status) values
  ('f9600000-0000-4000-8000-000000000005', 'TAX-P', 'f9200000-0000-4000-8000-000000000005', 'ACTIVE');
insert into public.student_parents(student_id, parent_id, relationship, is_primary) values
  ('f9600000-0000-4000-8000-000000000001', 'f9600000-0000-4000-8000-000000000005', 'GUARDIAN', true);
insert into public.enrollments(id, student_id, class_id, started_at, status) values
  ('f9700000-0000-4000-8000-000000000001', 'f9600000-0000-4000-8000-000000000001', 'f9500000-0000-4000-8000-000000000001', '2026-09-01', 'ACTIVE'),
  ('f9700000-0000-4000-8000-000000000002', 'f9600000-0000-4000-8000-000000000002', 'f9500000-0000-4000-8000-000000000001', '2026-09-01', 'ACTIVE'),
  ('f9700000-0000-4000-8000-000000000003', 'f9600000-0000-4000-8000-000000000003', 'f9500000-0000-4000-8000-000000000001', '2026-09-01', 'ACTIVE'),
  ('f9700000-0000-4000-8000-000000000004', 'f9600000-0000-4000-8000-000000000004', 'f9500000-0000-4000-8000-000000000001', '2026-09-01', 'ACTIVE');
insert into public.schedules(id, class_id, day_of_week, start_time, end_time, effective_from, status) values
  ('f9800000-0000-4000-8000-000000000001', 'f9500000-0000-4000-8000-000000000001', 1, '09:00', '10:00', '2026-09-01', 'ACTIVE'),
  ('f9800000-0000-4000-8000-000000000002', 'f9500000-0000-4000-8000-000000000001', 3, '09:00', '10:00', '2026-09-01', 'ACTIVE');
insert into public.session_occurrences(id, schedule_id, occurrence_date, starts_at, ends_at, status) values
  ('f9900000-0000-4000-8000-000000000001', 'f9800000-0000-4000-8000-000000000001', '2026-09-07', '2026-09-07 09:00:00+07', '2026-09-07 10:00:00+07', 'SCHEDULED'),
  ('f9900000-0000-4000-8000-000000000002', 'f9800000-0000-4000-8000-000000000002', '2026-09-14', '2026-09-14 09:00:00+07', '2026-09-14 10:00:00+07', 'SCHEDULED');
insert into public.attendance_records(id, session_occurrence_id, enrollment_id, status) values
  ('f9a00000-0000-4000-8000-000000000001', 'f9900000-0000-4000-8000-000000000001', 'f9700000-0000-4000-8000-000000000001', 'PRESENT'),
  ('f9a00000-0000-4000-8000-000000000002', 'f9900000-0000-4000-8000-000000000001', 'f9700000-0000-4000-8000-000000000002', 'PRESENT'),
  ('f9a00000-0000-4000-8000-000000000003', 'f9900000-0000-4000-8000-000000000001', 'f9700000-0000-4000-8000-000000000003', 'LATE'),
  ('f9a00000-0000-4000-8000-000000000004', 'f9900000-0000-4000-8000-000000000001', 'f9700000-0000-4000-8000-000000000004', 'ABSENT'),
  ('f9a00000-0000-4000-8000-000000000005', 'f9900000-0000-4000-8000-000000000002', 'f9700000-0000-4000-8000-000000000001', 'PRESENT');

select is((select count(*) from public.learning_observation_options), 56::bigint, 'taxonomy has the approved options');
select is((select count(distinct code) from public.learning_observation_options), 56::bigint, 'taxonomy codes are unique');
select is(
  public.draft_learning_progress_note(array['RHYTHM_STABLE_PULSE','ACCURACY_IMPROVED','TECH_FINGERING_UNSTABLE']),
  public.draft_learning_progress_note(array['TECH_FINGERING_UNSTABLE','RHYTHM_STABLE_PULSE','ACCURACY_IMPROVED']),
  'progress draft is deterministic'
);
select is(
  public.draft_learning_progress_note(array['RHYTHM_STABLE_PULSE','ACCURACY_IMPROVED','TECH_FINGERING_UNSTABLE']),
  'Em duy trì nhịp khá ổn định và độ chính xác đã cải thiện. Fingering/chuyển vị trí vẫn cần tiếp tục củng cố.',
  'progress draft uses observable clauses'
);
select ok(pg_get_function_result('public.aggregate_student_learning_observations(uuid,date,date)'::regprocedure) !~* 'score', 'aggregation has no score');
select ok(pg_get_function_result('public.aggregate_student_learning_observations(uuid,date,date)'::regprocedure) !~* 'trend', 'one observation is not labeled a trend');
create temporary table taxonomy_progress_before as select count(*)::bigint as total from public.student_component_item_progress;

select set_config('request.jwt.claim.sub', 'f9200000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.save_session_learning_context('f9900000-0000-4000-8000-000000000001', 'Luyện nhịp và fingering', 'REPERTOIRE')$$, 'teacher saves shared lesson context');
select lives_ok($$select public.save_student_learning_entry('f9a00000-0000-4000-8000-000000000001', 'PRACTICING', 'Ban nhap', 'Rieng A', true, 'FOCUS_RHYTHM', true, 'ATTENTION_TECHNICAL', 'Ky thuat keo dai', '', array['RHYTHM_STABLE_PULSE','ACCURACY_IMPROVED'])$$, 'student A quick entry');
select lives_ok($$select public.save_student_learning_entry('f9a00000-0000-4000-8000-000000000002', 'PRACTICING', 'Ban nhap B', '', false, null, false, null, '', '', array['RHYTHM_STABLE_PULSE'])$$, 'student B quick entry');
select lives_ok($$select public.save_student_learning_entry('f9a00000-0000-4000-8000-000000000003', 'NEEDS_REVIEW', 'Ban nhap C', '', false, null, false, null, '', '', array['TECH_STABLE_SLOW'])$$, 'student C quick entry');
select lives_ok($$select public.select_journal_observation((select id from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000001'), 'TECH_FINGERING_UNSTABLE')$$, 'additional observation');
select is((select count(*) from public.student_journal_observation_selections where entry_id = (select id from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000001')), 3::bigint, 'one entry keeps multiple observations');
select throws_ok($$select public.select_journal_observation((select id from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000001'), 'TECH_FINGERING_UNSTABLE')$$, '23505', 'duplicate key value violates unique constraint "student_journal_observation_selections_pkey"', 'duplicate observation rejected');
update public.learning_observation_options set active = false where code = 'TECH_INDEPENDENT';
select throws_ok($$select public.select_journal_observation((select id from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000001'), 'TECH_INDEPENDENT')$$, 'P0001', 'JOURNAL_OPTION_INACTIVE', 'inactive option cannot be newly selected');
select throws_ok($$select public.save_student_learning_entry('f9a00000-0000-4000-8000-000000000004', 'PRACTICING', 'Da hoc', '', false, null, false, null, '', '', array['RHYTHM_STABLE_PULSE'])$$, 'P0001', 'JOURNAL_ABSENT_OBSERVATION_DENIED', 'absent student gets no attended observation');
select lives_ok($$select public.save_student_learning_entry('f9a00000-0000-4000-8000-000000000004', 'NOT_RECORDED', '', 'On bai cu', false, null, false, null, '', 'Nho on bai', array[]::text[])$$, 'absent student can receive homework only');
select lives_ok($$select public.apply_shared_journal_practice('f9900000-0000-4000-8000-000000000001', 'Scale · Luyện chậm · 15 phút', 'FOCUS_TECHNIQUE')$$, 'shared practice for present students');
select is((select individual_homework from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000001'), 'Rieng A', 'custom homework is not overwritten');
select is((select individual_homework from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000002'), 'Scale · Luyện chậm · 15 phút', 'shared homework reaches the other present student');
select is((select count(*) from public.student_journal_observation_selections where entry_id = (select id from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000001')), 3::bigint, 'shared homework does not change observations');
select throws_ok($$select public.submit_session_learning_journal('f9900000-0000-4000-8000-000000000099')$$, 'P0001', 'JOURNAL_UNAUTHORIZED', 'missing session is not writable');
select lives_ok($$select public.save_student_learning_entry('f9a00000-0000-4000-8000-000000000001', 'PRACTICING', 'Em duy trì nhịp khá ổn định và độ chính xác đã cải thiện. Fingering/chuyển vị trí vẫn cần tiếp tục củng cố.', 'Rieng A', true, 'FOCUS_RHYTHM', true, 'ATTENTION_TECHNICAL', 'Ky thuat keo dai', '', array['RHYTHM_STABLE_PULSE','ACCURACY_IMPROVED','TECH_FINGERING_UNSTABLE'])$$, 'accept edited progress note');
select throws_ok($$update public.session_learning_journals set content_covered = '' where session_occurrence_id = 'f9900000-0000-4000-8000-000000000001'$$, 'P0001', 'JOURNAL_DIRECT_WRITE_DENIED', 'direct journal write denied');
select lives_ok($$select public.submit_session_learning_journal('f9900000-0000-4000-8000-000000000001')$$, 'group journal submits with an absent student');
select is((select status from public.session_learning_journals where session_occurrence_id = 'f9900000-0000-4000-8000-000000000001'), 'SUBMITTED', 'submitted');
select lives_ok($$select public.save_session_learning_context('f9900000-0000-4000-8000-000000000001', 'Luyện nhịp, fingering và đoạn chuyển', 'REPERTOIRE')$$, 'revise shared content');
select is((select revision_count from public.session_learning_journals where session_occurrence_id = 'f9900000-0000-4000-8000-000000000001'), 1, 'revision is tracked');
select is((select count(*) from public.student_journal_observation_selections where entry_id = (select id from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000001')), 3::bigint, 'revision keeps structured observations');
select is((select count(*) from public.student_component_item_progress), (select total from taxonomy_progress_before), 'taxonomy does not write academic item progress');

select lives_ok($$select public.save_session_learning_context('f9900000-0000-4000-8000-000000000002', 'On lai nhip', 'TECHNIQUE')$$, 'second lesson');
select lives_ok($$select public.save_student_learning_entry('f9a00000-0000-4000-8000-000000000005', 'ACHIEVED', 'Nhip on hon', '', false, 'FOCUS_RHYTHM', false, null, '', '', array['RHYTHM_STABLE_PULSE'])$$, 'repeat rhythm observation');
select lives_ok($$select public.submit_session_learning_journal('f9900000-0000-4000-8000-000000000002')$$, 'submit second lesson');
select is((select observation_count from public.aggregate_student_learning_observations('f9600000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30') where observation_code = 'RHYTHM_STABLE_PULSE'), 2, 'repeated observation is a count, not a score');
select is((select first_observed_on from public.aggregate_student_learning_observations('f9600000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30') where observation_code = 'RHYTHM_STABLE_PULSE'), '2026-09-07'::date, 'first observed date');
select is((select latest_observed_on from public.aggregate_student_learning_observations('f9600000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30') where observation_code = 'TECH_FINGERING_UNSTABLE'), '2026-09-07'::date, 'single observation stays dated');
select is((select observation_count from public.aggregate_student_learning_observations('f9600000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30') where observation_code = 'TECH_FINGERING_UNSTABLE'), 1, 'a single observation stays a count of one');

insert into public.session_occurrences(id, schedule_id, occurrence_date, starts_at, ends_at, status) values
  ('f9900000-0000-4000-8000-000000000003', 'f9800000-0000-4000-8000-000000000001', '2026-09-21', '2026-09-21 09:00:00+07', '2026-09-21 10:00:00+07', 'SCHEDULED');
insert into public.attendance_records(id, session_occurrence_id, enrollment_id, status) values
  ('f9a00000-0000-4000-8000-000000000006', 'f9900000-0000-4000-8000-000000000003', 'f9700000-0000-4000-8000-000000000001', 'PRESENT');
select lives_ok($$select public.save_session_learning_context('f9900000-0000-4000-8000-000000000003', 'Buoi chua co nhan xet', 'THEORY')$$, 'lesson without a progress note');
select throws_ok($$select public.submit_session_learning_journal('f9900000-0000-4000-8000-000000000003')$$, 'P0001', 'JOURNAL_PROGRESS_REQUIRED', 'present student still requires a progress note');

select set_config('request.jwt.claim.sub', 'f9200000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.select_journal_observation((select id from public.student_learning_journal_entries where attendance_record_id = 'f9a00000-0000-4000-8000-000000000002'), 'RHYTHM_STABLE_PULSE')$$, 'P0001', 'JOURNAL_UNAUTHORIZED', 'other teacher cannot attach observations');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9200000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.student_journal_observation_selections) > 0, true, 'branch admin can read observations');
select throws_ok($$select public.save_student_learning_entry('f9a00000-0000-4000-8000-000000000002', 'PRACTICING', 'Branch edit', '', false, null, false, null, '', '', array['RHYTHM_STABLE_PULSE'])$$, 'P0001', 'JOURNAL_UNAUTHORIZED', 'branch admin cannot attach observations');
select set_config('request.jwt.claim.sub', 'f9200000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.student_journal_observation_selections), 0::bigint, 'parent cannot read observation selections');
select set_config('request.jwt.claim.sub', 'f9200000-0000-4000-8000-000000000006', true);
select is((select count(*) from public.student_journal_observation_selections), 0::bigint, 'student cannot read observation selections');
select is((select count(*) from public.aggregate_student_learning_observations('f9600000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30')), 0::bigint, 'student aggregate returns no rows');
reset role;

set local role anon;
select throws_ok($$select public.draft_learning_progress_note(array['RHYTHM_STABLE_PULSE'])$$, '42501', 'permission denied for function draft_learning_progress_note', 'anonymous denied');
reset role;

select * from finish();
rollback;
