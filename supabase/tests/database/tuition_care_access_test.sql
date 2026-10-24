begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
  ('c0e1c200-0000-4000-8000-000000000001'),
  ('c0e1c200-0000-4000-8000-000000000002'),
  ('c0e1c200-0000-4000-8000-000000000003'),
  ('c0e1c200-0000-4000-8000-000000000004'),
  ('c0e1c200-0000-4000-8000-000000000005'),
  ('c0e1c200-0000-4000-8000-000000000006'),
  ('c0e1c200-0000-4000-8000-000000000007'),
  ('c0e1c200-0000-4000-8000-000000000008');
insert into public.profiles(id, full_name, status) values
  ('c0e1c200-0000-4000-8000-000000000001', 'Care Admin', 'ACTIVE'),
  ('c0e1c200-0000-4000-8000-000000000002', 'Care Employee', 'ACTIVE'),
  ('c0e1c200-0000-4000-8000-000000000003', 'Care Viewer', 'ACTIVE'),
  ('c0e1c200-0000-4000-8000-000000000004', 'Care Cashier', 'ACTIVE'),
  ('c0e1c200-0000-4000-8000-000000000005', 'Care Unassigned', 'ACTIVE'),
  ('c0e1c200-0000-4000-8000-000000000006', 'Ordinary User', 'ACTIVE'),
  ('c0e1c200-0000-4000-8000-000000000007', 'Care No Employee', 'ACTIVE'),
  ('c0e1c200-0000-4000-8000-000000000008', 'Care Inactive', 'ACTIVE');

insert into public.branches(id, code, name) values ('c0e1c200-0000-4000-8000-000000000010', 'CARE-B', 'Chi nhánh khác');
insert into public.roles(code, name, is_system) values ('TUITION_VIEW_ONLY', 'Chỉ xem nhắc học phí', false);
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'tuition.reminder.view'
where role.code = 'TUITION_VIEW_ONLY';

insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1c200-0000-4000-8000-000000000001', id, null from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1c200-0000-4000-8000-000000000002', id, (select id from public.branches where code = 'V01') from public.roles where code = 'TUITION_CARE';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1c200-0000-4000-8000-000000000003', id, (select id from public.branches where code = 'V01') from public.roles where code = 'TUITION_VIEW_ONLY';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1c200-0000-4000-8000-000000000004', id, (select id from public.branches where code = 'V01') from public.roles where code = 'CASHIER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1c200-0000-4000-8000-000000000005', id, null from public.roles where code = 'TUITION_CARE';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1c200-0000-4000-8000-000000000007', id, (select id from public.branches where code = 'V01') from public.roles where code = 'TUITION_CARE';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1c200-0000-4000-8000-000000000008', id, (select id from public.branches where code = 'V01') from public.roles where code = 'TUITION_CARE';

insert into public.employees(id, employee_code, home_unit, hire_date, profile_id, created_by) values
  ('c0e1c200-0000-4000-8000-0000000000e2', 'VIBE-HQ-9002', 'HQ', current_date, 'c0e1c200-0000-4000-8000-000000000002', 'c0e1c200-0000-4000-8000-000000000002'),
  ('c0e1c200-0000-4000-8000-0000000000e3', 'VIBE-HQ-9003', 'HQ', current_date, 'c0e1c200-0000-4000-8000-000000000003', 'c0e1c200-0000-4000-8000-000000000003'),
  ('c0e1c200-0000-4000-8000-0000000000e4', 'VIBE-HQ-9004', 'HQ', current_date, 'c0e1c200-0000-4000-8000-000000000004', 'c0e1c200-0000-4000-8000-000000000004'),
  ('c0e1c200-0000-4000-8000-0000000000e5', 'VIBE-HQ-9005', 'HQ', current_date, 'c0e1c200-0000-4000-8000-000000000005', 'c0e1c200-0000-4000-8000-000000000005'),
  ('c0e1c200-0000-4000-8000-0000000000e8', 'VIBE-HQ-9008', 'HQ', current_date, 'c0e1c200-0000-4000-8000-000000000008', 'c0e1c200-0000-4000-8000-000000000008');
