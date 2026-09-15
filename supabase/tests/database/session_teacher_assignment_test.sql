begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Fixture identities are scoped; test transaction rolls back.
insert into public.branches (
  id,
  code,
  name
)
values (
  '11000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-BRANCH',
  'Attendance Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '21000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-CURRICULUM',
  'Attendance Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '31000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-LEVEL',
  'Attendance Test Level',
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
  '41000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-COURSE',
  'Attendance Test Course'
);

insert into public.classes (
  id,
  branch_id,
  course_id,
  code,
  name,
  status
)
values
  (
    '51000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-CLASS-A',
    'Attendance Test Class A',
    'ACTIVE'
  ),
  (
    '51000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-CLASS-B',
    'Attendance Test Class B',
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
    '61000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-STUDENT-A',
    '11000000-0000-0000-0000-000000000001',
    'Attendance Test Student A'
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    'ATTENDANCE-TEST-STUDENT-B',
    '11000000-0000-0000-0000-000000000001',
    'Attendance Test Student B'
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
    '71000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    '2026-08-01',
    'ACTIVE'
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '61000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000002',
    '2026-08-01',
    'ACTIVE'
  );

insert into public.schedules (
  id,
  class_id,
  day_of_week,
  start_time,
  end_time,
  effective_from,
  timezone,
  status
)
values (
  '81000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  1,
  '09:00',
  '10:00',
  '2026-08-01',
  'Asia/Ho_Chi_Minh',
  'ACTIVE'
);

insert into public.session_occurrences (
  id,
  schedule_id,
  occurrence_date,
  starts_at,
  ends_at,
  status
)
values (
  '91000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '2026-08-03',
  '2026-08-03 09:00:00+07',
  '2026-08-03 10:00:00+07',
  'SCHEDULED'
);

insert into public.attendance_records (id, session_occurrence_id, enrollment_id, status)
values ('a1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'PRESENT');
insert into auth.users (id) values ('b1000000-0000-0000-0000-000000000001'), ('b1000000-0000-0000-0000-000000000002');
insert into public.roles (code, name) values ('SUPER_ADMIN', 'Admin') on conflict (code) do nothing;
-- Authorization requires an active account as well as the role assignment.
insert into public.profiles(id, status) values ('b1000000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (user_id, role_id) select 'b1000000-0000-0000-0000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);


insert into auth.users(id) values('b1000000-0000-0000-0000-000000000003'),('b1000000-0000-0000-0000-000000000004');
insert into public.profiles(id) values('b1000000-0000-0000-0000-000000000002'),('b1000000-0000-0000-0000-000000000003'),('b1000000-0000-0000-0000-000000000004');
insert into public.user_roles(user_id,role_id) select 'b1000000-0000-0000-0000-000000000002',id from public.roles where code='STUDENT';
insert into public.user_roles(user_id,role_id) select 'b1000000-0000-0000-0000-000000000003',id from public.roles where code='PARENT';
update students set user_id='b1000000-0000-0000-0000-000000000002' where id='61000000-0000-0000-0000-000000000001';
insert into parents(id,user_id,parent_code) values('f1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','FEEDBACK-PARENT');
insert into student_parents(student_id,parent_id) values('61000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001');
insert into teachers(id,teacher_code,full_name) values('f2000000-0000-0000-0000-000000000001','FEEDBACK-TEACHER','Feedback Teacher');
insert into class_teachers(class_id,teacher_id,assigned_at) values('51000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','2026-08-01');

insert into teachers(id,teacher_code,full_name) values('f2000000-0000-0000-0000-000000000002','SUBSTITUTE','Substitute');
insert into teacher_branches(teacher_id,branch_id) values('f2000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001');
set local role authenticated;
select is((select teacher_id from session_actual_teachers where session_id='91000000-0000-0000-0000-000000000001'),'f2000000-0000-0000-0000-000000000001'::uuid,'primary fallback');
select lives_ok($$select set_session_teacher('91000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002','SUBSTITUTE','Cover lesson')$$,'substitute assigned');
select is((select teacher_id from session_actual_teachers where session_id='91000000-0000-0000-0000-000000000001'),'f2000000-0000-0000-0000-000000000002'::uuid,'actual substitute');
select throws_ok($$select set_session_teacher('91000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','SUBSTITUTE','No branch')$$,'P0001','Teacher must belong to session branch','branch required');
select lives_ok($$select set_session_teacher('91000000-0000-0000-0000-000000000001',null,'PRIMARY','Revert')$$,'remove override');
select is((select count(*) from session_teacher_assignments where session_id='91000000-0000-0000-0000-000000000001' and effective_status='REPLACED'),1::bigint,'history retained');
reset role;
update teachers set status='INACTIVE' where id='f2000000-0000-0000-0000-000000000002';
set local role authenticated;
select throws_ok($$select set_session_teacher('91000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002','SUBSTITUTE','Inactive')$$,'P0001','Teacher must be active','inactive rejected');
reset role;
update teachers set status='ACTIVE' where id='f2000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_session_teacher('91000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002','SUBSTITUTE','Cover confirmed');
update session_occurrences set status='COMPLETED' where id='91000000-0000-0000-0000-000000000001';
select throws_ok($$select set_session_teacher('91000000-0000-0000-0000-000000000001',null,'PRIMARY','Change history')$$,'P0001','Completed or cancelled session assignment is locked','completed lock');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
select lives_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',4)$$,'feedback uses actual teacher');
select throws_ok($$select set_session_teacher('91000000-0000-0000-0000-000000000001',null,'PRIMARY','Spoof')$$,'P0001','Unauthorized','student cannot assign');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
select is((select teacher_id from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001'),'f2000000-0000-0000-0000-000000000002'::uuid,'feedback attributed to substitute');
select is((select feedback_count from lesson_feedback_teacher_monthly where teacher_id='f2000000-0000-0000-0000-000000000002'),1::bigint,'substitute aggregate');
update class_teachers set is_active=false where class_id='51000000-0000-0000-0000-000000000001';
select is((select teacher_id from session_actual_teachers where session_id='91000000-0000-0000-0000-000000000001'),'f2000000-0000-0000-0000-000000000002'::uuid,'completed snapshot retained after class change');
select throws_ok($$delete from session_teacher_assignments$$,'42501',null,'direct history delete denied');
select * from finish();
rollback;
