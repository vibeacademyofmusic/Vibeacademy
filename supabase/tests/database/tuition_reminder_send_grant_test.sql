begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users(id) values
  ('c0e1b210-0000-4000-8000-000000000001'),
  ('c0e1b210-0000-4000-8000-000000000002'),
  ('c0e1b210-0000-4000-8000-000000000003');
insert into public.profiles(id, full_name, status) values
  ('c0e1b210-0000-4000-8000-000000000001', 'Send Admin', 'ACTIVE'),
  ('c0e1b210-0000-4000-8000-000000000002', 'Send Care', 'ACTIVE'),
  ('c0e1b210-0000-4000-8000-000000000003', 'Send Prepare', 'ACTIVE');
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1b210-0000-4000-8000-000000000001', id, null from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1b210-0000-4000-8000-000000000002', id, (select id from public.branches where code = 'V01') from public.roles where code = 'TUITION_CARE';
insert into public.roles(code, name, is_system) values ('TUITION_PREPARE_ONLY', 'Chỉ tạo gia hạn', false);
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'tuition.renewal.prepare'
where role.code = 'TUITION_PREPARE_ONLY';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1b210-0000-4000-8000-000000000003', id, (select id from public.branches where code = 'V01') from public.roles where code = 'TUITION_PREPARE_ONLY';
insert into public.branches(id, code, name) values ('c0e1b210-0000-4000-8000-000000000010', 'SEND-B', 'Chi nhánh khác');
insert into public.organization_units(code, name) values ('HQ', 'Hội sở') on conflict (code) do nothing;
insert into public.employees(id, employee_code, home_unit, hire_date, profile_id, created_by) values
  ('c0e1b210-0000-4000-8000-0000000000e2', 'VIBE-HQ-9102', 'HQ', current_date, 'c0e1b210-0000-4000-8000-000000000002', 'c0e1b210-0000-4000-8000-000000000002'),
  ('c0e1b210-0000-4000-8000-0000000000e3', 'VIBE-HQ-9103', 'HQ', current_date, 'c0e1b210-0000-4000-8000-000000000003', 'c0e1b210-0000-4000-8000-000000000003');
insert into public.employee_versions(employee_id, version, effective_on, full_name, unit_code, employee_group, employment_status, end_date, pay_type, reason, created_by) values
  ('c0e1b210-0000-4000-8000-0000000000e2', 1, current_date, 'Nhân viên gửi', 'HQ', 'Văn phòng', 'ACTIVE', null, 'MONTHLY', 'Phân quyền thử', 'c0e1b210-0000-4000-8000-000000000002'),
  ('c0e1b210-0000-4000-8000-0000000000e3', 1, current_date, 'Nhân viên tạo đơn', 'HQ', 'Văn phòng', 'ACTIVE', null, 'MONTHLY', 'Phân quyền thử', 'c0e1b210-0000-4000-8000-000000000003');

insert into public.notification_templates(template_key, provider, provider_template_id, status, description, parameter_schema, enabled)
values ('ZALO_TUITION_REMINDER', 'ZALO', '645192', 'APPROVED', 'Thử cổng gửi', '["student_name"]'::jsonb, false);

create function pg_temp.make_send_reminder(p_reminder uuid, p_branch uuid, p_code text) returns void
language plpgsql as $$
declare
  curriculum uuid := gen_random_uuid();
  level_id uuid := gen_random_uuid();
  course uuid := gen_random_uuid();
  class_id uuid := gen_random_uuid();
  student uuid := gen_random_uuid();
  parent uuid := gen_random_uuid();
  journey uuid := gen_random_uuid();
  teacher uuid := gen_random_uuid();
  room uuid := gen_random_uuid();
  enrollment uuid := gen_random_uuid();
