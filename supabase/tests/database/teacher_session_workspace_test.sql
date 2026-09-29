-- Teacher session workspace. Rolled back. Uses the existing TEST_GUITAR curriculum; does not copy student level onto the session.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users(id) values
  ('c2100000-0000-4000-8000-000000000001'),
  ('c2100000-0000-4000-8000-000000000002'),
  ('c2100000-0000-4000-8000-000000000003');
insert into public.profiles(id, full_name, status) values
  ('c2100000-0000-4000-8000-000000000001', 'TEST Minh', 'ACTIVE'),
  ('c2100000-0000-4000-8000-000000000002', 'TEST Other', 'ACTIVE'),
  ('c2100000-0000-4000-8000-000000000003', 'TEST Admin', 'ACTIVE');
insert into public.branches(id, code, name, status) values
  ('c2100000-0000-4000-8000-000000000010', 'TEST_TSW_DB', 'TEST Teacher Session DB', 'ACTIVE');
insert into public.user_roles(user_id, role_id, branch_id)
select 'c2100000-0000-4000-8000-000000000001', id, 'c2100000-0000-4000-8000-000000000010' from public.roles where code = 'TEACHER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c2100000-0000-4000-8000-000000000002', id, 'c2100000-0000-4000-8000-000000000010' from public.roles where code = 'TEACHER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c2100000-0000-4000-8000-000000000003', id, null from public.roles where code = 'SUPER_ADMIN';
insert into public.teachers(id, user_id, teacher_code, full_name, status) values
  ('c2100000-0000-4000-8000-000000000021', 'c2100000-0000-4000-8000-000000000001', 'TEST_TSW_A', 'TEST Minh', 'ACTIVE'),
  ('c2100000-0000-4000-8000-000000000022', 'c2100000-0000-4000-8000-000000000002', 'TEST_TSW_B', 'TEST Other', 'ACTIVE');
insert into public.teacher_branches(teacher_id, branch_id) values
  ('c2100000-0000-4000-8000-000000000021', 'c2100000-0000-4000-8000-000000000010'),
  ('c2100000-0000-4000-8000-000000000022', 'c2100000-0000-4000-8000-000000000010');
insert into public.rooms(id, branch_id, code, name, capacity) values
  ('c2100000-0000-4000-8000-000000000030', 'c2100000-0000-4000-8000-000000000010', 'TEST_TSW_R', 'Phòng TEST 2', 10);
insert into public.courses(id, curriculum_id, code, name, status)
select 'c2100000-0000-4000-8000-000000000040', id, 'TEST_TSW_DB', 'Guitar Group Test DB', 'ACTIVE' from public.curriculums where code = 'TEST_GUITAR';
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status, accepted_from_level_id, accepted_to_level_id)
select 'c2100000-0000-4000-8000-000000000050', 'c2100000-0000-4000-8000-000000000010', 'c2100000-0000-4000-8000-000000000040', 'TEST_TSW_DB', 'Guitar Group Test DB', 'GROUP', 10, 'ACTIVE',
  (select l.id from public.curriculum_levels l join public.curriculums c on c.id = l.curriculum_id where c.code = 'TEST_GUITAR' and l.code = 'PRE'),
  (select l.id from public.curriculum_levels l join public.curriculums c on c.id = l.curriculum_id where c.code = 'TEST_GUITAR' and l.code = 'GRADE_5');
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at) values
  ('c2100000-0000-4000-8000-000000000050', 'c2100000-0000-4000-8000-000000000021', 'PRIMARY', true, current_date - 30);

insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('c2100000-0000-4000-8000-000000000061', 'TEST_TSW_DB_1', 'An TEST', 'c2100000-0000-4000-8000-000000000010', 'ACTIVE'),
  ('c2100000-0000-4000-8000-000000000062', 'TEST_TSW_DB_2', 'Binh TEST', 'c2100000-0000-4000-8000-000000000010', 'ACTIVE'),
  ('c2100000-0000-4000-8000-000000000063', 'TEST_TSW_DB_3', 'Cuc TEST', 'c2100000-0000-4000-8000-000000000010', 'ACTIVE'),
  ('c2100000-0000-4000-8000-000000000064', 'TEST_TSW_DB_4', 'Dung TEST', 'c2100000-0000-4000-8000-000000000010', 'ACTIVE'),
  ('c2100000-0000-4000-8000-000000000065', 'TEST_TSW_DB_5', 'Unrelated TEST', 'c2100000-0000-4000-8000-000000000010', 'ACTIVE');

