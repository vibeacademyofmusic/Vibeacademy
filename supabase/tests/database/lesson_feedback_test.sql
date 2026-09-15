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
update students set user_id='b1000000-0000-0000-0000-000000000002' where id='61000000-0000-0000-0000-000000000001';
insert into parents(id,user_id,parent_code) values('f1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','FEEDBACK-PARENT');
insert into student_parents(student_id,parent_id) values('61000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001');
insert into teachers(id,teacher_code,full_name) values('f2000000-0000-0000-0000-000000000001','FEEDBACK-TEACHER','Feedback Teacher');
insert into class_teachers(class_id,teacher_id,assigned_at) values('51000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','2026-08-01');
update session_occurrences set status='COMPLETED' where id='91000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is(has_role('SUPER_ADMIN'),false,'student is not admin');
select lives_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',2,3,2,4,'Student comment')$$,'valid student submits');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',4)$$,'23505',null,'duplicate blocked in database');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002','STUDENT',4)$$,'P0001','Invalid respondent relationship','unrelated student blocked');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000099','61000000-0000-0000-0000-000000000001','STUDENT',4)$$,'P0001','Session is not eligible for feedback','wrong session blocked');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',6)$$,'P0001','Invalid ratings or comment','overall range validated');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',4,0)$$,'P0001','Invalid ratings or comment','optional rating range validated');
select is((select count(*) from lesson_feedback),0::bigint,'respondent cannot read raw feedback');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000003',true);
select is(has_role('SUPER_ADMIN'),false,'parent is not admin');
select lives_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','PARENT',5)$$,'valid parent submits optional dimensions omitted');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','PARENT',5)$$,'23505',null,'parent duplicate blocked');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000004',true);
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','PARENT',4)$$,'P0001','Invalid respondent relationship','unrelated parent blocked');
select throws_ok($$select resolve_lesson_feedback('00000000-0000-0000-0000-000000000000',1,'RESOLVED','note')$$,'P0001','Unauthorized','non admin cannot resolve');
select is((select count(*) from lesson_feedback_teacher_monthly),0::bigint,'aggregate privacy');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',4)$$,'P0001','Invalid respondent relationship','admin cannot bypass respondent relationship');
select is((select count(*) from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001'),2::bigint,'student and parent separate identities');
select is((select resolution_status from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001' and respondent_type='STUDENT'),'NEEDS_REVIEW','low rating queue');
select is((select resolution_status from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001' and respondent_type='PARENT'),'NORMAL','normal rating');
select lives_ok($$select resolve_lesson_feedback(id,version,'IN_REVIEW','Contacting parent') from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001' and respondent_type='STUDENT'$$,'start review');
select throws_ok($$select resolve_lesson_feedback(id,1,'RESOLVED','Stale') from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001' and respondent_type='STUDENT'$$,'P0001','Feedback changed; reload','stale resolution blocked');
select lives_ok($$select resolve_lesson_feedback(id,version,'RESOLVED','Discussed practice plan') from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001' and respondent_type='STUDENT'$$,'resolve');
select ok((select resolved_by=auth.uid() and resolved_at is not null and overall_rating=2 from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001' and respondent_type='STUDENT'),'resolution attribution and immutable rating');
select lives_ok($$select resolve_lesson_feedback(id,version,'IN_REVIEW','Follow up') from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001' and respondent_type='STUDENT'$$,'reopen');
select is((select feedback_count from lesson_feedback_teacher_monthly where teacher_id='f2000000-0000-0000-0000-000000000001'),2::bigint,'teacher count');
select is((select average_overall_rating from lesson_feedback_teacher_monthly where teacher_id='f2000000-0000-0000-0000-000000000001'),3.5::numeric,'teacher average');
select is((select low_rating_count from lesson_feedback_branch_monthly where branch_id='11000000-0000-0000-0000-000000000001'),1::bigint,'branch low count');
select throws_ok($$update lesson_feedback set overall_rating=5$$,'42501',null,'raw feedback cannot be edited');
reset role;
select throws_ok($$delete from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001'$$,'P0001','Feedback history cannot be deleted','feedback history preserved');
select * from finish();
rollback;
