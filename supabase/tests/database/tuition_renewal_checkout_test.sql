begin;
create extension if not exists pgtap;
select plan(37);

insert into auth.users(id) values
  ('c0e1b100-0000-4000-8000-000000000001'),
  ('c0e1b100-0000-4000-8000-000000000002'),
  ('c0e1b100-0000-4000-8000-000000000003');
insert into public.profiles(id, full_name, status) values
  ('c0e1b100-0000-4000-8000-000000000001', 'Renewal Admin', 'ACTIVE'),
  ('c0e1b100-0000-4000-8000-000000000002', 'Renewal Finance', 'ACTIVE'),
  ('c0e1b100-0000-4000-8000-000000000003', 'Renewal Cashier', 'ACTIVE');
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1b100-0000-4000-8000-000000000001', id, null from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1b100-0000-4000-8000-000000000002', id, (select id from public.branches where code <> 'V01' limit 1)
from public.roles where code = 'FINANCE';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1b100-0000-4000-8000-000000000003', id, (select id from public.branches where code = 'V01')
from public.roles where code = 'CASHIER';

select set_config('request.jwt.claim.sub', 'c0e1b100-0000-4000-8000-000000000001', true);

select is(public.tuition_branch_list_price((select id from public.branches where code = 'V01'), (select id from public.tuition_plans where code = 'VIBE_3_MONTHS')), 5500000::numeric, 'Can Tho three-month price');
select is(public.tuition_branch_list_price((select id from public.branches where code = 'V01'), (select id from public.tuition_plans where code = 'VIBE_12_MONTHS')), 16500000::numeric, 'Can Tho annual price');
select is(public.tuition_branch_list_price((select id from public.branches where code <> 'V01' limit 1), (select id from public.tuition_plans where code = 'VIBE_3_MONTHS')), 4500000::numeric, 'other branch three-month price');
select is(public.tuition_branch_list_price((select id from public.branches where code <> 'V01' limit 1), (select id from public.tuition_plans where code = 'VIBE_12_MONTHS')), 13500000::numeric, 'other branch annual price');
select ok(16500000 <> 5500000 * 4 and 13500000 <> 4500000 * 4, 'annual price is not four three-month prices');
select ok(position('begin_tuition_renewal' in pg_get_functiondef('public.record_tuition_zalo_reply(text,text,text,text,text,text)'::regprocedure)) = 0, 'customer reply does not open a renewal');

