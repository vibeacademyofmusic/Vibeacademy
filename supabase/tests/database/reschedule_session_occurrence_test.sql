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

select plan(13);

insert into public.branches (
  id,
  code,
  name
)
values
  (
    '14000000-0000-0000-0000-000000000001',
    'RESCHEDULE-TEST-BRANCH-A',
    'Reschedule Test Branch A'
  ),
  (
    '14000000-0000-0000-0000-000000000002',
    'RESCHEDULE-TEST-BRANCH-B',
    'Reschedule Test Branch B'
  );

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '24000000-0000-0000-0000-000000000001',
  'RESCHEDULE-TEST-CURRICULUM',
  'Reschedule Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '34000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001',
  'RESCHEDULE-TEST-LEVEL',
  'Reschedule Test Level',
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
  '44000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  'RESCHEDULE-TEST-COURSE',
  'Reschedule Test Course'
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
    '54000000-0000-0000-0000-000000000011',
    '14000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'RESCHEDULE-TEST-CLASS-A',
    'Reschedule Test Class A',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000012',
    '14000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'RESCHEDULE-TEST-CLASS-B',
    'Reschedule Test Class B',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000013',
    '14000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'RESCHEDULE-TEST-CLASS-C',
    'Reschedule Test Class C',
    'ACTIVE'
  );

insert into public.rooms (
  id,
  branch_id,
  code,
  name,
  status
)
values
  (
    '54000000-0000-0000-0000-000000000021',
    '14000000-0000-0000-0000-000000000001',
    'RESCHEDULE-ROOM-A',
    'Reschedule Room A',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000022',
    '14000000-0000-0000-0000-000000000001',
    'RESCHEDULE-ROOM-B',
    'Reschedule Room B',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000023',
    '14000000-0000-0000-0000-000000000001',
    'RESCHEDULE-ROOM-INACTIVE',
    'Reschedule Room Inactive',
    'INACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000024',
    '14000000-0000-0000-0000-000000000002',
    'RESCHEDULE-ROOM-OTHER-BRANCH',
    'Reschedule Room Other Branch',
    'ACTIVE'
  );

insert into public.teachers (
  id,
  teacher_code,
  full_name,
  status
)
values (
  '64000000-0000-0000-0000-000000000001',
  'RESCHEDULE-TEST-TEACHER',
  'Reschedule Test Teacher',
  'ACTIVE'
);

insert into public.class_teachers (
  id,
  class_id,
  teacher_id,
  teacher_role,
  is_active,
  assigned_at
)
values
  (
    '74000000-0000-0000-0000-000000000011',
    '54000000-0000-0000-0000-000000000011',
    '64000000-0000-0000-0000-000000000001',
    'PRIMARY',
    true,
    '2026-09-01'
  ),
  (
    '74000000-0000-0000-0000-000000000012',
    '54000000-0000-0000-0000-000000000012',
    '64000000-0000-0000-0000-000000000001',
    'PRIMARY',
    true,
    '2026-09-01'
  );

insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values (
  '64000000-0000-0000-0000-000000000002',
  'RESCHEDULE-TEST-STUDENT',
  '14000000-0000-0000-0000-000000000001',
  'Reschedule Test Student'
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
  '74000000-0000-0000-0000-000000000021',
  '64000000-0000-0000-0000-000000000002',
  '54000000-0000-0000-0000-000000000011',
  '2026-09-01',
  'ACTIVE'
);

insert into public.schedules (
  id,
  class_id,
  room_id,
  day_of_week,
  start_time,
  end_time,
  effective_from,
  timezone,
  status
)
values
  (
    '84000000-0000-0000-0000-000000000011',
    '54000000-0000-0000-0000-000000000011',
    '54000000-0000-0000-0000-000000000021',
    1,
    '09:00',
    '10:00',
    '2026-09-01',
    'Asia/Ho_Chi_Minh',
    'ACTIVE'
  ),
  (
    '84000000-0000-0000-0000-000000000012',
    '54000000-0000-0000-0000-000000000012',
    '54000000-0000-0000-0000-000000000022',
    1,
    '11:00',
    '12:00',
    '2026-09-01',
    'Asia/Ho_Chi_Minh',
    'ACTIVE'
  ),
  (
    '84000000-0000-0000-0000-000000000013',
    '54000000-0000-0000-0000-000000000013',
    '54000000-0000-0000-0000-000000000021',
    1,
    '13:00',
    '14:00',
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
  room_id,
  status
)
values
  (
    '94000000-0000-0000-0000-000000000011',
    '84000000-0000-0000-0000-000000000011',
    '2026-09-07',
    '2026-09-07 09:00:00+07',
    '2026-09-07 10:00:00+07',
    '54000000-0000-0000-0000-000000000021',
    'SCHEDULED'
  ),
  (
    '94000000-0000-0000-0000-000000000012',
    '84000000-0000-0000-0000-000000000011',
    '2026-09-14',
    '2026-09-10 14:00:00+07',
    '2026-09-10 15:00:00+07',
    '54000000-0000-0000-0000-000000000022',
    'SCHEDULED'
  ),
  (
    '94000000-0000-0000-0000-000000000013',
    '84000000-0000-0000-0000-000000000012',
    '2026-09-14',
    '2026-09-10 16:00:00+07',
    '2026-09-10 17:00:00+07',
    '54000000-0000-0000-0000-000000000022',
    'SCHEDULED'
  ),
  (
    '94000000-0000-0000-0000-000000000014',
    '84000000-0000-0000-0000-000000000013',
    '2026-09-14',
    '2026-09-10 18:00:00+07',
    '2026-09-10 19:00:00+07',
    '54000000-0000-0000-0000-000000000021',
    'SCHEDULED'
  ),
  (
    '94000000-0000-0000-0000-000000000015',
    '84000000-0000-0000-0000-000000000011',
    '2026-09-21',
    '2026-09-21 09:00:00+07',
    '2026-09-21 10:00:00+07',
    '54000000-0000-0000-0000-000000000021',
    'COMPLETED'
  ),
  (
    '94000000-0000-0000-0000-000000000016',
    '84000000-0000-0000-0000-000000000011',
    '2026-09-28',
    '2026-09-28 09:00:00+07',
    '2026-09-28 10:00:00+07',
    '54000000-0000-0000-0000-000000000021',
    'SCHEDULED'
  );