select public.assign_student_academic_program(s.id, c.id, l.id, current_date - 30)
from public.students s
join public.curriculums c on c.code = 'TEST_GUITAR'
join public.curriculum_levels l on l.curriculum_id = c.id
where (s.id, l.code) in (
  ('c2100000-0000-4000-8000-000000000061', 'GRADE_1'),
  ('c2100000-0000-4000-8000-000000000062', 'GRADE_3'),
  ('c2100000-0000-4000-8000-000000000063', 'PRE'),
  ('c2100000-0000-4000-8000-000000000064', 'GRADE_5')
);

-- Active enrollment requires its teaching schedule first.
insert into public.schedules(id, class_id, room_id, day_of_week, start_time, end_time, effective_from, status) values
  ('c2100000-0000-4000-8000-000000000080', 'c2100000-0000-4000-8000-000000000050', 'c2100000-0000-4000-8000-000000000030', extract(isodow from current_date)::int, '15:00', '16:30', current_date - 7, 'ACTIVE');

insert into public.enrollments(id, student_id, class_id, student_curriculum_enrollment_id, started_at, enrolled_at, status)
select e.enrollment_id, e.student_id, 'c2100000-0000-4000-8000-000000000050', sce.id, current_date - 14, current_date - 14, 'ACTIVE'
from (values
  ('c2100000-0000-4000-8000-000000000071'::uuid, 'c2100000-0000-4000-8000-000000000061'::uuid),
  ('c2100000-0000-4000-8000-000000000072', 'c2100000-0000-4000-8000-000000000062'),
  ('c2100000-0000-4000-8000-000000000073', 'c2100000-0000-4000-8000-000000000063'),
  ('c2100000-0000-4000-8000-000000000074', 'c2100000-0000-4000-8000-000000000064')
) as e(enrollment_id, student_id)
join public.student_curriculum_enrollments sce on sce.student_id = e.student_id and sce.status = 'ACTIVE';

update public.student_component_item_progress set status = 'PASS'
where component_progress_id in (
  select cp.id from public.student_component_progress cp
  join public.student_subject_progress sp on sp.id = cp.subject_progress_id
  join public.student_level_progress lp on lp.id = sp.level_progress_id
  join public.student_curriculum_enrollments sce on sce.id = lp.enrollment_id
  where sce.student_id = 'c2100000-0000-4000-8000-000000000064'
);
select public.start_student_academic_level(sce.id, l.id, current_date - 1)
from public.student_curriculum_enrollments sce
join public.curriculum_levels l on l.curriculum_id = sce.curriculum_id
where sce.student_id = 'c2100000-0000-4000-8000-000000000064' and l.code = 'GRADE_6';

insert into public.session_occurrences(id, schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type) values
  ('c2100000-0000-4000-8000-000000000090', 'c2100000-0000-4000-8000-000000000080', current_date, (current_date + time '15:00') at time zone 'Asia/Ho_Chi_Minh', (current_date + time '16:30') at time zone 'Asia/Ho_Chi_Minh', 'c2100000-0000-4000-8000-000000000030', 'SCHEDULED', 'REGULAR');
insert into public.session_occurrences(id, schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type, source_occurrence_id) values
  ('c2100000-0000-4000-8000-000000000091', 'c2100000-0000-4000-8000-000000000080', current_date, (current_date + time '17:00') at time zone 'Asia/Ho_Chi_Minh', (current_date + time '18:00') at time zone 'Asia/Ho_Chi_Minh', 'c2100000-0000-4000-8000-000000000030', 'SCHEDULED', 'MAKEUP', 'c2100000-0000-4000-8000-000000000090');
insert into public.makeup_credits(id, enrollment_id, source_occurrence_id, source_reason, status) values
  ('c2100000-0000-4000-8000-000000000095', 'c2100000-0000-4000-8000-000000000071', 'c2100000-0000-4000-8000-000000000090', 'SESSION_CANCELLED', 'AVAILABLE');
