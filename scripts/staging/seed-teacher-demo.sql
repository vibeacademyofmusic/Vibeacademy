-- STAGING ONLY. Demo data for the teacher workspace (account "Huy Phương", branch Cần Thơ).
-- Every row is prefixed TEST-/"Thử nghiệm". Idempotent. Never run on production.
do $$
declare
  uid constant uuid := '55edf79b-7ec8-429d-8d7e-7098d65b9372';
  br constant uuid := 'ec738dd0-19b3-49e9-b216-ef34070c5e93';
  maker constant uuid := 'a01b1310-9046-435a-81d8-75e4c899f883';
  checker constant uuid := 'ecdc706e-fb0d-46b0-8761-c374d361190c';
  tch uuid; room uuid; cls uuid; sc1 uuid; sc2 uuid; emp uuid; trip uuid; stu uuid; i int;
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not exists (select 1 from branches where id = br and name = 'Vibe Academy Cần Thơ') then raise exception 'not the staging branch'; end if;

  select id into tch from teachers where user_id = uid;
  if tch is null then
    insert into teachers(user_id, teacher_code, status, full_name, hire_date)
    values (uid, 'TEST-GV-HUYPHUONG', 'ACTIVE', 'Huy Phương', today) returning id into tch;
  end if;

  select id into room from rooms where branch_id = br and code = 'TEST-P1';
  if room is null then insert into rooms(branch_id, code, name, capacity, status) values (br, 'TEST-P1', 'Phòng thử nghiệm 1', 8, 'ACTIVE') returning id into room; end if;

  select id into cls from classes where code = 'TEST-GV-PIANO';
  if cls is null then
    insert into classes(branch_id, curriculum_id, accepted_from_level_id, accepted_to_level_id, code, name, class_type, capacity, start_date, status)
    values (br, 'f573dda6-63d4-41e1-bf50-098f9dacddd6', '1b56f364-e136-4200-8829-22e1b4582adb', 'cb940721-edb9-4167-bc44-8b2cb944446e', 'TEST-GV-PIANO', 'Piano thử nghiệm — Huy Phương', 'GROUP', 6, today, 'ACTIVE') returning id into cls;
    insert into class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at) values (cls, tch, 'PRIMARY', true, today);
    insert into schedules(class_id, room_id, day_of_week, start_time, end_time, effective_from, status)
    values (cls, room, extract(isodow from today)::smallint, '22:00', '23:59', today, 'ACTIVE') returning id into sc1;
    insert into schedules(class_id, room_id, day_of_week, start_time, end_time, effective_from, status)
    values (cls, room, extract(isodow from today + 1)::smallint, '09:00', '10:30', today, 'ACTIVE') returning id into sc2;
    for i in 1..4 loop
      insert into students(student_code, full_name, default_branch_id, status, admission_date)
      values ('TEST-HV-' || i, (array['Nguyễn Minh Anh','Trần Gia Bảo','Lê Khánh Chi','Phạm Đức Duy'])[i] || ' (thử nghiệm)', br, 'ACTIVE', today) returning id into stu;
      insert into student_curriculum_enrollments(student_id, curriculum_id, current_level_id, is_primary, status, started_at)
      values (stu, 'f573dda6-63d4-41e1-bf50-098f9dacddd6', '1b56f364-e136-4200-8829-22e1b4582adb', true, 'ACTIVE', today);
      insert into enrollments(student_id, class_id, enrolled_at, started_at, status) values (stu, cls, today, today, 'ACTIVE');
    end loop;
    for i in 0..2 loop
      insert into session_occurrences(schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type, original_starts_at, original_ends_at, original_room_id)
      values (sc1, today + 7*i, ((today + 7*i)::text || ' 22:00+07')::timestamptz, ((today + 7*i)::text || ' 23:59+07')::timestamptz, room, 'SCHEDULED', 'REGULAR',
              ((today + 7*i)::text || ' 22:00+07')::timestamptz, ((today + 7*i)::text || ' 23:59+07')::timestamptz, room);
      insert into session_occurrences(schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type, original_starts_at, original_ends_at, original_room_id)
      values (sc2, today + 1 + 7*i, ((today + 1 + 7*i)::text || ' 09:00+07')::timestamptz, ((today + 1 + 7*i)::text || ' 10:30+07')::timestamptz, room, 'SCHEDULED', 'REGULAR',
              ((today + 1 + 7*i)::text || ' 09:00+07')::timestamptz, ((today + 1 + 7*i)::text || ' 10:30+07')::timestamptz, room);
    end loop;
  end if;

  select id into emp from employees where profile_id = uid;
  if emp is null then
    insert into employees(employee_code, home_unit, hire_date, profile_id, teacher_id, created_by)
    values ('TEST-HQ-GV01', 'HQ', today, uid, tch, maker) returning id into emp;
    insert into employee_versions(employee_id, version, effective_on, full_name, unit_code, employee_group, employment_status, pay_type, reason, created_by)
    values (emp, 1, today, 'Huy Phương', 'HQ', 'PILOT_ACCESS', 'ACTIVE', 'MONTHLY', 'Staging teacher workspace demo — temporary test record', maker);
  end if;
  if not exists (select 1 from employee_trips where employee_id = emp) then
    insert into employee_trips(employee_id, origin_unit, destination_unit, destination_branch_id, starts_on, ends_on, reason, maker)
    values (emp, 'HQ', 'ST', br, today, today + 1, 'Thử nghiệm: đi dạy kèm tại Sóc Trăng', maker) returning id into trip;
    insert into employee_trip_reviews(trip_id, decision, reason, checker) values (trip, 'APPROVED', 'Duyệt cho thử nghiệm staging', checker);
  end if;
end $$;
