begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches (id, code, name) values
  ('c7000000-0000-4000-8000-000000000001', 'TEMPORAL-BRANCH', 'Temporal Branch');
insert into public.curriculums (id, code, name) values
  ('c7000000-0000-4000-8000-000000000011', 'TEMPORAL-CURRICULUM', 'Temporal Curriculum');
insert into public.curriculum_levels (id, curriculum_id, code, name, sequence_no) values
  ('c7000000-0000-4000-8000-000000000012', 'c7000000-0000-4000-8000-000000000011', 'TEMPORAL-LEVEL', 'Temporal Level', 1);
insert into public.courses (id, curriculum_id, level_id, code, name) values
  ('c7000000-0000-4000-8000-000000000013', 'c7000000-0000-4000-8000-000000000011', 'c7000000-0000-4000-8000-000000000012', 'TEMPORAL-COURSE', 'Temporal Course');
insert into public.classes (id, branch_id, course_id, code, name, status) values
  ('c7000000-0000-4000-8000-0000000000a1', 'c7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000013', 'TEMPORAL-CLASS', 'Temporal Class', 'ACTIVE');
insert into public.teachers (id, teacher_code, full_name) values
  ('c7000000-0000-4000-8000-0000000000b1', 'TEMPORAL-A', 'Teacher A'),
  ('c7000000-0000-4000-8000-0000000000b2', 'TEMPORAL-B', 'Teacher B'),
  ('c7000000-0000-4000-8000-0000000000b3', 'TEMPORAL-C', 'Teacher C');
insert into public.teacher_branches (teacher_id, branch_id) values
  ('c7000000-0000-4000-8000-0000000000b1', 'c7000000-0000-4000-8000-000000000001'),
  ('c7000000-0000-4000-8000-0000000000b2', 'c7000000-0000-4000-8000-000000000001'),
  ('c7000000-0000-4000-8000-0000000000b3', 'c7000000-0000-4000-8000-000000000001');
insert into public.schedules (id, class_id, day_of_week, start_time, end_time, effective_from, timezone, status) values
  ('c7000000-0000-4000-8000-0000000000c1', 'c7000000-0000-4000-8000-0000000000a1', 1, '09:00', '10:00', '2026-01-01', 'Asia/Ho_Chi_Minh', 'ACTIVE');
insert into public.session_occurrences (id, schedule_id, occurrence_date, starts_at, ends_at, status) values
  ('c7000000-0000-4000-8000-0000000000d1', 'c7000000-0000-4000-8000-0000000000c1', '2026-09-21', '2026-09-21 09:00+07', '2026-09-21 10:00+07', 'SCHEDULED'),
  ('c7000000-0000-4000-8000-0000000000d2', 'c7000000-0000-4000-8000-0000000000c1', '2026-09-22', '2026-09-22 09:00+07', '2026-09-22 10:00+07', 'SCHEDULED');
insert into public.class_teachers (class_id, teacher_id, teacher_role, is_active, assigned_at) values
  ('c7000000-0000-4000-8000-0000000000a1', 'c7000000-0000-4000-8000-0000000000b1', 'PRIMARY', true, '2026-01-01');

insert into auth.users (id) values ('c7000000-0000-4000-8000-0000000000e1');
insert into public.roles (code, name) values ('SUPER_ADMIN', 'Admin') on conflict (code) do nothing;
insert into public.profiles (id, status) values ('c7000000-0000-4000-8000-0000000000e1', 'ACTIVE');
insert into public.user_roles (user_id, role_id)
select 'c7000000-0000-4000-8000-0000000000e1', id from public.roles where code = 'SUPER_ADMIN';
select set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-0000000000e1', true);

set local role authenticated;
select lives_ok($$select set_session_teacher('c7000000-0000-4000-8000-0000000000d1','c7000000-0000-4000-8000-0000000000b2','SUBSTITUTE','Teacher A absent')$$, 'substitute assigned');
reset role;
update public.session_occurrences set status = 'COMPLETED' where id = 'c7000000-0000-4000-8000-0000000000d1';