insert into public.session_occurrence_participants(session_occurrence_id, enrollment_id) values
  ('c2100000-0000-4000-8000-000000000091', 'c2100000-0000-4000-8000-000000000071');

select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(jsonb_array_length(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000090')->'participants'), 4, 'TSW01 one session returns the regular roster');
select ok(not exists(select 1 from jsonb_array_elements(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000090')->'participants') p where (p->>'academic') is null), 'TSW03 academic program is present');
select is((select count(distinct p->'academic'->>'level_name') from jsonb_array_elements(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000090')->'participants') p), 4::bigint, 'TSW02 mixed levels are preserved');
select is((select p->>'compatibility' from jsonb_array_elements(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000090')->'participants') p where p->>'student_id' = 'c2100000-0000-4000-8000-000000000064'), 'OUTSIDE_SCOPE', 'TSW04 outside scope is derived');
select is((select p->'academic'->>'level_name' from jsonb_array_elements(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000090')->'participants') p where p->>'student_id' = 'c2100000-0000-4000-8000-000000000061'), 'Grade 1', 'TSW05 student level comes from the academic program');
select is(jsonb_array_length(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000091')->'participants'), 1, 'TSW06 makeup roster is the explicit participant');
select is(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000090')->>'teacher', 'TEST Minh', 'TSW07 actual teacher is the class primary when no override exists');

select lives_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','attendance','c2100000-0000-4000-8000-000000000071','{"status":"PRESENT"}')$$, 'TSW08 present persists');
select lives_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','attendance','c2100000-0000-4000-8000-000000000073','{"status":"ABSENT"}')$$, 'TSW09 absent persists');
select lives_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','attendance','c2100000-0000-4000-8000-000000000074','{"status":"LATE"}')$$, 'TSW10 late persists');
select lives_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','attendance','c2100000-0000-4000-8000-000000000072','{"status":"EXCUSED"}')$$, 'TSW11 excused persists');
select throws_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','attendance','c2100000-0000-4000-8000-000000000099','{"status":"PRESENT"}')$$, 'P0001', 'TEACHING_PARTICIPANT_DENIED', 'TSW12 attendance is limited to a session participant');

select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','attendance','c2100000-0000-4000-8000-000000000072','{"status":"PRESENT"}');
select lives_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','progress','c2100000-0000-4000-8000-000000000071', jsonb_build_object('kind','item','status','IN_PROGRESS','expected_status','NOT_STARTED','progress_id',(select ip.id from public.student_component_item_progress ip join public.student_component_progress cp on cp.id=ip.component_progress_id join public.student_subject_progress sp on sp.id=cp.subject_progress_id join public.student_level_progress lp on lp.id=sp.level_progress_id join public.student_curriculum_enrollments sce on sce.id=lp.enrollment_id where sce.student_id='c2100000-0000-4000-8000-000000000061' order by ip.id limit 1)))$$, 'TSW13 student A progress updates');
select is((select count(*) from public.student_component_item_progress ip join public.student_component_progress cp on cp.id=ip.component_progress_id join public.student_subject_progress sp on sp.id=cp.subject_progress_id join public.student_level_progress lp on lp.id=sp.level_progress_id join public.student_curriculum_enrollments sce on sce.id=lp.enrollment_id where sce.student_id='c2100000-0000-4000-8000-000000000062' and ip.status='IN_PROGRESS'), 0::bigint, 'TSW14 student B progress stays unchanged');
select throws_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','progress','c2100000-0000-4000-8000-000000000073','{"kind":"item","status":"IN_PROGRESS","expected_status":"NOT_STARTED","progress_id":"c2100000-0000-4000-8000-000000000071"}')$$, 'P0001', 'TEACHING_ATTENDANCE_REQUIRED', 'TSW15 absent student is not advanced');

select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','context',null, jsonb_build_object('version',0,'content','Warm-up ensemble','context','REPERTOIRE'));
select lives_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','journal','c2100000-0000-4000-8000-000000000071', jsonb_build_object('version',0,'observation','PRACTICING','progress_note','An keeps a steady pulse','homework','Practice the assigned passage','homework_custom',true,'focus',null,'attention',true,'attention_reason',(select code from public.learning_attention_reasons where active limit 1),'attention_detail','Watch the left hand','family_note','','codes','[]'::jsonb))$$, 'TSW19 draft save');
select is((select entry.progress_note from public.student_learning_journal_entries entry join public.attendance_records attendance on attendance.id=entry.attendance_record_id where attendance.enrollment_id='c2100000-0000-4000-8000-000000000071'), 'An keeps a steady pulse', 'TSW20 draft survives in the journal row');
select throws_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','submit',null,'{}')$$, 'P0001', 'JOURNAL_SESSION_NOT_COMPLETED', 'scheduled session cannot submit journal');
-- Complete the fully marked occurrence before checking journal submission content.
update public.session_occurrences set status='COMPLETED' where id='c2100000-0000-4000-8000-000000000090';
select throws_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','submit',null,'{}')$$, 'P0001', 'JOURNAL_PROGRESS_REQUIRED', 'TSW21 present and late students still need a progress note');
select lives_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','journal','c2100000-0000-4000-8000-000000000073', jsonb_build_object('version',0,'observation','NOT_RECORDED','progress_note','','homework','','homework_custom',false,'attention',false,'family_note','Family informed','codes','[]'::jsonb))$$, 'TSW22 absent feedback stays optional');
select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','journal','c2100000-0000-4000-8000-000000000072', jsonb_build_object('version',0,'observation','PRACTICING','progress_note','Binh tone is even','homework','','homework_custom',false,'attention',false,'family_note','','codes','[]'::jsonb));
select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','journal','c2100000-0000-4000-8000-000000000074', jsonb_build_object('version',0,'observation','NEEDS_REVIEW','progress_note','Dung arrived late and reviewed the passage','homework','','homework_custom',false,'attention',false,'family_note','','codes','[]'::jsonb));
select lives_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','submit',null,'{}')$$, 'TSW23 session journal submits');
select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','journal','c2100000-0000-4000-8000-000000000071', jsonb_build_object('version',1,'observation','PRACTICING','progress_note','An keeps a steady pulse, revised','homework','Practice the assigned passage','homework_custom',true,'attention',true,'attention_reason',(select code from public.learning_attention_reasons where active limit 1),'attention_detail','Watch the left hand','family_note','','codes','[]'::jsonb));
select cmp_ok((select revision_count from public.session_learning_journals where session_occurrence_id='c2100000-0000-4000-8000-000000000090'), '>', 0, 'TSW24 submitted journal keeps a revision');
select is((select attention_required from public.student_learning_journal_entries entry join public.attendance_records attendance on attendance.id=entry.attendance_record_id where attendance.enrollment_id='c2100000-0000-4000-8000-000000000071'), true, 'TSW25 attention flag is stored on the student entry');

select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.teacher_session_workspace('c2100000-0000-4000-8000-000000000090')$$, 'P0001', 'TEACHING_UNAUTHORIZED', 'TSW27 unrelated teacher is denied');

select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000003', true);
select lives_ok($$select public.set_session_teacher('c2100000-0000-4000-8000-000000000091','c2100000-0000-4000-8000-000000000022','SUBSTITUTE','TEST substitute for this makeup')$$, 'TSW29 substitute assignment is accepted');
select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000002', true);
select is(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000091')->>'assignment_type', 'SUBSTITUTE', 'TSW07 substitute is the actual teacher');
select is(public.teacher_session_workspace('c2100000-0000-4000-8000-000000000091')->>'teacher', 'TEST Other', 'TSW29 substitute can open the assigned session');

select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000002', true);
update public.session_occurrences set status = 'CANCELLED' where id = 'c2100000-0000-4000-8000-000000000091';
select lives_ok($$select public.teacher_session_workspace('c2100000-0000-4000-8000-000000000091')$$, 'TSW cancelled session stays readable for its teacher');
select throws_ok($$select public.teacher_session_write('c2100000-0000-4000-8000-000000000091','attendance','c2100000-0000-4000-8000-000000000071','{"status":"PRESENT"}')$$, 'P0001', 'TEACHING_CANCELLED', 'TSW cancelled session rejects new teaching writes');

select * from finish();
rollback;
