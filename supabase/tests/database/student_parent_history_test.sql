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

select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
insert into curriculum_subjects(id,level_id,family_code,code,name,completion_rule)
values('bc300000-0000-4000-8000-000000000001','31000000-0000-0000-0000-000000000001','PORTAL','PORTAL','Portal direct subject','DIRECT_ASSESSMENT');
delete from public.student_curriculum_enrollments existing
where existing.student_id='61000000-0000-0000-0000-000000000001'
  and existing.curriculum_id='21000000-0000-0000-0000-000000000001'
  and not exists (select 1 from public.enrollments class_enrollment where class_enrollment.student_curriculum_enrollment_id=existing.id);
select assign_student_academic_program('61000000-0000-0000-0000-000000000001','21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','2026-08-01');
update student_subject_progress set notes='PRIVATE-ACADEMIC' where subject_id='bc300000-0000-4000-8000-000000000001';
update classes set class_type='GROUP',capacity=10 where id in ('51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002');
insert into enrollment_tuition(id,enrollment_id,tuition_plan_id,starts_on,amount)
values('be000000-0000-4000-8000-000000000001','71000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','2026-08-01',3000000),
('be000000-0000-4000-8000-000000000002','71000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003','2026-08-01',3000000);
select create_tuition_invoice('be000000-0000-4000-8000-000000000001',null);
select create_tuition_invoice('be000000-0000-4000-8000-000000000002',null);
select issue_invoice(id,'2026-08-01','2026-08-31') from invoices where enrollment_tuition_id in ('be000000-0000-4000-8000-000000000001','be000000-0000-4000-8000-000000000002');
select generate_learning_report('71000000-0000-0000-0000-000000000001','MONTHLY','2026-08-01','2026-08-31');
select generate_learning_report('71000000-0000-0000-0000-000000000001','END_OF_COURSE','2026-08-01','2026-08-31');
update learning_reports set admin_note='PRIVATE-INTERNAL',draft_data=draft_data||'{"private_future":"PRIVATE-INTERNAL"}'::jsonb
where student_id='61000000-0000-0000-0000-000000000001';
select update_learning_report(id,version,'SAVE','{"general_comment":"Approved comment"}','PRIVATE-INTERNAL') from learning_reports where student_id='61000000-0000-0000-0000-000000000001' and report_type='MONTHLY';
select update_learning_report(id,version,'READY') from learning_reports where student_id='61000000-0000-0000-0000-000000000001' and report_type='MONTHLY';
select update_learning_report(id,version,'APPROVE') from learning_reports where student_id='61000000-0000-0000-0000-000000000001' and report_type='MONTHLY';
select update_learning_report(id,version,'PUBLISH') from learning_reports where student_id='61000000-0000-0000-0000-000000000001' and report_type='MONTHLY';
-- Capture the pricing/debt engine result before enrollment completion; inserting
-- tuition applies the configured plan price, not the caller's legacy amount.
create temp table history_expected_debt as select outstanding_balance from invoice_receivables where student_id_snapshot='61000000-0000-0000-0000-000000000001';
grant select on history_expected_debt to authenticated;
-- Scoped learner/parent roles retain their own branch history after enrollment ends.
update user_roles set branch_id='11000000-0000-0000-0000-000000000001' where user_id in ('bc000000-0000-4000-8000-000000000003','bc000000-0000-4000-8000-000000000004');
update enrollments set status='COMPLETED',ended_at='2026-08-31' where id='71000000-0000-0000-0000-000000000001';
update students set status='GRADUATED',full_name='Changed current name' where id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),1::bigint,'linked parent ended enrollment: student_attendance_history');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),1::bigint,'linked parent ended enrollment: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),1::bigint,'linked parent ended enrollment: student_debt_history');
select is((select count(*) from portal_students()),1::bigint,'Parent picker includes only linked child after enrollment ends');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),1::bigint,'Parent can read linked academic journey');
select ok(not (select levels::text like '%PRIVATE-ACADEMIC%' from portal_academic_journey('61000000-0000-0000-0000-000000000001')),'Portal excludes internal academic notes');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000002')),0::bigint,'Unrelated journey hidden');
select is((select count(*) from portal_students(null,1)),0::bigint,'Family picker supports bounded pagination');
select is((select count(*) from portal_upcoming_sessions('61000000-0000-0000-0000-000000000001')),0::bigint,'Ended enrollment has no upcoming classes');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.students set status='ACTIVE' where id='61000000-0000-0000-0000-000000000001';
update public.schedules
set room_id=coalesce(room_id,(select id from public.rooms where branch_id=classes.branch_id order by code limit 1)),
    timezone='Asia/Ho_Chi_Minh'
from public.classes
where schedules.class_id=classes.id
  and schedules.status='ACTIVE'
  and classes.branch_id in ('11000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002');