insert into public.branches(id, code, name) values ('c0e1b100-0000-4000-8000-000000000010', 'REN-B', 'Chi nhánh gia hạn');
insert into public.curriculums(id, code, name) values ('c0e1b100-0000-4000-8000-000000000011', 'REN-CUR', 'Renewal curriculum');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values ('c0e1b100-0000-4000-8000-000000000012', 'c0e1b100-0000-4000-8000-000000000011', 'REN-L1', 'Renewal level', 1);
insert into public.courses(id, curriculum_id, level_id, code, name) values ('c0e1b100-0000-4000-8000-000000000013', 'c0e1b100-0000-4000-8000-000000000011', 'c0e1b100-0000-4000-8000-000000000012', 'REN-COURSE', 'Renewal course');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status, accepted_from_level_id, accepted_to_level_id)
values ('c0e1b100-0000-4000-8000-000000000014', (select id from public.branches where code = 'V01'), 'c0e1b100-0000-4000-8000-000000000013', 'REN-CLASS', 'Renewal class', 'ONE_ON_ONE', 1, 'ACTIVE', 'c0e1b100-0000-4000-8000-000000000012', 'c0e1b100-0000-4000-8000-000000000012');
insert into public.students(id, student_code, default_branch_id, full_name, status) values ('c0e1b100-0000-4000-8000-000000000015', 'REN-STUDENT', (select id from public.branches where code = 'V01'), 'Học viên gia hạn', 'ACTIVE');
insert into public.parents(id, parent_code, status) values ('c0e1b100-0000-4000-8000-000000000016', 'PH-REN-01', 'ACTIVE');
insert into public.student_parents(student_id, parent_id, relationship, is_primary, can_view_finance, is_active)
values ('c0e1b100-0000-4000-8000-000000000015', 'c0e1b100-0000-4000-8000-000000000016', 'Phụ huynh', true, true, true);
insert into public.student_curriculum_enrollments(id, student_id, curriculum_id, current_level_id, is_primary, status, started_at)
values ('c0e1b100-0000-4000-8000-000000000017', 'c0e1b100-0000-4000-8000-000000000015', 'c0e1b100-0000-4000-8000-000000000011', 'c0e1b100-0000-4000-8000-000000000012', true, 'ACTIVE', date '2026-08-01');
insert into public.teachers(id, teacher_code, full_name, status) values ('c0e1b100-0000-4000-8000-000000000018', 'REN-T', 'Renewal teacher', 'ACTIVE');
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at)
values ('c0e1b100-0000-4000-8000-000000000014', 'c0e1b100-0000-4000-8000-000000000018', 'PRIMARY', true, date '2026-08-01');
insert into public.rooms(id, branch_id, code, name, capacity) values ('c0e1b100-0000-4000-8000-000000000019', (select id from public.branches where code = 'V01'), 'REN-ROOM', 'Renewal room', 1);
insert into public.schedules(class_id, room_id, day_of_week, start_time, end_time, effective_from, timezone, status)
values ('c0e1b100-0000-4000-8000-000000000014', 'c0e1b100-0000-4000-8000-000000000019', 1, time '06:00', time '07:00', date '2026-08-01', 'Asia/Ho_Chi_Minh', 'ACTIVE');
insert into public.enrollments(id, student_id, class_id, student_curriculum_enrollment_id, enrolled_at, started_at, status)
values ('c0e1b100-0000-4000-8000-000000000020', 'c0e1b100-0000-4000-8000-000000000015', 'c0e1b100-0000-4000-8000-000000000014', 'c0e1b100-0000-4000-8000-000000000017', date '2026-08-01', date '2026-08-01', 'ACTIVE');
insert into public.enrollment_tuition(enrollment_id, tuition_plan_id, starts_on, status, discount_type, discount_value)
values ('c0e1b100-0000-4000-8000-000000000020', (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), date '2026-08-01', 'ACTIVE', 'NONE', 0);
insert into public.tuition_reminders(id, enrollment_tuition_id, event_code, window_start, window_end)
select 'c0e1b100-0000-4000-8000-000000000021', id, 'RENEWAL_V1', date '2026-10-01', date '2026-10-31'
from public.enrollment_tuition where enrollment_id = 'c0e1b100-0000-4000-8000-000000000020';