insert into public.employee_versions(employee_id, version, effective_on, full_name, unit_code, employee_group, employment_status, end_date, pay_type, reason, created_by) values
  ('c0e1c200-0000-4000-8000-0000000000e2', 1, current_date, 'Nhân viên chăm sóc', 'HQ', 'Văn phòng', 'ACTIVE', null, 'MONTHLY', 'Phân quyền thử', 'c0e1c200-0000-4000-8000-000000000002'),
  ('c0e1c200-0000-4000-8000-0000000000e3', 1, current_date, 'Nhân viên chỉ xem', 'HQ', 'Văn phòng', 'ACTIVE', null, 'MONTHLY', 'Phân quyền thử', 'c0e1c200-0000-4000-8000-000000000003'),
  ('c0e1c200-0000-4000-8000-0000000000e4', 1, current_date, 'Thu ngân thử', 'HQ', 'Văn phòng', 'ACTIVE', null, 'MONTHLY', 'Phân quyền thử', 'c0e1c200-0000-4000-8000-000000000004'),
  ('c0e1c200-0000-4000-8000-0000000000e5', 1, current_date, 'Chưa gán chi nhánh', 'HQ', 'Văn phòng', 'ACTIVE', null, 'MONTHLY', 'Phân quyền thử', 'c0e1c200-0000-4000-8000-000000000005'),
  ('c0e1c200-0000-4000-8000-0000000000e8', 1, current_date, 'Nhân viên đã nghỉ', 'HQ', 'Văn phòng', 'TERMINATED', current_date, 'MONTHLY', 'Phân quyền thử', 'c0e1c200-0000-4000-8000-000000000008');

create function pg_temp.make_care_reminder(p_reminder uuid, p_branch uuid, p_code text) returns void
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
  select p_reminder, id, 'RENEWAL_V1', date '2026-12-01', date '2026-12-31'
  from public.enrollment_tuition where enrollment_id = enrollment;
end $$;

select pg_temp.make_care_reminder('c0e1c200-0000-4000-8000-000000000021', (select id from public.branches where code = 'V01'), 'CARE-V01');
select pg_temp.make_care_reminder('c0e1c200-0000-4000-8000-000000000041', (select id from public.branches where code = 'CARE-B'), 'CARE-OTH');
select pg_temp.make_care_reminder('c0e1c200-0000-4000-8000-000000000051', (select id from public.branches where code = 'V01'), 'CARE-CSH');

select results_eq(
  $$select permission.code from public.role_permissions grant_row
    join public.roles role on role.id = grant_row.role_id
    join public.permissions permission on permission.id = grant_row.permission_id
    where role.code = 'TUITION_CARE' order by 1$$,
  $$values ('tuition.reminder.view'::text), ('tuition.renewal.prepare'::text)$$,
  'tuition care holds only reminder view and renewal prepare'
);
select is((select name from public.roles where code = 'TUITION_CARE'), 'Chăm sóc học phí', 'tuition care uses the Vietnamese label');
select ok(not exists (
  select 1 from public.role_permissions grant_row
  join public.roles role on role.id = grant_row.role_id
  join public.permissions permission on permission.id = grant_row.permission_id
  where role.code = 'TUITION_CARE' and permission.code in (
    'finance.cash.record', 'finance.refund.request', 'finance.refund.approve',
    'finance.invoice_cancel.request', 'finance.invoice_cancel.approve', 'payroll.view', 'payroll.approve'
  )
), 'tuition care does not receive cash, refund, invoice void, or payroll');

select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000001', true);
select is((select count(*) from public.list_tuition_reminders(null, null, null, null, 50, 0, 'c0e1c200-0000-4000-8000-000000000021')), 1::bigint, 'super admin can view a Can Tho reminder');
select is((select count(*) from public.list_tuition_reminders(null, null, null, null, 50, 0, 'c0e1c200-0000-4000-8000-000000000041')), 1::bigint, 'super admin can view another branch reminder');
select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000002', true);
create temporary table care_kpi as select (public.tuition_reminder_kpis()->>'upcoming')::int as care_upcoming;
select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000001', true);
select ok((select (public.tuition_reminder_kpis()->>'upcoming')::int > (select care_upcoming from care_kpi)), 'super admin counts a branch the care employee cannot see');

