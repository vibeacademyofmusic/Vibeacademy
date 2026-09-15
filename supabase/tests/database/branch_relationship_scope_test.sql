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
insert into branches(id,code,name) values('11000000-0000-0000-0000-000000000002','SCOPE-B','Scope B');
update classes set branch_id='11000000-0000-0000-0000-000000000002' where id='51000000-0000-0000-0000-000000000002';
insert into auth.users(id) select ('bc000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5) i;
insert into profiles(id) select ('bc000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5) i;
insert into user_roles(user_id,role_id,branch_id) select 'bc000000-0000-4000-8000-000000000001',id,'11000000-0000-0000-0000-000000000001' from roles where code='BRANCH_ADMIN';
insert into user_roles(user_id,role_id) select ('bc000000-0000-4000-8000-'||lpad(v.n::text,12,'0'))::uuid,r.id from (values (2,'TEACHER'),(3,'PARENT'),(4,'STUDENT'),(5,'SUPER_ADMIN')) v(n,code) join roles r on r.code=v.code;
insert into teachers(id,user_id,teacher_code,full_name) values('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002','SCOPE-T','Scope Teacher');
insert into class_teachers(class_id,teacher_id,assigned_at) values('51000000-0000-0000-0000-000000000001','bc100000-0000-4000-8000-000000000001','2026-01-01');
insert into parents(id,user_id,parent_code) values('bc200000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000003','SCOPE-P');
insert into student_parents(parent_id,student_id) values('bc200000-0000-4000-8000-000000000001','61000000-0000-0000-0000-000000000001');
update students set user_id='bc000000-0000-4000-8000-000000000004' where id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000001',true);
select is(student_belongs_to_branch('61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001'),true,'active membership');
select is(can_access_student('61000000-0000-0000-0000-000000000002'),false,'default matching branch does not grant authority');
select is((select count(*)::integer from students where id in ('61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002')),1,'student RLS scoped');
select is((select count(*)::integer from classes where id in ('51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002')),1,'class RLS scoped');
select is((select count(*)::integer from branches where id in ('11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002')),1,'branch metadata RLS scoped');
select is(has_permission('payroll.approve','11000000-0000-0000-0000-000000000001'),false,'no payroll permission');
select is(has_permission('finance.payment.void','11000000-0000-0000-0000-000000000001'),false,'no payment permission');
select lives_ok($$select update_student_basic('61000000-0000-0000-0000-000000000001','Updated','Name')$$,'branch basic update');
select throws_ok($$select update_student_basic('61000000-0000-0000-0000-000000000002','Forbidden','')$$,'P0001','Unauthorized','cross branch mutation denied');
select is((select count(*)::integer from schedules where id='81000000-0000-0000-0000-000000000001'),1,'schedule read without recursion');
select is((select count(*)::integer from attendance_records where session_occurrence_id='91000000-0000-0000-0000-000000000001'),1,'attendance branch allow');
reset role;
insert into enrollments(student_id,class_id,started_at) values('61000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002','2026-08-01');
update user_roles set branch_id='11000000-0000-0000-0000-000000000002' where user_id='bc000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(can_access_student('61000000-0000-0000-0000-000000000001'),true,'multi branch with default mismatch');
reset role;
update user_roles set branch_id=null where user_id='bc000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(can_access_class('51000000-0000-0000-0000-000000000001'),true,'global branch A');
select is(can_access_class('51000000-0000-0000-0000-000000000002'),true,'global branch B');
reset role;
update user_roles set valid_until=now()-interval '1 second' where user_id='bc000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(can_access_class('51000000-0000-0000-0000-000000000001'),false,'expired role');
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is(teacher_can_access_class('51000000-0000-0000-0000-000000000001'),true,'teacher own class');
select is(teacher_can_access_student('61000000-0000-0000-0000-000000000001'),true,'teacher own student');
select is(teacher_can_access_student('61000000-0000-0000-0000-000000000002'),false,'teacher unrelated student');
select is((select count(*)::integer from scoped_students('61000000-0000-0000-0000-000000000001')),1,'teacher safe projection');
select is((select count(*)::integer from students where id='61000000-0000-0000-0000-000000000001'),0,'teacher raw private fields denied');
reset role;
update class_teachers set is_active=false,ended_at='2026-08-01' where teacher_id='bc100000-0000-4000-8000-000000000001';
set local role authenticated;
select is(teacher_can_access_class('51000000-0000-0000-0000-000000000001'),false,'ended assignment');
select is(teacher_can_access_student('61000000-0000-0000-0000-000000000001'),false,'ended assignment loses current student access');
reset role;
insert into session_teacher_assignments(session_id,teacher_id,assignment_type,reason) values('91000000-0000-0000-0000-000000000001','bc100000-0000-4000-8000-000000000001','SUBSTITUTE','test substitute');
set local role authenticated;
select is(teacher_can_access_session('91000000-0000-0000-0000-000000000001'),true,'substitute session allowed');
select is(teacher_can_access_student('61000000-0000-0000-0000-000000000001'),true,'substitute roster allowed');
select is(teacher_can_access_student('61000000-0000-0000-0000-000000000002'),false,'substitute unrelated roster denied');
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is(parent_can_access_student('61000000-0000-0000-0000-000000000001'),true,'linked parent');
select is(parent_can_access_student('61000000-0000-0000-0000-000000000002'),false,'unrelated parent');
reset role;
insert into student_parents(parent_id,student_id) values('bc200000-0000-4000-8000-000000000001','61000000-0000-0000-0000-000000000002');
set local role authenticated;
select is(parent_can_access_student('61000000-0000-0000-0000-000000000002'),true,'multiple children');
reset role;
update student_parents set is_active=false where student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(parent_can_access_student('61000000-0000-0000-0000-000000000001'),false,'inactive parent link');
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is(student_can_access_self('61000000-0000-0000-0000-000000000001'),true,'own student identity');
select is(student_can_access_self('61000000-0000-0000-0000-000000000002'),false,'other identity denied');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='SUSPENDED' where id='bc000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is(student_can_access_self('61000000-0000-0000-0000-000000000001'),false,'suspended denied');
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
select is(can_access_student('61000000-0000-0000-0000-000000000002'),true,'super admin preserved');
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into enrollment_pauses(enrollment_id,starts_on,ends_on,reason) values('71000000-0000-0000-0000-000000000001',current_date,current_date+1,'Scope pause');
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
select is(student_belongs_to_branch('61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001'),false,'paused enrollment confers no active membership');
reset role;
update enrollment_pauses set status='CANCELLED',cancelled_at=now(),cancel_reason='test complete' where enrollment_id='71000000-0000-0000-0000-000000000001';
update enrollments set status='ACTIVE',started_at=current_date+10 where id='71000000-0000-0000-0000-000000000001';
set local role authenticated;
select is(student_belongs_to_branch('61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001'),false,'future enrollment confers no active membership');
reset role;
update enrollments set started_at='2026-08-01' where id='71000000-0000-0000-0000-000000000001';
insert into learning_journals(attendance_record_id,content) values('a1000000-0000-0000-0000-000000000001','Scope journal');
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from learning_journals where attendance_record_id='a1000000-0000-0000-0000-000000000001'),1,'teacher journal RLS');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='INACTIVE' where id='bc000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is(teacher_can_access_session('91000000-0000-0000-0000-000000000001'),false,'inactive teacher account denied');
select is((select count(*)::integer from learning_journals where attendance_record_id='a1000000-0000-0000-0000-000000000001'),0,'inactive teacher journal denied');
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(id) values('bc000000-0000-4000-8000-000000000006');
insert into profiles(id) values('bc000000-0000-4000-8000-000000000006');
insert into user_roles(user_id,role_id) select 'bc000000-0000-4000-8000-000000000006',id from roles where code='PARENT';
insert into parents(id,user_id,parent_code) values('bc200000-0000-4000-8000-000000000002','bc000000-0000-4000-8000-000000000006','SCOPE-P2');
insert into student_parents(parent_id,student_id) values('bc200000-0000-4000-8000-000000000002','61000000-0000-0000-0000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000006',true);
select is(parent_can_access_student('61000000-0000-0000-0000-000000000002'),true,'second parent may access linked child');
select * from finish();
rollback;
