begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
insert into public.curriculums (id, code, name) values ('ed000000-0000-0000-0000-000000000001', 'GRADE-SCOPE-TEST', 'Grade scope test');
insert into public.students (id, student_code, full_name) values ('ed000000-0000-0000-0000-000000000002', 'GRADE-SCOPE-STUDENT', 'Grade scope student');
insert into public.curriculum_levels (id, curriculum_id, code, name, sequence_no)
select ('ed000000-0000-0000-0000-00000000001' || n)::uuid, 'ed000000-0000-0000-0000-000000000001', 'GRADE_' || n, 'Grade ' || n, n from generate_series(1,4) n;
insert into public.curriculum_subjects (id, level_id, family_code, code, name, completion_rule)
select ('ed000000-0000-0000-0000-00000000002' || n)::uuid, ('ed000000-0000-0000-0000-00000000001' || n)::uuid, 'DIRECT', 'SUBJECT_' || n, 'Subject ' || n, 'DIRECT_ASSESSMENT' from generate_series(1,4) n;
select lives_ok($$select public.assign_student_academic_program('ed000000-0000-0000-0000-000000000002', 'ed000000-0000-0000-0000-000000000001', 'ed000000-0000-0000-0000-000000000013', current_date - 1)$$, 'student can start directly at grade 3');
update public.student_subject_progress set status = 'PASS'
where level_progress_id in (select id from public.student_level_progress where enrollment_id in (select id from public.student_curriculum_enrollments where student_id = 'ed000000-0000-0000-0000-000000000002'));
select is((select count(*) from public.student_level_progress where enrollment_id in (select id from public.student_curriculum_enrollments where student_id = 'ed000000-0000-0000-0000-000000000002') and level_id in ('ed000000-0000-0000-0000-000000000011', 'ed000000-0000-0000-0000-000000000012')), 0::bigint, 'grades before the entry grade are not added to the journey');
select lives_ok($$select public.start_student_academic_level((select id from public.student_curriculum_enrollments where student_id = 'ed000000-0000-0000-0000-000000000002'), 'ed000000-0000-0000-0000-000000000014', current_date - 1)$$, 'completed grade 3 allows grade 4 without grades 1 and 2');
select throws_ok($$select public.start_student_academic_level((select id from public.student_curriculum_enrollments where student_id = 'ed000000-0000-0000-0000-000000000002'), 'ed000000-0000-0000-0000-000000000014', current_date - 1)$$, 'P0001', 'Academic level is not available to start', 'an already started grade cannot be started again');
select * from finish();
rollback;