update public.class_teachers
set is_active=true, ended_at=null, assigned_at=date '2026-01-01'
where class_id in ('51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002')
  and teacher_role='PRIMARY';
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at)
select class_row.id, 'bc100000-0000-4000-8000-000000000001', 'PRIMARY', true, date '2026-01-01'
from public.classes class_row
where class_row.id in ('51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002')
  and not exists (
    select 1 from public.class_teachers existing
    where existing.class_id=class_row.id and existing.teacher_role='PRIMARY' and existing.is_active
  );
update public.schedules set status='INACTIVE'
where class_id='51000000-0000-0000-0000-000000000001'
  and id<>'81000000-0000-0000-0000-000000000001'
  and status='ACTIVE';
update public.schedules
set start_time='18:00', end_time='19:00', timezone='Asia/Ho_Chi_Minh',
    room_id=coalesce(room_id,(select id from public.rooms where branch_id='11000000-0000-0000-0000-000000000001' order by code limit 1))
where class_id='51000000-0000-0000-0000-000000000002' and status='ACTIVE';
insert into session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,room_id,status)
select 'bc400000-0000-4000-8000-000000000001','81000000-0000-0000-0000-000000000001',
 (now() at time zone 'Asia/Ho_Chi_Minh')::date+7,now()+interval '7 days',now()+interval '7 days 1 hour',room_id,'SCHEDULED'
from public.schedules where id='81000000-0000-0000-0000-000000000001';
update enrollments set status='ACTIVE',ended_at=null where id='71000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from portal_upcoming_sessions('61000000-0000-0000-0000-000000000001')),1::bigint,'Active linked enrollment sees upcoming session only');
select is((select count(*) from portal_upcoming_sessions('61000000-0000-0000-0000-000000000002')),0::bigint,'Upcoming sessions exclude unrelated student');
select is((select count(*) from portal_upcoming_sessions('61000000-0000-0000-0000-000000000001',1)),0::bigint,'Upcoming sessions paginate');
reset role;
select set_config('request.jwt.claim.sub','',true);
update enrollments set status='COMPLETED',ended_at='2026-08-31' where id='71000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.student_parents set can_view_finance=false where parent_id='bc200000-0000-4000-8000-000000000001' and student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'Parent relationship without finance access cannot read debt');
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),1::bigint,'Finance restriction does not revoke permitted attendance');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.student_parents set can_view_finance=true where parent_id='bc200000-0000-4000-8000-000000000001' and student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);

