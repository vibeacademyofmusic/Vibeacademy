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


create extension if not exists pgtap
with schema extensions;

select plan(10);

insert into public.branches (
  id,
  code,
  name
)
values (
  '12000000-0000-0000-0000-000000000001',
  'STATUS-TEST-BRANCH',
  'Status Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '22000000-0000-0000-0000-000000000001',
  'STATUS-TEST-CURRICULUM',
  'Status Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '32000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'STATUS-TEST-LEVEL',
  'Status Test Level',
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
  '42000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  'STATUS-TEST-COURSE',
  'Status Test Course'
);

insert into public.classes (
  id,
  branch_id,
  course_id,
  code,
  name,
  status
)
values (
  '52000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'STATUS-TEST-CLASS',
  'Status Test Class',
  'ACTIVE'
);

insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values (
  '62000000-0000-0000-0000-000000000001',
  'STATUS-TEST-STUDENT',
  '12000000-0000-0000-0000-000000000001',
  'Status Test Student'
);

select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
insert into public.enrollments (
  id,
  student_id,
  class_id,
  started_at,
  status
)
values (
  '72000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  '2026-09-01',
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
  '82000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
  1,
  '09:00',
  '10:00',
  '2026-09-01',
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
values
  (
    '92000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    '2026-09-07',
    '2026-09-07 09:00:00+07',
    '2026-09-07 10:00:00+07',
    'SCHEDULED'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000001',
    '2026-09-14',
    '2026-09-14 09:00:00+07',
    '2026-09-14 10:00:00+07',
    'SCHEDULED'
  );

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '92000000-0000-0000-0000-000000000001',
      'COMPLETED'
    )
  $$,
  'P0001',
  'All students in the session roster must be marked before completion',
  'rejects completion while attendance is incomplete'
);

insert into public.attendance_records (
  session_occurrence_id,
  enrollment_id,
  status
)
values (
  '92000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'PRESENT'
);

select is(
  public.set_session_occurrence_status(
    '92000000-0000-0000-0000-000000000001',
    'COMPLETED'
  ),
  'COMPLETED',
  'completes a fully marked session'
);

select is(
  (
    select status
    from public.session_occurrences
    where id =
      '92000000-0000-0000-0000-000000000001'
  ),
  'COMPLETED',
  'stores the completed status'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '92000000-0000-0000-0000-000000000001',
      'CANCELLED'
    )
  $$,
  'P0001',
  'Invalid session status transition from COMPLETED to CANCELLED',
  'rejects a direct completed-to-cancelled transition'
);

select is(
  public.set_session_occurrence_status(
    '92000000-0000-0000-0000-000000000001',
    'SCHEDULED'
  ),
  'SCHEDULED',
  'reopens a completed session'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '92000000-0000-0000-0000-000000000001',
      'CANCELLED'
    )
  $$,
  'P0001',
  'A session with attendance records cannot be cancelled',
  'rejects cancellation when attendance exists'
);

select is(
  public.set_session_occurrence_status(
    '92000000-0000-0000-0000-000000000002',
    'CANCELLED'
  ),
  'CANCELLED',
  'cancels a session without attendance'
);

select throws_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '92000000-0000-0000-0000-000000000002',
      '72000000-0000-0000-0000-000000000001',
      'PRESENT'
    )
  $$,
  'P0001',
  'Attendance cannot be recorded for a cancelled session',
  'rejects attendance for a cancelled session'
);

select is(
  public.set_session_occurrence_status(
    '92000000-0000-0000-0000-000000000002',
    'SCHEDULED'
  ),
  'SCHEDULED',
  'restores a cancelled session'
);

select lives_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '92000000-0000-0000-0000-000000000002',
      '72000000-0000-0000-0000-000000000001',
      'PRESENT'
    )
  $$,
  'allows attendance after a cancelled session is restored'
);

select * from finish();

rollback;