insert into public.attendance_records (
  session_occurrence_id,
  enrollment_id,
  status
)
values (
  '94000000-0000-0000-0000-000000000016',
  '74000000-0000-0000-0000-000000000021',
  'PRESENT'
);

select is(
  public.reschedule_session_occurrence(
    '94000000-0000-0000-0000-000000000011',
    '2026-09-09 10:00:00+07',
    '2026-09-09 11:00:00+07',
    '54000000-0000-0000-0000-000000000022',
    '  Student requested a different day  '
  ),
  '94000000-0000-0000-0000-000000000011'::uuid,
  'reschedules a scheduled occurrence without conflicts'
);

select ok(
  (
    select
      starts_at = '2026-09-09 10:00:00+07'::timestamptz
      and ends_at = '2026-09-09 11:00:00+07'::timestamptz
      and room_id =
        '54000000-0000-0000-0000-000000000022'
      and occurrence_date = '2026-09-07'
      and original_starts_at =
        '2026-09-07 09:00:00+07'::timestamptz
      and original_ends_at =
        '2026-09-07 10:00:00+07'::timestamptz
      and original_room_id =
        '54000000-0000-0000-0000-000000000021'
      and rescheduled_at is not null
      and reschedule_reason =
        'Student requested a different day'
    from public.session_occurrences
    where id = '94000000-0000-0000-0000-000000000011'
  ),
  'stores the new slot while preserving occurrence identity'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 12:00:00+07',
      '2026-09-09 13:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      '  '
    )
  $$,
  'P0001',
  'Reschedule reason is required',
  'requires a reschedule reason'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 13:00:00+07',
      '2026-09-09 12:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Invalid time'
    )
  $$,
  'P0001',
  'End time must be after start time',
  'rejects an invalid time range'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 10:00:00+07',
      '2026-09-09 11:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'No change'
    )
  $$,
  'P0001',
  'Reschedule must change the time or room',
  'rejects a reschedule with no changes'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000099',
      '2026-09-09 12:00:00+07',
      '2026-09-09 13:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Missing session'
    )
  $$,
  'P0001',
  'Session not found',
  'rejects an unknown occurrence'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000015',
      '2026-09-21 12:00:00+07',
      '2026-09-21 13:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Completed session'
    )
  $$,
  'P0001',
  'Only scheduled sessions can be rescheduled',
  'rejects a completed occurrence'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000016',
      '2026-09-28 12:00:00+07',
      '2026-09-28 13:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Attendance exists'
    )
  $$,
  'P0001',
  'Session with attendance cannot be rescheduled',
  'rejects an occurrence with attendance'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 12:00:00+07',
      '2026-09-09 13:00:00+07',
      '54000000-0000-0000-0000-000000000023',
      'Inactive room'
    )
  $$,
  'P0001',
  'Room is not available',
  'rejects an inactive room'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 12:00:00+07',
      '2026-09-09 13:00:00+07',
      '54000000-0000-0000-0000-000000000024',
      'Other branch room'
    )
  $$,
  'P0001',
  'Room must belong to the same branch as the class',
  'rejects a room from another branch'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-10 14:30:00+07',
      '2026-09-10 15:30:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Class conflict'
    )
  $$,
  'P0001',
  'This class already has an overlapping session',
  'rejects an overlapping occurrence for the same class'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-10 18:30:00+07',
      '2026-09-10 18:45:00+07',
      '54000000-0000-0000-0000-000000000021',
      'Room conflict'
    )
  $$,
  'P0001',
  'This room is already occupied during that time',
  'rejects an overlapping occurrence in the same room'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-10 16:30:00+07',
      '2026-09-10 16:45:00+07',
      '54000000-0000-0000-0000-000000000021',
      'Teacher conflict'
    )
  $$,
  'P0001',
  'A teacher assigned to this class is already teaching another class at that time',
  'rejects an overlapping occurrence for the same teacher'
);

select * from finish();

rollback;