select throws_ok($$select public.begin_tuition_renewal('c0e1b100-0000-4000-8000-000000000021','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', 'note', 1)$$, 'P0001', 'TUITION_PRICE_REJECTED', 'client price is rejected');
select is((select count(*) from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 0::bigint, 'rejected price creates no renewal');

select set_config('request.jwt.claim.sub', 'c0e1b100-0000-4000-8000-000000000003', true);
select throws_ok($$select public.begin_tuition_renewal('c0e1b100-0000-4000-8000-000000000021','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', 'note', null)$$, 'P0001', 'TUITION_RENEWAL_UNAUTHORIZED', 'cash recorder cannot create a renewal');
select set_config('request.jwt.claim.sub', 'c0e1b100-0000-4000-8000-000000000002', true);
select throws_ok($$select public.begin_tuition_renewal('c0e1b100-0000-4000-8000-000000000021','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', 'note', null)$$, 'P0001', 'TUITION_RENEWAL_UNAUTHORIZED', 'other branch finance cannot create a Can Tho renewal');

select set_config('request.jwt.claim.sub', 'c0e1b100-0000-4000-8000-000000000001', true);
select is((public.begin_tuition_renewal('c0e1b100-0000-4000-8000-000000000021','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', 'Theo dõi', null)->>'result'), 'created', 'staff creates one renewal');
select is((public.begin_tuition_renewal('c0e1b100-0000-4000-8000-000000000021','VIBE_3_MONTHS','DEPOSIT_50', date '2026-11-01', date '2026-11-15', 'Theo dõi', null)->>'result'), 'duplicate', 'repeat uses the same renewal');
select is((select count(*) from public.invoices where id in (select invoice_id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021')), 1::bigint, 'repeat does not create a second invoice');
select is((select renewal_tuition_id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), null, 'unpaid renewal does not create a tuition period');
select is((select enrollment_tuition_id from public.invoices where id = (select invoice_id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021')), null, 'unpaid invoice is not tied to a tuition period');
select is((select count(*) from public.enrollment_tuition where enrollment_id = 'c0e1b100-0000-4000-8000-000000000020'), 1::bigint, 'the source period stays the only period before payment');
select ok(not exists (
  select 1 from public.role_permissions grant_row
  join public.roles role on role.id = grant_row.role_id
  join public.permissions permission on permission.id = grant_row.permission_id
  where permission.code = 'tuition.renewal.prepare' and role.code in ('CASHIER', 'STAFF', 'TEACHER', 'BRANCH_MANAGER')
), 'renewal preparation is not granted to cashier or general staff');
select is((select amount_due from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 2750000::numeric, 'deposit is half of the Can Tho three-month price');
select is((public.begin_tuition_renewal('c0e1b100-0000-4000-8000-000000000021','VIBE_12_MONTHS','FULL', date '2026-11-01', date '2026-11-15', 'khác', null)->>'result'), 'open_renewal', 'a different open renewal is refused');

select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok($$select public.activate_tuition_payos_checkout((select id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), (select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 2750000, 'https://pay.payos.vn/web/tuitionlink1', 'https://pay.payos.vn/web/tuitionlink1', '')$$, 'P0001', 'PAYOS_CHECKOUT_MISMATCH', 'a full checkout url is not a payment link id');
select is(public.activate_tuition_payos_checkout((select id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), (select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 2750000, 'tuitionlink1', 'https://pay.payos.vn/web/tuitionlink1', ''), 'ACTIVATED', 'checkout activates the reserved order');
select is(public.activate_tuition_payos_checkout((select id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), (select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 2750000, 'tuitionlink1', 'https://pay.payos.vn/web/tuitionlink1', ''), 'ALREADY_ACTIVE', 'checkout retry keeps the same order');
select is(public.note_tuition_renewal_notice((select id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 'PAYMENT', 'AWAITING_TEMPLATE', 'ZBS_TEMPLATE_REQUIRED', null), 'AWAITING_TEMPLATE', 'missing payment template stays retryable');
select is((select o.state from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 'PENDING', 'ZBS blocker does not cancel checkout');
select throws_ok($$select public.record_verified_tuition_payos_webhook((select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 'tuitionlink1', 'REF-1', 1000, 'VND')$$, 'P0001', 'PAYOS_AMOUNT_MISMATCH', 'wrong amount cannot post');
select is(public.record_verified_tuition_payos_webhook((select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 'tuitionlink1', 'REF-1', 2750000, 'VND'), 'DEPOSIT_PAID', 'half payment records the deposit');
select is(public.record_verified_tuition_payos_webhook((select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000021'), 'tuitionlink1', 'REF-1', 2750000, 'VND'), 'ALREADY_DEPOSIT', 'duplicate webhook does not post again');
select is((select status from public.enrollment_tuition where id = (select renewal_tuition_id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000021')), 'SCHEDULED', 'future period stays scheduled after the deposit');
select is((select count(*) from public.enrollment_tuition where enrollment_id = 'c0e1b100-0000-4000-8000-000000000020'), 2::bigint, 'verified deposit creates exactly one scheduled period');
select is((select count(*) from public.attendance_records where enrollment_id = 'c0e1b100-0000-4000-8000-000000000020'), 0::bigint, 'the scheduled period creates no attendance');
select is((select count(*) from public.payments where reference = 'PAYOS:REF-1'), 1::bigint, 'duplicate webhook keeps one payment');

select set_config('request.jwt.claim.sub', 'c0e1b100-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', '', true);
insert into public.students(id, student_code, default_branch_id, full_name, status) values ('c0e1b100-0000-4000-8000-000000000030', 'REN-FULL', (select id from public.branches where code = 'V01'), 'Học viên trả đủ', 'ACTIVE');
insert into public.student_parents(student_id, parent_id, relationship, is_primary, can_view_finance, is_active)
values ('c0e1b100-0000-4000-8000-000000000030', 'c0e1b100-0000-4000-8000-000000000016', 'Phụ huynh', true, true, true);
insert into public.student_curriculum_enrollments(id, student_id, curriculum_id, current_level_id, is_primary, status, started_at)
values ('c0e1b100-0000-4000-8000-000000000031', 'c0e1b100-0000-4000-8000-000000000030', 'c0e1b100-0000-4000-8000-000000000011', 'c0e1b100-0000-4000-8000-000000000012', true, 'ACTIVE', date '2026-01-01');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status, accepted_from_level_id, accepted_to_level_id)
values ('c0e1b100-0000-4000-8000-000000000032', (select id from public.branches where code = 'V01'), 'c0e1b100-0000-4000-8000-000000000013', 'REN-FULL-CLASS', 'Renewal full class', 'ONE_ON_ONE', 1, 'ACTIVE', 'c0e1b100-0000-4000-8000-000000000012', 'c0e1b100-0000-4000-8000-000000000012');
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at)
values ('c0e1b100-0000-4000-8000-000000000032', 'c0e1b100-0000-4000-8000-000000000018', 'PRIMARY', true, date '2026-01-01');
insert into public.schedules(class_id, room_id, day_of_week, start_time, end_time, effective_from, timezone, status)
values ('c0e1b100-0000-4000-8000-000000000032', 'c0e1b100-0000-4000-8000-000000000019', 2, time '06:00', time '07:00', date '2026-01-01', 'Asia/Ho_Chi_Minh', 'ACTIVE');
insert into public.enrollments(id, student_id, class_id, student_curriculum_enrollment_id, enrolled_at, started_at, status)
values ('c0e1b100-0000-4000-8000-000000000033', 'c0e1b100-0000-4000-8000-000000000030', 'c0e1b100-0000-4000-8000-000000000032', 'c0e1b100-0000-4000-8000-000000000031', date '2026-01-01', date '2026-01-01', 'ACTIVE');
insert into public.enrollment_tuition(enrollment_id, tuition_plan_id, starts_on, status, discount_type, discount_value)
values ('c0e1b100-0000-4000-8000-000000000033', (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), date '2026-01-01', 'ACTIVE', 'NONE', 0);
insert into public.tuition_reminders(id, enrollment_tuition_id, event_code, window_start, window_end)
select 'c0e1b100-0000-4000-8000-000000000034', id, 'RENEWAL_V1', date '2026-03-01', date '2026-03-31'
from public.enrollment_tuition where enrollment_id = 'c0e1b100-0000-4000-8000-000000000033';
select is((public.begin_tuition_renewal('c0e1b100-0000-4000-8000-000000000034','VIBE_3_MONTHS','FULL', (select effective_ends_on + 1 from public.enrollment_tuition where enrollment_id = 'c0e1b100-0000-4000-8000-000000000033'), date '2026-11-15', 'Trả đủ', null)->>'amount_due')::numeric, 5500000::numeric, 'full payment uses the whole package price');
select set_config('request.jwt.claim.role', 'service_role', true);
select is(public.activate_tuition_payos_checkout((select id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000034'), (select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000034'), 5500000, 'fulllink01', 'https://pay.payos.vn/web/fulllink01', ''), 'ACTIVATED', 'full checkout is created once');
select is(public.record_verified_tuition_payos_webhook((select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b100-0000-4000-8000-000000000034'), 'fulllink01', 'REF-FULL', 5500000, 'VND'), 'PAID', 'full webhook records payment');
select is((select status from public.enrollment_tuition where id = (select renewal_tuition_id from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000034')), 'ACTIVE', 'a start date already reached becomes active only after full payment');
select is((select confirmation_status from public.tuition_renewal_cases where reminder_id = 'c0e1b100-0000-4000-8000-000000000034'), 'AWAITING_TEMPLATE', 'payment stands when the confirmation template is not approved');
select throws_ok($$select public.record_verified_tuition_payos_webhook(999999999, 'missing', 'REF-X', 5500000, 'VND')$$, 'P0001', 'PAYOS_ORDER_UNKNOWN', 'unknown order cannot mark an invoice paid');

select * from finish();
rollback;
