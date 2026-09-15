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
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from related_student_profiles('61000000-0000-0000-0000-000000000001')),1::bigint,'active linked parent projection');
select is((select count(*) from related_student_profiles('61000000-0000-0000-0000-000000000002')),0::bigint,'unrelated child hidden');
select is((select count(*) from students where id='61000000-0000-0000-0000-000000000001'),0::bigint,'parent cannot read raw private student fields');
reset role;
select set_config('request.jwt.claim.sub','',true);
update student_parents set valid_until=now()-interval '1 day' where student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is(parent_can_access_student('61000000-0000-0000-0000-000000000001'),false,'valid_until link denied by helper');
select is((select count(*) from related_student_profiles('61000000-0000-0000-0000-000000000001')),0::bigint,'valid_until link denied by projection');
reset role;
select set_config('request.jwt.claim.sub','',true);
update student_parents set valid_until=null where student_id='61000000-0000-0000-0000-000000000001';
update student_parents set valid_from=now()+interval '1 day' where student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is(parent_can_access_student('61000000-0000-0000-0000-000000000001'),false,'valid_from link denied by helper');
select is((select count(*) from related_student_profiles('61000000-0000-0000-0000-000000000001')),0::bigint,'valid_from link denied by projection');
reset role;
select set_config('request.jwt.claim.sub','',true);
update student_parents set valid_from=null where student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is((select count(*) from students where id='61000000-0000-0000-0000-000000000001'),0::bigint,'student cannot read staff notes through raw table');
select is((select count(*) from related_student_profiles('61000000-0000-0000-0000-000000000001')),1::bigint,'student own allowlisted profile');
select is((select count(*) from related_student_profiles('61000000-0000-0000-0000-000000000002')),0::bigint,'student other profile denied');
select ok(not (select to_jsonb(p) ? 'notes' from related_student_profiles('61000000-0000-0000-0000-000000000001') p),'private notes absent from projection');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='INACTIVE' where id='bc000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from parents where parent_code='SCOPE-P'),0::bigint,'inactive parent own table denied');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='ACTIVE' where id='bc000000-0000-4000-8000-000000000003';
update profiles set status='INACTIVE' where id='bc000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is((select count(*) from teachers where teacher_code='SCOPE-T'),0::bigint,'inactive teacher own table denied');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='ACTIVE' where id='bc000000-0000-4000-8000-000000000002';
update user_roles set branch_id='11000000-0000-0000-0000-000000000002' where user_id='bc000000-0000-4000-8000-000000000002';
insert into user_roles(user_id,role_id,branch_id) select 'bc000000-0000-4000-8000-000000000002',id,'11000000-0000-0000-0000-000000000001' from roles where code='BRANCH_ADMIN';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is(teacher_can_access_class('51000000-0000-0000-0000-000000000001'),false,'cannot borrow another role branch permission for teacher relationship');
select is(can_access_class('51000000-0000-0000-0000-000000000001'),true,'independent authorized branch-admin assignment still works');
select ok(not has_function_privilege('anon','public.related_student_profiles(uuid)','EXECUTE'),'anonymous projection denied');
select * from finish();
rollback;