select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000002', true);
select ok(public.tuition_care_may_enter(), 'active Can Tho tuition care employee may open reminders');
select ok(public.tuition_branch_granted((select id from public.branches where code = 'V01'), 'tuition.reminder.view'), 'care employee can view the assigned branch');
select ok(not public.tuition_branch_granted((select id from public.branches where code = 'CARE-B'), 'tuition.reminder.view'), 'care employee cannot view another branch');
select is((select count(*) from public.list_tuition_reminders((select id from public.branches where code = 'V01'), null, null, null, 50, 0, 'c0e1c200-0000-4000-8000-000000000021')), 1::bigint, 'Can Tho tuition care can view a Can Tho reminder');
select is((select full_name from public.list_tuition_reminders(null, null, null, null, 50, 0, 'c0e1c200-0000-4000-8000-000000000021')), 'CARE-V01', 'the reminder read returns only the displayed student name');
select is((select count(*) from public.list_tuition_reminders((select id from public.branches where code = 'CARE-B'), null, null, null, 50, 0, 'c0e1c200-0000-4000-8000-000000000041')), 0::bigint, 'a client-supplied other branch returns no rows');
select is((select count(*) from public.list_tuition_reminders(null, null, null, null, 50, 0, 'c0e1c200-0000-4000-8000-000000000041')), 0::bigint, 'omitting the branch still hides the other branch');
select ok(public.tuition_reminder_prepare_allowed('c0e1c200-0000-4000-8000-000000000021'), 'care employee may prepare the assigned reminder');
select is((public.begin_tuition_renewal('c0e1c200-0000-4000-8000-000000000021', 'VIBE_3_MONTHS', 'DEPOSIT_50', date '2026-11-01', date '2026-11-15', null, null)->>'result'), 'created', 'Can Tho tuition care can prepare a Can Tho renewal');
select is((public.begin_tuition_renewal('c0e1c200-0000-4000-8000-000000000021', 'VIBE_3_MONTHS', 'DEPOSIT_50', date '2026-11-01', date '2026-11-15', null, null)->>'result'), 'duplicate', 'duplicate renewal submission stays idempotent');
select is((select count(*) from public.tuition_renewal_cases where reminder_id = 'c0e1c200-0000-4000-8000-000000000021'), 1::bigint, 'duplicate submission does not create a second case');
select is((select metadata from public.tuition_renewal_events where event_type = 'CARE_PREPARED' and case_id = (select id from public.tuition_renewal_cases where reminder_id = 'c0e1c200-0000-4000-8000-000000000021')), jsonb_build_object('branch_id', (select id from public.branches where code = 'V01'), 'action', 'tuition.renewal.prepare'), 'audit records branch and action without a customer payload');
select is((select actor_id from public.tuition_renewal_events where event_type = 'CARE_PREPARED' and case_id = (select id from public.tuition_renewal_cases where reminder_id = 'c0e1c200-0000-4000-8000-000000000021')), 'c0e1c200-0000-4000-8000-000000000002'::uuid, 'audit records the actor');
select ok((select created_at is not null from public.tuition_renewal_events where event_type = 'CARE_PREPARED' and case_id = (select id from public.tuition_renewal_cases where reminder_id = 'c0e1c200-0000-4000-8000-000000000021')), 'audit records the timestamp');
select is((select count(*) from public.tuition_renewal_events where event_type = 'CARE_PREPARED' and case_id = (select id from public.tuition_renewal_cases where reminder_id = 'c0e1c200-0000-4000-8000-000000000021')), 1::bigint, 'duplicate submission does not write a second audit event');
select throws_ok($$select public.begin_tuition_renewal('c0e1c200-0000-4000-8000-000000000041','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', null, null)$$, 'P0001', 'TUITION_RENEWAL_UNAUTHORIZED', 'Can Tho tuition care cannot prepare another branch');
select throws_ok($$select public.create_payment_once(gen_random_uuid(), 'c0e1c200-0000-4000-8000-000000000099', (select id from public.branches where code = 'V01'), 1000, 'VND', 'CASH', now(), null, null, true)$$, 'P0001', 'Cash receipt permission required', 'tuition care cannot record cash');
select throws_ok($$select public.approve_financial_action('c0e1c200-0000-4000-8000-000000000099', 'Không duyệt')$$, 'P0001', 'Unauthorized', 'tuition care cannot approve a refund');
select throws_ok($$select public.request_financial_action('CANCEL_INVOICE', (select invoice_id from public.tuition_renewal_cases where reminder_id = 'c0e1c200-0000-4000-8000-000000000021'), '{}'::jsonb, 'Không hủy', gen_random_uuid())$$, 'P0001', 'Unauthorized', 'tuition care cannot void an invoice');

