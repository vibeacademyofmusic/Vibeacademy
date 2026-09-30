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
delete from public.class_teachers where teacher_id in (select id from public.teachers where teacher_code like 'FIX-%');
insert into class_teachers(class_id,teacher_id,assigned_at) values('51000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','2026-08-01');
update session_occurrences set status='COMPLETED' where id='91000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select is(has_role('SUPER_ADMIN'),false,'student is not admin');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',2,null,null,null,'',array['NOT_A_REASON'])$$,'P0001','Unsupported feedback reason','unsupported reason rejected');
select lives_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',2,3,2,4,'Student comment',array['CONTENT_UNCLEAR','PACE_INAPPROPRIATE'])$$,'valid student submits');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',4)$$,'23505',null,'duplicate blocked in database');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002','STUDENT',4)$$,'P0001','Invalid respondent relationship','unrelated student blocked');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000099','61000000-0000-0000-0000-000000000001','STUDENT',4)$$,'P0001','Session is not eligible for feedback','wrong session blocked');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',6)$$,'P0001','Invalid ratings or comment','overall range validated');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','STUDENT',4,0)$$,'P0001','Invalid ratings or comment','optional rating range validated');
select is((select count(*) from lesson_feedback),0::bigint,'respondent cannot read raw feedback');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000003',true);
select is(has_role('SUPER_ADMIN'),false,'parent is not admin');
select throws_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','PARENT',5,null,null,null,'',array['CONTENT_UNCLEAR'])$$,'P0001','Unsupported feedback reason','positive rating rejects improvement reason');
select lives_ok($$select submit_lesson_feedback('91000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','PARENT',5,null,null,null,'',array['TEACHER_CLEAR_GUIDANCE','CONTENT_APPROPRIATE'])$$,'valid parent submits optional dimensions omitted');
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
select is((select count(*) from lesson_feedback_reasons r join lesson_feedback f on f.id=r.feedback_id where f.respondent_type='STUDENT'),2::bigint,'student reasons stored');
select is((select count(*) from lesson_feedback_reasons r join lesson_feedback f on f.id=r.feedback_id where f.respondent_type='PARENT'),2::bigint,'parent reasons stored');
select throws_ok($$update lesson_feedback_reasons set reason_label='changed'$$,'P0001','Submitted feedback is immutable','reasons immutable');
select throws_ok($$delete from lesson_feedback where student_id='61000000-0000-0000-0000-000000000001'$$,'P0001','Feedback history cannot be deleted','feedback history preserved');
select * from finish();
rollback;
