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
-- A payroll self-reader must have a live profile and scoped TEACHER role.
insert into public.profiles(id,status) values('b1000000-0000-0000-0000-000000000004','ACTIVE');
insert into public.user_roles(user_id,role_id,branch_id) select 'b1000000-0000-0000-0000-000000000004',id,'11000000-0000-0000-0000-000000000001' from public.roles where code='TEACHER';
update students set user_id='b1000000-0000-0000-0000-000000000002' where id='61000000-0000-0000-0000-000000000001';
insert into parents(id,user_id,parent_code) values('f1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','FEEDBACK-PARENT');
insert into student_parents(student_id,parent_id) values('61000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001');
insert into teachers(id,teacher_code,full_name) values('f2000000-0000-0000-0000-000000000001','FEEDBACK-TEACHER','Feedback Teacher');
insert into class_teachers(class_id,teacher_id,assigned_at) values('51000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','2026-08-01');

insert into teachers(id,teacher_code,full_name) values('f2000000-0000-0000-0000-000000000002','SUBSTITUTE','Substitute');
insert into teacher_branches(teacher_id,branch_id) values('f2000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001');

insert into teacher_branches(teacher_id,branch_id) values('f2000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001');
update teachers set user_id='b1000000-0000-0000-0000-000000000004' where id='f2000000-0000-0000-0000-000000000002';
set local role authenticated;
select lives_ok($$select add_compensation_rule('f2000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','MONTHLY',1000,'VND','2026-08-01','2026-08-31')$$,'monthly rule');
select lives_ok($$select add_compensation_rule('f2000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','HOURLY',100,'VND','2026-08-01','2026-08-15')$$,'first hourly rate');
select lives_ok($$select add_compensation_rule('f2000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','HOURLY',200,'VND','2026-08-16','2026-08-31')$$,'next effective rate');
select throws_ok($$select add_compensation_rule('f2000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','HOURLY',300,'VND','2026-08-10','2026-08-20')$$,'P0001','Compensation dates overlap','overlap rejected');
select set_session_teacher('91000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002','SUBSTITUTE','Payroll substitute');
update session_occurrences set status='COMPLETED' where id='91000000-0000-0000-0000-000000000001';
reset role;
insert into session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,status) values
('91000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001','2026-08-17','2026-08-17 09:00+07','2026-08-17 10:00+07','SCHEDULED'),
('91000000-0000-0000-0000-000000000003','81000000-0000-0000-0000-000000000001','2026-08-24','2026-08-24 09:00+07','2026-08-24 10:00+07','CANCELLED');
insert into attendance_records(session_occurrence_id,enrollment_id,status) values('91000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001','PRESENT');
set local role authenticated;
select set_session_teacher('91000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002','SUBSTITUTE','Second session');
update session_occurrences set status='COMPLETED' where id='91000000-0000-0000-0000-000000000002';
select create_payroll_period('11000000-0000-0000-0000-000000000001','2026-08-01');
select lives_ok($$select generate_teacher_payroll(id) from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001'$$,'generate');
select is((select base_salary from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000001'),1000::numeric,'monthly full salary');
select is((select teaching_hours from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000001'),0::numeric,'primary not paid substitute hours');
select is((select hourly_earnings from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000002'),300::numeric,'effective hourly rates');
select is((select teaching_hours from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000002'),2::numeric,'two hours substitute');
select is((select count(*) from payroll_earning_lines where session_id='91000000-0000-0000-0000-000000000003'),0::bigint,'cancelled excluded');
select lives_ok($$select generate_teacher_payroll(id) from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001'$$,'repeat generation idempotent');
select is((select count(*) from payroll_earning_lines where actual_teacher_id='f2000000-0000-0000-0000-000000000002'),2::bigint,'no duplicated sessions');
select transition_payroll(id,version,'DRAFT','Rebuild sources') from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001';
reset role;
update teacher_compensation_rules set effective_from='2026-08-18' where teacher_id='f2000000-0000-0000-0000-000000000002' and rate=200;
set local role authenticated;
select throws_ok($$select generate_teacher_payroll(id) from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001'$$,'P0001','Completed session has unresolved teacher or compensation','gap does not fallback');
reset role;
update teacher_compensation_rules set effective_from='2026-08-16',rate=250 where teacher_id='f2000000-0000-0000-0000-000000000002' and rate=200;
update teacher_compensation_rules set effective_from='2026-08-02' where teacher_id='f2000000-0000-0000-0000-000000000001';
set local role authenticated;
select throws_ok($$select generate_teacher_payroll(id) from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001'$$,'P0001','Monthly rule must cover full period; pay type and currency cannot change within period','partial monthly coverage rejected');
reset role;
update teacher_compensation_rules set effective_from='2026-08-01' where teacher_id='f2000000-0000-0000-0000-000000000001';
set local role authenticated;
select lives_ok($$select generate_teacher_payroll(id) from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001'$$,'regenerate draft after source change');
select is((select hourly_earnings from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000002'),350::numeric,'new source rate applied');
select add_payroll_adjustment(id,'BONUS',50,'Local bonus') from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000002';
select is((select gross_amount from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000002'),400::numeric,'bonus added');
select is((select sum(amount) from payroll_earning_lines where actual_teacher_id='f2000000-0000-0000-0000-000000000002'),350::numeric,'earning lines unchanged by adjustment');
select transition_payroll(id,version,'REVIEW','Review') from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000004',true);
select is((select count(*) from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000002'),0::bigint,'teacher cannot see draft review payroll');
select throws_ok($$select generate_teacher_payroll('00000000-0000-0000-0000-000000000000')$$,'P0001','Unauthorized','nonadmin generation denied');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
select lives_ok($$select transition_payroll(id,version,'APPROVED','Reviewed amounts') from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001'$$,'approve');
select throws_ok($$select generate_teacher_payroll(id) from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001'$$,'P0001','Payroll generation requires DRAFT','approved cannot regenerate');
select throws_ok($$select add_payroll_adjustment(id,'BONUS',1,'After approval') from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000002'$$,'P0001','Adjustment requires generated or review payroll','approved cannot adjust');
select is((select approved_by from payroll_adjustments where reason='Local bonus'),auth.uid(),'adjustment approval actor');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000004',true);
select is((select count(*) from teacher_payrolls),1::bigint,'teacher sees only own approved payroll');
select is((select count(*) from payroll_earning_lines),2::bigint,'teacher sees only own lines');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000003',true);
select is((select count(*) from teacher_payrolls),0::bigint,'parent cannot read payroll');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
select lives_ok($$select transition_payroll(id,version,'FINALIZED','Final approved snapshot') from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001'$$,'finalize');
select throws_ok($$update teacher_payrolls set gross_amount=0$$,'42501',null,'direct authenticated writes denied');
reset role;
select throws_ok($$update teacher_payrolls set gross_amount=0 where teacher_id='f2000000-0000-0000-0000-000000000002'$$,'P0001','Approved payroll is immutable','finalized totals protected by trigger');
select throws_ok($$delete from payroll_earning_lines where actual_teacher_id='f2000000-0000-0000-0000-000000000002'$$,'P0001','Approved payroll is immutable','finalized lines protected');
select throws_ok($$update payroll_periods set status='DRAFT' where branch_id='11000000-0000-0000-0000-000000000001'$$,'P0001','Approved payroll is immutable','finalized period protected');
select throws_ok($$insert into payroll_earning_lines(payroll_id,actual_teacher_id,branch_id,earned_on,earning_type,rate,amount) select id,teacher_id,branch_id,'2026-08-01','MONTHLY_BASE',1,1 from teacher_payrolls where teacher_id='f2000000-0000-0000-0000-000000000002'$$,'P0001','Approved payroll is immutable','new lines cannot enter finalized payroll');
select throws_ok($$delete from payroll_events where period_id in(select id from payroll_periods where branch_id='11000000-0000-0000-0000-000000000001')$$,'P0001','Payroll audit is immutable','audit protected');
select * from finish();
rollback;