select is(
  (select primary_teacher_id from public.session_actual_teachers where session_id = 'c7000000-0000-4000-8000-0000000000d1'),
  'c7000000-0000-4000-8000-0000000000b1'::uuid,
  'completed session primary is A before handoff'
);
select is(
  (select teacher_id from public.session_actual_teachers where session_id = 'c7000000-0000-4000-8000-0000000000d1'),
  'c7000000-0000-4000-8000-0000000000b2'::uuid,
  'completed session actual is substitute B'
);

set local role authenticated;
select lives_ok($$select add_compensation_rule('c7000000-0000-4000-8000-0000000000b2','c7000000-0000-4000-8000-000000000001','HOURLY',100000,'VND','2026-09-01','2026-09-30')$$, 'substitute compensation');
select lives_ok($$select create_payroll_period('c7000000-0000-4000-8000-000000000001','2026-09-01')$$, 'payroll period');
select lives_ok($$select generate_teacher_payroll(id) from public.payroll_periods where branch_id = 'c7000000-0000-4000-8000-000000000001' and starts_on = '2026-09-01'$$, 'payroll generated');
reset role;

select is(
  (select actual_teacher_id from public.payroll_earning_lines where session_id = 'c7000000-0000-4000-8000-0000000000d1'),
  'c7000000-0000-4000-8000-0000000000b2'::uuid,
  'payroll pays substitute B'
);

update public.class_teachers
set is_active = false, ended_at = '2026-09-21'
where class_id = 'c7000000-0000-4000-8000-0000000000a1'
  and teacher_id = 'c7000000-0000-4000-8000-0000000000b1';
insert into public.class_teachers (class_id, teacher_id, teacher_role, is_active, assigned_at) values
  ('c7000000-0000-4000-8000-0000000000a1', 'c7000000-0000-4000-8000-0000000000b3', 'PRIMARY', true, '2026-09-22');

select is(
  (select primary_teacher_id from public.session_actual_teachers where session_id = 'c7000000-0000-4000-8000-0000000000d1'),
  'c7000000-0000-4000-8000-0000000000b1'::uuid,
  '21 Sep still resolves primary A'
);
select is(
  (select teacher_id from public.session_actual_teachers where session_id = 'c7000000-0000-4000-8000-0000000000d1'),
  'c7000000-0000-4000-8000-0000000000b2'::uuid,
  'completed actual stays substitute B after handoff to C'
);
select is(
  (select teacher_id from public.session_teacher_snapshots where session_id = 'c7000000-0000-4000-8000-0000000000d1'),
  'c7000000-0000-4000-8000-0000000000b2'::uuid,
  'snapshot stays B'
);
select is(
  (select primary_teacher_id from public.session_actual_teachers where session_id = 'c7000000-0000-4000-8000-0000000000d2'),
  'c7000000-0000-4000-8000-0000000000b3'::uuid,
  '22 Sep resolves primary C'
);
select is(
  (select teacher_id from public.session_actual_teachers where session_id = 'c7000000-0000-4000-8000-0000000000d2'),
  'c7000000-0000-4000-8000-0000000000b3'::uuid,
  'future session actual follows the new primary'
);
select is(
  (select count(*) from public.class_teachers
    where class_id = 'c7000000-0000-4000-8000-0000000000a1'
      and teacher_role = 'PRIMARY'
      and assigned_at <= '2026-09-21'
      and (ended_at is null or ended_at >= '2026-09-21')
      and (is_active or ended_at is not null)),
  1::bigint,
  '21 Sep has one primary'
);
select is(
  (select count(*) from public.class_teachers
    where class_id = 'c7000000-0000-4000-8000-0000000000a1'
      and teacher_role = 'PRIMARY'
      and assigned_at <= '2026-09-22'
      and (ended_at is null or ended_at >= '2026-09-22')
      and (is_active or ended_at is not null)),
  1::bigint,
  '22 Sep has one primary'
);
select is(
  (select actual_teacher_id from public.payroll_earning_lines where session_id = 'c7000000-0000-4000-8000-0000000000d1'),
  'c7000000-0000-4000-8000-0000000000b2'::uuid,
  'historical payroll stays with substitute B after the class primary changes'
);

select * from finish();
rollback;
