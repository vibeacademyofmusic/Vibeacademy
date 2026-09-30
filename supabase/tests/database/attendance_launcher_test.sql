-- Teacher session workspace. Rolled back. Uses the existing TEST_GUITAR curriculum; does not copy student level onto the session.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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
delete from public.class_teachers where teacher_id in (select id from public.teachers where teacher_code like 'FIX-%');
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

-- Schedule prerequisite must exist before active enrollment.
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


select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->>'total')::int,2,'date and branch yield two occurrences');
select is((public.attendance_session_search(current_date+50,'c2100000-0000-4000-8000-000000000010')->>'total')::int,0,'different date is empty');
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-999999999999')->>'total')::int,0,'other branch excluded');
select is((public.attendance_session_search(current_date,null,'c2100000-0000-4000-8000-000000000050')->>'total')::int,2,'shift filter');
select is((public.attendance_session_search(current_date,null,null,'c2100000-0000-4000-8000-000000000021')->>'total')::int,2,'actual primary teacher');
select is((public.attendance_session_search(current_date,null,null,null,'c2100000-0000-4000-8000-000000000061')->>'total')::int,2,'eligible student includes explicit makeup');
select is((public.attendance_session_search(current_date,null,null,null,'c2100000-0000-4000-8000-000000000062')->>'total')::int,1,'other regular student excluded from makeup');
select is((public.attendance_session_search(current_date,null,null,null,'no such student')->>'total')::int,0,'unknown student has no session');
select is((select (r->>'total')::int from jsonb_array_elements(public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->'rows') r where r->>'occurrence_type'='REGULAR'),4,'dated roster count');
select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','attendance','c2100000-0000-4000-8000-000000000071','{"status":"ABSENT"}');
select is((select (r->>'marked')::int from jsonb_array_elements(public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->'rows') r where r->>'occurrence_type'='REGULAR'),1,'marked count includes absence');
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010',null,null,null,'ABSENT')->>'total')::int,1,'absence filter');
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010',null,null,null,'IN_PROGRESS')->>'total')::int,1,'partial completion filter');
select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000002', true);
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->>'total')::int,0,'unrelated teacher denied');
select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000003', true);
select public.set_session_teacher('c2100000-0000-4000-8000-000000000091','c2100000-0000-4000-8000-000000000022','SUBSTITUTE','TEST substitute');
select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000002', true);
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->>'total')::int,1,'substitute sees only actual assignment');
select is(public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->'rows'->0->>'assignment_type','SUBSTITUTE','actual substitute resolution');
select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000001', true);
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->>'total')::int,1,'replaced primary loses substituted session');
select set_config('request.jwt.claim.sub', 'c2100000-0000-4000-8000-000000000003', true);
select is(jsonb_array_length(public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010',null,null,null,null,25)->'rows'),0,'server pagination is bounded');
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010',null,null,'Binh')->>'total')::int,1,'student name search');
select public.teacher_session_write('c2100000-0000-4000-8000-000000000090','attendance',e.id,'{"status":"PRESENT"}') from public.enrollments e
where e.id in ('c2100000-0000-4000-8000-000000000072','c2100000-0000-4000-8000-000000000073','c2100000-0000-4000-8000-000000000074');
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010',null,null,null,'COMPLETE')->>'total')::int,1,'all eligible students marked completes attendance');
select is(public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->'rows'->1->>'occurrence_type','REGULAR','completed attendance sorts after unfinished sessions');
delete from public.attendance_records where session_occurrence_id='c2100000-0000-4000-8000-000000000090' and enrollment_id='c2100000-0000-4000-8000-000000000071';
insert into public.enrollment_pauses(enrollment_id,starts_on,ends_on,reason) values ('c2100000-0000-4000-8000-000000000071',current_date,current_date+7,'TEST attendance launcher pause');
select is((public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010',null,null,'TEST_TSW_DB_1')->>'total')::int,1,'paused regular enrollment excluded but explicit makeup retained');
select is((select (r->>'marked')::int from jsonb_array_elements(public.attendance_session_search(current_date,'c2100000-0000-4000-8000-000000000010')->'rows') r where r->>'occurrence_type'='REGULAR'),3,'remaining eligible attendance count after pause');
select is(jsonb_array_length(public.attendance_roster_read('c2100000-0000-4000-8000-000000000090')),3,'read roster uses same paused regular eligibility');
select is(jsonb_array_length(public.attendance_roster_read('c2100000-0000-4000-8000-000000000091')),1,'read roster preserves explicit makeup membership');
reset role;
insert into public.user_roles(user_id,role_id,branch_id)
select 'c2100000-0000-4000-8000-000000000002',id,'c2100000-0000-4000-8000-000000000010' from public.roles where code='BRANCH_ADMIN';
set local role authenticated;
select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000002',true);
select is(jsonb_array_length(public.attendance_roster_read('c2100000-0000-4000-8000-000000000090')),3,'branch reader receives authorized canonical roster');
select is((select count(*)::int from public.enrollments where class_id='c2100000-0000-4000-8000-000000000050'),0,'enrollment table access is not widened');
select throws_ok($$select public.attendance_roster_read('c2100000-0000-4000-8000-999999999999')$$,'P0001','ATTENDANCE_UNAUTHORIZED','unknown session fails closed');
reset role;
update public.user_roles set valid_until=now()-interval '1 minute' where user_id='c2100000-0000-4000-8000-000000000002' and role_id=(select id from public.roles where code='BRANCH_ADMIN');
set local role authenticated;
select throws_ok($$select public.attendance_roster_read('c2100000-0000-4000-8000-000000000090')$$,'P0001','ATTENDANCE_UNAUTHORIZED','expired branch role cannot use roster read');
select set_config('request.jwt.claim.sub','c2100000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.attendance_roster_read('c2100000-0000-4000-8000-000000000090')$$,'P0001','ATTENDANCE_UNAUTHORIZED','teacher continues using own workspace boundary');
select ok(not has_function_privilege('anon','public.attendance_roster_read(uuid)','execute'),'anonymous cannot execute roster read');
select ok(not has_function_privilege('service_role','public.attendance_roster_read(uuid)','execute'),'service role is not explicitly granted roster read');
select * from finish();
rollback;