select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000003', true);
select is((select count(*) from public.list_tuition_reminders(null, null, null, null, 50, 0, 'c0e1c200-0000-4000-8000-000000000021')), 1::bigint, 'view permission can read the assigned reminder');
select throws_ok($$select public.begin_tuition_renewal('c0e1c200-0000-4000-8000-000000000021','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', null, null)$$, 'P0001', 'TUITION_RENEWAL_UNAUTHORIZED', 'view permission without prepare cannot create a renewal');

select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000004', true);
select throws_ok($$select public.begin_tuition_renewal('c0e1c200-0000-4000-8000-000000000051','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', null, null)$$, 'P0001', 'TUITION_RENEWAL_UNAUTHORIZED', 'cashier cannot prepare a renewal');
insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id from public.roles role
join public.permissions permission on permission.code = 'tuition.renewal.prepare'
where role.code = 'CASHIER';
select is((public.begin_tuition_renewal('c0e1c200-0000-4000-8000-000000000051', 'VIBE_3_MONTHS', 'DEPOSIT_50', date '2026-11-01', date '2026-11-15', null, null)->>'result'), 'created', 'cashier can prepare only after the permission is granted separately');

select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000005', true);
select ok(public.has_permission('tuition.reminder.view', (select id from public.branches where code = 'V01')), 'a null branch assignment is global in the legacy helper');
select ok(not public.tuition_branch_granted((select id from public.branches where code = 'V01'), 'tuition.reminder.view'), 'tuition access does not treat a null branch as global');
select throws_ok($$select * from public.list_tuition_reminders(null, null, null, null, 5, 0, null)$$, 'P0001', 'TUITION_REMINDER_UNAUTHORIZED', 'an employee without a branch assignment is denied');

select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000007', true);
select throws_ok($$select * from public.list_tuition_reminders(null, null, null, null, 5, 0, null)$$, 'P0001', 'TUITION_REMINDER_UNAUTHORIZED', 'a role assignment without an employee record is denied');
select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000008', true);
select throws_ok($$select * from public.list_tuition_reminders(null, null, null, null, 5, 0, null)$$, 'P0001', 'TUITION_REMINDER_UNAUTHORIZED', 'an inactive employee is denied');

select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000006', true);
select throws_ok($$select * from public.list_tuition_reminders(null, null, null, null, 5, 0, null)$$, 'P0001', 'TUITION_REMINDER_UNAUTHORIZED', 'an ordinary authenticated user is denied');
select throws_ok($$select public.begin_tuition_renewal('c0e1c200-0000-4000-8000-000000000021','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', null, null)$$, 'P0001', 'TUITION_RENEWAL_UNAUTHORIZED', 'an ordinary authenticated user cannot prepare a renewal');

select set_config('request.jwt.claim.sub', 'c0e1c200-0000-4000-8000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.students where student_code = 'CARE-V01-ST'), 0::bigint, 'tuition care cannot read the student table outside the reminder function');
reset role;

select ok(not has_function_privilege('anon', 'public.list_tuition_reminders(uuid,uuid,text,text,integer,integer,uuid)', 'EXECUTE'), 'anonymous cannot execute reminder reads');
select ok(not has_function_privilege('anon', 'public.begin_tuition_renewal(uuid,text,text,date,date,text,numeric)', 'EXECUTE'), 'anonymous cannot execute renewal preparation');
set local role anon;
select throws_ok($$select * from public.list_tuition_reminders(null, null, null, null, 5, 0, null)$$, '42501', 'permission denied for function list_tuition_reminders', 'anonymous reminder query is denied');
reset role;

select * from finish();
rollback;