begin
  insert into public.curriculums(id, code, name) values (curriculum, p_code || '-CUR', p_code);
  insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values (level_id, curriculum, p_code || '-L', p_code, 1);
  insert into public.courses(id, curriculum_id, level_id, code, name) values (course, curriculum, level_id, p_code || '-COURSE', p_code);
  insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status, accepted_from_level_id, accepted_to_level_id)
  values (class_id, p_branch, course, p_code || '-CLASS', p_code, 'ONE_ON_ONE', 1, 'ACTIVE', level_id, level_id);
  insert into public.students(id, student_code, default_branch_id, full_name, status) values (student, p_code || '-ST', p_branch, p_code, 'ACTIVE');
  insert into public.parents(id, parent_code, status) values (parent, 'PH-' || p_code, 'ACTIVE');
  insert into public.student_parents(student_id, parent_id, relationship, is_primary, can_view_finance, is_active)
  values (student, parent, 'Phụ huynh', true, true, true);
  insert into public.student_curriculum_enrollments(id, student_id, curriculum_id, current_level_id, is_primary, status, started_at)
  values (journey, student, curriculum, level_id, true, 'ACTIVE', date '2026-08-01');
  insert into public.teachers(id, teacher_code, full_name, status) values (teacher, p_code || '-T', p_code, 'ACTIVE');
  insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at)
  values (class_id, teacher, 'PRIMARY', true, date '2026-08-01');
  insert into public.rooms(id, branch_id, code, name, capacity) values (room, p_branch, p_code || '-R', p_code, 1);
  insert into public.schedules(class_id, room_id, day_of_week, start_time, end_time, effective_from, timezone, status)
  values (class_id, room, 1, time '06:00', time '07:00', date '2026-08-01', 'Asia/Ho_Chi_Minh', 'ACTIVE');
  insert into public.enrollments(id, student_id, class_id, student_curriculum_enrollment_id, enrolled_at, started_at, status)
  values (enrollment, student, class_id, journey, date '2026-08-01', date '2026-08-01', 'ACTIVE');
  insert into public.enrollment_tuition(enrollment_id, tuition_plan_id, starts_on, status, discount_type, discount_value)
  values (enrollment, (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), date '2026-08-01', 'ACTIVE', 'NONE', 0);
  insert into public.tuition_reminders(id, enrollment_tuition_id, event_code, window_start, window_end)
  select p_reminder, id, 'RENEWAL_V1', date '2026-10-01', date '2026-10-31'
  from public.enrollment_tuition where enrollment_id = enrollment;
end $$;

select pg_temp.make_send_reminder('c0e1b210-0000-4000-8000-000000000021', (select id from public.branches where code = 'V01'), 'SEND-V01');
select pg_temp.make_send_reminder('c0e1b210-0000-4000-8000-000000000041', 'c0e1b210-0000-4000-8000-000000000010', 'SEND-OTH');

select set_config('request.jwt.claim.sub', 'c0e1b210-0000-4000-8000-000000000002', true);
select ok(public.tuition_reminder_send_allowed('c0e1b210-0000-4000-8000-000000000021'), 'care employee may send for the assigned branch');
select ok(not coalesce(public.tuition_reminder_send_allowed('c0e1b210-0000-4000-8000-000000000041'), false), 'care employee cannot send for another branch');
select is((public.tuition_reminder_template_gate()->>'enabled')::boolean, false, 'the reminder template gate stays off');
select throws_ok($$select public.begin_tuition_zalo_send('c0e1b210-0000-4000-8000-000000000041', 'c0e1b210-0000-4000-8000-000000000099')$$, 'P0001', 'TUITION_SEND_UNAUTHORIZED', 'the wrong branch does not open a send');

select set_config('request.jwt.claim.sub', 'c0e1b210-0000-4000-8000-000000000003', true);
select ok(not coalesce(public.tuition_reminder_send_allowed('c0e1b210-0000-4000-8000-000000000021'), false), 'prepare permission alone is not a send grant');

select set_config('request.jwt.claim.sub', 'c0e1b210-0000-4000-8000-000000000001', true);
select ok(public.tuition_reminder_send_allowed('c0e1b210-0000-4000-8000-000000000041'), 'super admin may send for every branch');
select throws_ok($$select public.begin_tuition_zalo_send('c0e1b210-0000-4000-8000-000000000021', (select sp.parent_id from public.tuition_reminders r join public.enrollment_tuition et on et.id = r.enrollment_tuition_id join public.enrollments e on e.id = et.enrollment_id join public.student_parents sp on sp.student_id = e.student_id where r.id = 'c0e1b210-0000-4000-8000-000000000021'))$$, 'P0001', 'Tuition Zalo consent required', 'an authorized branch still creates no send without consent');
select is((select count(*) from public.tuition_zalo_sends where reminder_id in ('c0e1b210-0000-4000-8000-000000000021', 'c0e1b210-0000-4000-8000-000000000041')), 0::bigint, 'neither attempt stored a send');

select * from finish();
rollback;