select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000002')),0::bigint,'linked parent ended enrollment unrelated denied: student_attendance_history');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000002')),0::bigint,'linked parent ended enrollment unrelated denied: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000002')),0::bigint,'linked parent ended enrollment unrelated denied: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),1::bigint,'graduated student ended enrollment: student_attendance_history');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),1::bigint,'graduated student ended enrollment: family portal academic');
select is((select count(*) from portal_students('61000000-0000-0000-0000-000000000001')),1::bigint,'graduated student ended enrollment: family portal identity');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),1::bigint,'graduated student ended enrollment: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),1::bigint,'graduated student ended enrollment: student_debt_history');
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000002')),0::bigint,'graduated student ended enrollment unrelated denied: student_attendance_history');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000002')),0::bigint,'graduated student ended enrollment unrelated denied: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000002')),0::bigint,'graduated student ended enrollment unrelated denied: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is((select snapshot#>>'{student,name}' from student_approved_reports('61000000-0000-0000-0000-000000000001')),'Attendance Test Student A','report uses approved identity snapshot');
select is((select snapshot#>>'{teacher_summary,general_comment}' from student_approved_reports('61000000-0000-0000-0000-000000000001')),'Approved comment','approved public comment retained');
select ok(not (select snapshot::text like '%PRIVATE-INTERNAL%' from student_approved_reports('61000000-0000-0000-0000-000000000001')),'private fields excluded from approved snapshot');
select is((select outstanding_balance from student_debt_history('61000000-0000-0000-0000-000000000001')),(select outstanding_balance from history_expected_debt),'debt matches existing engine exactly');
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001',1,1)),0::bigint,'history pagination offset');
select is((select count(*) from learning_reports where student_id='61000000-0000-0000-0000-000000000001'),0::bigint,'raw draft and approved reports remain hidden');
select is((select count(*) from invoices where student_id_snapshot='61000000-0000-0000-0000-000000000001'),0::bigint,'raw invoice notes remain hidden');
select is((select count(*) from attendance_records where enrollment_id='71000000-0000-0000-0000-000000000001'),0::bigint,'raw attendance notes remain hidden');
reset role;
select set_config('request.jwt.claim.sub','',true);
update students set status='PAUSED' where id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),1::bigint,'paused learner history: student_attendance_history');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),1::bigint,'paused learner history: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),1::bigint,'paused learner history: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='INACTIVE' where id='bc000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent: student_attendance_history');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent: family portal academic');
select is((select count(*) from portal_students('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent: family portal identity');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='ACTIVE' where id='bc000000-0000-4000-8000-000000000003';
update profiles set status='SUSPENDED' where id='bc000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'suspended student: student_attendance_history');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'suspended student: family portal academic');
select is((select count(*) from portal_students('61000000-0000-0000-0000-000000000001')),0::bigint,'suspended student: family portal identity');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'suspended student: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'suspended student: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='ACTIVE' where id='bc000000-0000-4000-8000-000000000004';
update student_parents set valid_until=now()-interval '1 day' where student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'expired parent link: student_attendance_history');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'expired parent link: family portal academic');
select is((select count(*) from portal_students('61000000-0000-0000-0000-000000000001')),0::bigint,'expired parent link: family portal identity');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'expired parent link: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'expired parent link: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
update student_parents set valid_until=null,is_active=false where student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent link: student_attendance_history');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent link: family portal academic');
select is((select count(*) from portal_students('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent link: family portal identity');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent link: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'inactive parent link: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
update student_parents set is_active=true where student_id='61000000-0000-0000-0000-000000000001';
update user_roles set branch_id='11000000-0000-0000-0000-000000000002' where user_id='bc000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'wrong scoped student role: student_attendance_history');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'wrong scoped student role: family portal academic');
select is((select count(*) from portal_students('61000000-0000-0000-0000-000000000001')),0::bigint,'wrong scoped student role: family portal identity');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'wrong scoped student role: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'wrong scoped student role: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
update user_roles set branch_id='11000000-0000-0000-0000-000000000001',valid_until=now()-interval '1 day' where user_id='bc000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000004',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'expired student role: student_attendance_history');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'expired student role: family portal academic');
select is((select count(*) from portal_students('61000000-0000-0000-0000-000000000001')),0::bigint,'expired student role: family portal identity');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'expired student role: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'expired student role: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000002',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'teacher cannot borrow family history: student_attendance_history');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'teacher cannot borrow family history: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'teacher cannot borrow family history: student_debt_history');
select is((select count(*) from portal_students('61000000-0000-0000-0000-000000000001')),0::bigint,'Teacher cannot borrow family portal identity');
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'Teacher cannot borrow family academic projection');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),1::bigint,'super admin preserved: student_attendance_history');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),1::bigint,'super admin preserved: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),1::bigint,'super admin preserved: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
update student_parents set valid_from=now()+interval '1 day' where student_id='61000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'future link denied: student_attendance_history');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'future link denied: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'future link denied: student_debt_history');
reset role;
select set_config('request.jwt.claim.sub','',true);
update student_parents set valid_from=null where student_id='61000000-0000-0000-0000-000000000001';
delete from role_permissions where role_id=(select id from roles where code='PARENT') and permission_id in (select id from permissions where code in ('attendance.view_related','learning_reports.view_related','tuition.view_related'));
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from student_attendance_history('61000000-0000-0000-0000-000000000001')),0::bigint,'missing permission denied: student_attendance_history');
select is((select count(*) from student_approved_reports('61000000-0000-0000-0000-000000000001')),0::bigint,'missing permission denied: student_approved_reports');
select is((select count(*) from student_debt_history('61000000-0000-0000-0000-000000000001')),0::bigint,'missing permission denied: student_debt_history');
select ok(not has_function_privilege('anon','public.student_debt_history(uuid,integer,integer)','EXECUTE'),'anonymous history denied');
select ok(not has_function_privilege('anon','public.portal_students(uuid,integer)','EXECUTE'),'Anonymous family picker denied');
select ok(not has_function_privilege('anon','public.portal_academic_journey(uuid,integer)','EXECUTE'),'Anonymous academic projection denied');
select ok(not has_function_privilege('anon','public.portal_upcoming_sessions(uuid,integer)','EXECUTE'),'Anonymous upcoming sessions denied');
select ok(not has_function_privilege('authenticated','public.public_report_snapshot(jsonb)','EXECUTE'),'internal formatter not exposed as RPC');
select ok(not has_table_privilege('authenticated','public.payments','INSERT'),'history adds no direct payment DML');
select ok(not has_table_privilege('authenticated','public.invoices','UPDATE'),'history adds no direct invoice DML');
reset role;
select set_config('request.jwt.claim.sub','',true);
delete from role_permissions where role_id=(select id from roles where code='PARENT')
and permission_id=(select id from permissions where code='academic.view_related');
set local role authenticated;
select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000003',true);
select is((select count(*) from portal_academic_journey('61000000-0000-0000-0000-000000000001')),0::bigint,'Academic permission revocation cannot borrow profile or attendance access');
select ok(not has_function_privilege('anon','public.can_read_family_academic(uuid)','EXECUTE'),'Anonymous academic authorization helper denied');
select * from finish();
rollback;
