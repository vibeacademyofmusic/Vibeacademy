begin;

-- Fixture prerequisite for the current enrollment guard. Does not change production rules.
create or replace function pg_temp.prepare_enrollment_fixture(p_class uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.classes%rowtype; course public.courses%rowtype; level_id uuid; t uuid; r uuid; slot int;
begin
 select * into c from public.classes where id=p_class;
 if not found or c.course_id is null or c.xmin::text is distinct from txid_current()::text then return; end if;
 select * into course from public.courses where id=c.course_id;
 if not found then return; end if;
 level_id := course.level_id;
 if level_id is null then
   select id into level_id from public.curriculum_levels where curriculum_id=course.curriculum_id order by sequence_no limit 1;
   if level_id is null then return; end if;
   update public.courses set level_id=level_id where id=course.id and xmin::text=txid_current()::text;
 end if;
 update public.classes set accepted_from_level_id=coalesce(accepted_from_level_id,level_id),
   accepted_to_level_id=coalesce(accepted_to_level_id,level_id) where id=c.id;
 update public.students set default_branch_id=c.branch_id
  where default_branch_id is null and status='ACTIVE' and xmin::text=txid_current()::text;
 insert into public.student_curriculum_enrollments(student_id,curriculum_id,current_level_id,started_at,status,is_primary)
 select s.id,course.curriculum_id,level_id,date '2000-01-01','ACTIVE',true
 from public.students s
 where s.default_branch_id=c.branch_id and s.xmin::text=txid_current()::text
   and not exists(select 1 from public.student_curriculum_enrollments a where a.student_id=s.id and a.status='ACTIVE' and (a.curriculum_id=course.curriculum_id or a.is_primary));
 if not exists(select 1 from public.class_teachers where class_id=c.id and teacher_role='PRIMARY' and (is_active or ended_at is not null)) then
   select id into t from public.teachers where teacher_code='FIX-'||c.id;
   if t is null then
     insert into public.teachers(teacher_code,full_name) values('FIX-'||c.id,'TEST prerequisite teacher') returning id into t;
     insert into public.teacher_branches(teacher_id,branch_id,is_primary) values(t,c.branch_id,true);
   end if;
   insert into public.class_teachers(class_id,teacher_id,teacher_role,assigned_at) values(c.id,t,'PRIMARY',date '2000-01-01');
 end if;
 if not exists(select 1 from public.rooms where branch_id=c.branch_id and code='FIX-'||c.id) then
   insert into public.rooms(branch_id,code,name,capacity) values(c.branch_id,'FIX-'||c.id,'TEST prerequisite room',30) returning id into r;
 else
   select id into r from public.rooms where branch_id=c.branch_id and code='FIX-'||c.id limit 1;
 end if;
 if exists(select 1 from public.schedules where class_id=c.id and status='ACTIVE') then
   update public.schedules set room_id=coalesce(room_id,r) where class_id=c.id and status='ACTIVE' and room_id is null;
 else
   slot := abs(hashtext(c.id::text));
   insert into public.schedules(class_id,room_id,day_of_week,start_time,end_time,effective_from,timezone,status)
   values(c.id,r,1+(slot%7),time '06:00'+(slot%10)*interval '1 hour',time '06:50'+(slot%10)*interval '1 hour',date '2000-01-01','Asia/Ho_Chi_Minh','ACTIVE');
 end if;
end $$;

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

select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
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
delete from public.class_teachers where teacher_id in (select id from public.teachers where teacher_code like 'FIX-%');
insert into class_teachers(class_id,teacher_id,assigned_at) values('51000000-0000-0000-0000-000000000001','bc100000-0000-4000-8000-000000000001','2026-01-01');
insert into parents(id,user_id,parent_code) values('bc200000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000003','SCOPE-P');
insert into student_parents(parent_id,student_id) values('bc200000-0000-4000-8000-000000000001','61000000-0000-0000-0000-000000000001');
update students set user_id='bc000000-0000-4000-8000-000000000004' where id='61000000-0000-0000-0000-000000000001';

-- Two journals for the same taught class, only one authored by this teacher.
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
insert into curriculum_subjects(level_id,family_code,code,name,completion_rule)
values('31000000-0000-0000-0000-000000000001','TEACHER-PORTAL','TP','Teacher portal subject','DIRECT_ASSESSMENT');
delete from public.student_curriculum_enrollments existing
where existing.student_id='61000000-0000-0000-0000-000000000001'
  and existing.curriculum_id='21000000-0000-0000-0000-000000000001'
  and not exists (select 1 from public.enrollments class_enrollment where class_enrollment.student_curriculum_enrollment_id=existing.id);
select assign_student_academic_program('61000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','2026-08-01');
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
insert into learning_journals(id,attendance_record_id,content)
values('bd000000-0000-4000-8000-000000000001','a1000000-0000-0000-0000-000000000001','Authored journal');
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
insert into students(id,student_code,full_name) values('61000000-0000-0000-0000-000000000003','HISTORY-SECOND','Another learner');
select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
update public.classes set class_type='GROUP', capacity=10 where id='51000000-0000-0000-0000-000000000001';
insert into enrollments(id,student_id,class_id,started_at)
values('71000000-0000-0000-0000-000000000003','61000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000001','2026-08-01');
insert into attendance_records(id,session_occurrence_id,enrollment_id,status)
values('a1000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000003','PRESENT');
insert into learning_journals(id,attendance_record_id,content)
values('bd000000-0000-4000-8000-000000000002','a1000000-0000-0000-0000-000000000003','Other author journal');
update session_occurrences set status='COMPLETED' where id='91000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is(teacher_can_access_student('61000000-0000-0000-0000-000000000001'),true,'current class teacher retains current profile');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),1::bigint,'Current teacher may read authorized student academic journey');
select is(teacher_can_read_student_academic('61000000-0000-0000-0000-000000000002'),false,'Unrelated student academic access denied');
select is((select count(*) from teacher_portal_classes()),1::bigint,'Teacher portal lists current assigned class');
select is((select count(*) from teacher_portal_attendance('91000000-0000-0000-0000-000000000001')),2::bigint,'Current teacher reads own session attendance');
select is((select count(*) from teacher_portal_session('91000000-0000-0000-0000-000000000099')),0::bigint,'Unrelated session projection denied');
select is((select count(*) from teacher_portal_sessions(true)),1::bigint,'Teacher portal history lists actual completed session');
select is((select count(*) from teacher_portal_journals()),2::bigint,'Current teacher portal reads authorized class journals');
select is((select count(*) from learning_journals where id in ('bd000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002')),2::bigint,'current class teacher sees class journals');
reset role;
select set_config('request.jwt.claim.sub','',true);
update class_teachers set is_active=false,ended_at='2026-08-04' where teacher_id='bc100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is(teacher_can_access_session('91000000-0000-0000-0000-000000000001'),true,'former teacher keeps actual completed session');
select is((select count(*) from teacher_portal_classes()),0::bigint,'Former teacher portal has no current assigned classes');
select is((select count(*) from teacher_portal_attendance('91000000-0000-0000-0000-000000000001') where student_name='Học viên (hồ sơ lịch sử)'),2::bigint,'Former teacher attendance hides current learner names');
select is((select count(*) from teacher_portal_attendance('91000000-0000-0000-0000-000000000001',2)),0::bigint,'Attendance pagination is bounded');
select is((select count(*) from teacher_portal_sessions(true)),1::bigint,'Former teacher portal retains actual teaching history');
select is((select count(*) from teacher_portal_journals()),1::bigint,'Former teacher portal retains only own authored journal');
select is((select count(*) from teacher_portal_journals(1)),0::bigint,'Teacher journal pagination is bounded');
select is((select count(*) from session_occurrences where id='91000000-0000-0000-0000-000000000001'),1::bigint,'actual taught session RLS retained');
select is(teacher_can_access_student('61000000-0000-0000-0000-000000000001'),false,'completed session does not grant current learner profile');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'Former teacher cannot read current academic data through expired assignment');
select is((select count(*) from scoped_students('61000000-0000-0000-0000-000000000001')),0::bigint,'former teacher current profile projection denied');
select is((select count(*) from students where id='61000000-0000-0000-0000-000000000001'),0::bigint,'former teacher raw profile denied');
select is((select count(*) from learning_journals where id='bd000000-0000-4000-8000-000000000001'),1::bigint,'former teacher keeps authored journal');
select is((select count(*) from learning_journals where id='bd000000-0000-4000-8000-000000000002'),0::bigint,'former teacher cannot read other authors journal');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='INACTIVE' where id='bc000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is(teacher_can_access_session('91000000-0000-0000-0000-000000000001'),false,'inactive former teacher loses session history');
select is((select count(*) from teacher_portal_sessions(true)),0::bigint,'Inactive teacher portal history denied');
select is((select count(*) from teacher_portal_attendance('91000000-0000-0000-0000-000000000001')),0::bigint,'Inactive teacher attendance denied');
select is((select count(*) from teacher_portal_journals()),0::bigint,'Inactive teacher portal journal denied');
select is((select count(*) from learning_journals where id='bd000000-0000-4000-8000-000000000001'),0::bigint,'inactive author denied');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='ACTIVE' where id='bc000000-0000-4000-8000-000000000002';
update user_roles set valid_until=now()-interval '1 day' where user_id='bc000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is((select count(*) from learning_journals where id='bd000000-0000-4000-8000-000000000001'),0::bigint,'expired role author denied');
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
select is((select count(*) from learning_journals where id in ('bd000000-0000-4000-8000-000000000001','bd000000-0000-4000-8000-000000000002')),2::bigint,'super admin remains compatible');
select ok(not has_function_privilege('anon','public.can_read_learning_journal(uuid)','EXECUTE'),'anonymous helper execution denied');
select ok(not has_function_privilege('anon','public.teacher_portal_sessions(boolean,integer)','EXECUTE'),'Anonymous teacher portal denied');
select ok(not has_function_privilege('anon','public.own_payroll_off_cycle_corrections(integer)','EXECUTE'),'Anonymous correction self-read denied');
select ok(not has_function_privilege('anon','public.teacher_portal_attendance(uuid,integer)','EXECUTE'),'Anonymous attendance projection denied');
select * from finish();
rollback;
