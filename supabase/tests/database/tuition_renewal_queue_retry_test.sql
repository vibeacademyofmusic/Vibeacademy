begin;
create extension if not exists pgtap;
select plan(17);

insert into auth.users(id) values ('c0e1b200-0000-4000-8000-000000000001');
insert into public.profiles(id, full_name, status) values ('c0e1b200-0000-4000-8000-000000000001', 'Queue Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0e1b200-0000-4000-8000-000000000001', id, null from public.roles where code = 'SUPER_ADMIN';
select set_config('request.jwt.claim.sub', 'c0e1b200-0000-4000-8000-000000000001', true);

insert into public.curriculums(id, code, name) values ('c0e1b200-0000-4000-8000-000000000011', 'QUE-CUR', 'Queue curriculum');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values ('c0e1b200-0000-4000-8000-000000000012', 'c0e1b200-0000-4000-8000-000000000011', 'QUE-L1', 'Queue level', 1);
insert into public.courses(id, curriculum_id, level_id, code, name) values ('c0e1b200-0000-4000-8000-000000000013', 'c0e1b200-0000-4000-8000-000000000011', 'c0e1b200-0000-4000-8000-000000000012', 'QUE-COURSE', 'Queue course');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status, accepted_from_level_id, accepted_to_level_id)
values ('c0e1b200-0000-4000-8000-000000000014', (select id from public.branches where code = 'V01'), 'c0e1b200-0000-4000-8000-000000000013', 'QUE-CLASS', 'Queue class', 'ONE_ON_ONE', 1, 'ACTIVE', 'c0e1b200-0000-4000-8000-000000000012', 'c0e1b200-0000-4000-8000-000000000012');
insert into public.students(id, student_code, default_branch_id, full_name, status) values ('c0e1b200-0000-4000-8000-000000000015', 'QUE-STUDENT', (select id from public.branches where code = 'V01'), 'Học viên hàng đợi', 'ACTIVE');
insert into public.parents(id, parent_code, status) values ('c0e1b200-0000-4000-8000-000000000016', 'PH-QUE-01', 'ACTIVE');
insert into public.student_parents(student_id, parent_id, relationship, is_primary, can_view_finance, is_active)
values ('c0e1b200-0000-4000-8000-000000000015', 'c0e1b200-0000-4000-8000-000000000016', 'Phụ huynh', true, true, true);
insert into public.student_curriculum_enrollments(id, student_id, curriculum_id, current_level_id, is_primary, status, started_at)
values ('c0e1b200-0000-4000-8000-000000000017', 'c0e1b200-0000-4000-8000-000000000015', 'c0e1b200-0000-4000-8000-000000000011', 'c0e1b200-0000-4000-8000-000000000012', true, 'ACTIVE', date '2026-08-01');
insert into public.teachers(id, teacher_code, full_name, status) values ('c0e1b200-0000-4000-8000-000000000018', 'QUE-T', 'Queue teacher', 'ACTIVE');
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at)
values ('c0e1b200-0000-4000-8000-000000000014', 'c0e1b200-0000-4000-8000-000000000018', 'PRIMARY', true, date '2026-08-01');
insert into public.rooms(id, branch_id, code, name, capacity) values ('c0e1b200-0000-4000-8000-000000000019', (select id from public.branches where code = 'V01'), 'QUE-ROOM', 'Queue room', 1);
insert into public.schedules(class_id, room_id, day_of_week, start_time, end_time, effective_from, timezone, status)
values ('c0e1b200-0000-4000-8000-000000000014', 'c0e1b200-0000-4000-8000-000000000019', 1, time '06:00', time '07:00', date '2026-08-01', 'Asia/Ho_Chi_Minh', 'ACTIVE');
insert into public.enrollments(id, student_id, class_id, student_curriculum_enrollment_id, enrolled_at, started_at, status)
values ('c0e1b200-0000-4000-8000-000000000020', 'c0e1b200-0000-4000-8000-000000000015', 'c0e1b200-0000-4000-8000-000000000014', 'c0e1b200-0000-4000-8000-000000000017', date '2026-08-01', date '2026-08-01', 'ACTIVE');
insert into public.enrollment_tuition(enrollment_id, tuition_plan_id, starts_on, status, discount_type, discount_value)
values ('c0e1b200-0000-4000-8000-000000000020', (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), date '2026-08-01', 'ACTIVE', 'NONE', 0);
insert into public.tuition_reminders(id, enrollment_tuition_id, event_code, window_start, window_end)
select 'c0e1b200-0000-4000-8000-000000000021', id, 'RENEWAL_V1', date '2026-10-01', date '2026-10-31'
from public.enrollment_tuition where enrollment_id = 'c0e1b200-0000-4000-8000-000000000020';

insert into public.tuition_zalo_sends(
  tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, send_status, provider_message_id, oa_id, sent_at
) select 'queueretrytracking01', 'c0e1b200-0000-4000-8000-000000000021', 'c0e1b200-0000-4000-8000-000000000015',
  'c0e1b200-0000-4000-8000-000000000016', id, 'SENT', 'msgqueue01', '12345678', clock_timestamp()
from public.enrollment_tuition where enrollment_id = 'c0e1b200-0000-4000-8000-000000000020';

select set_config('request.jwt.claim.role', 'service_role', true);
select is(public.record_tuition_zalo_reply('Zalo ZBS', 'queueretrytracking01', 'msgqueue01', 'Tiếp tục học', '1760000000000', '12345678'), 'recorded', 'first button reply is recorded');
select is(public.record_tuition_zalo_reply('Zalo ZBS', 'queueretrytracking01', 'msgqueue01', 'Tiếp tục học', '1760000000000', '12345678'), 'duplicate', 'repeated webhook does not record a second reply');
select is((select count(*) from public.tuition_zalo_replies where reminder_id = 'c0e1b200-0000-4000-8000-000000000021'), 1::bigint, 'one reply row remains');

select is((select count(*) from public.claim_tuition_renewal_automation(1)), 1::bigint, 'queue claims the continue reply');
select is((select count(*) from public.claim_tuition_renewal_automation(1)), 0::bigint, 'a live lock is not claimed twice');
update public.tuition_renewal_automation set locked_until = clock_timestamp() - interval '1 minute'
where reminder_id = 'c0e1b200-0000-4000-8000-000000000021';
select is((select reminder_id from public.claim_tuition_renewal_automation(1)), 'c0e1b200-0000-4000-8000-000000000021'::uuid, 'an expired lock is reclaimed for the same reminder');

select is((public.auto_begin_tuition_renewal('c0e1b200-0000-4000-8000-000000000021')->>'result'), 'created', 'the reclaimed run opens one renewal');
select is((public.auto_begin_tuition_renewal('c0e1b200-0000-4000-8000-000000000021')->>'result'), 'existing', 'a repeated begin reuses the renewal');
select is((select count(*) from public.tuition_renewal_cases where reminder_id = 'c0e1b200-0000-4000-8000-000000000021'), 1::bigint, 'retry does not create a second case');
select is((select count(*) from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b200-0000-4000-8000-000000000021'), 1::bigint, 'retry does not create a second reserved order');

select is(public.finish_tuition_renewal_automation('c0e1b200-0000-4000-8000-000000000021', 'PENDING', 'prepare', 'ZBS_SEND_DISABLED'), 'PENDING', 'a disabled template stays pending');
select is((select status from public.tuition_renewal_automation where reminder_id = 'c0e1b200-0000-4000-8000-000000000021'), 'PENDING', 'waiting does not become held');
select is((select attempts from public.tuition_renewal_automation where reminder_id = 'c0e1b200-0000-4000-8000-000000000021'), 1, 'waiting does not consume a failure attempt');

select is(public.activate_tuition_payos_checkout(
  (select id from public.tuition_renewal_cases where reminder_id = 'c0e1b200-0000-4000-8000-000000000021'),
  (select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b200-0000-4000-8000-000000000021'),
  2750000, 'queuelink01', 'https://pay.payos.vn/web/queuelink01', ''), 'ACTIVATED', 'fixture checkout is stored without calling payOS');
select is(public.record_verified_tuition_payos_webhook(
  (select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b200-0000-4000-8000-000000000021'),
  'queuelink01', 'REF-QUEUE', 2750000, 'VND'), 'DEPOSIT_PAID', 'first verified webhook records the deposit');
select is(public.record_verified_tuition_payos_webhook(
  (select order_code from public.tuition_payos_orders o join public.tuition_renewal_cases c on c.id = o.case_id where c.reminder_id = 'c0e1b200-0000-4000-8000-000000000021'),
  'queuelink01', 'REF-QUEUE', 2750000, 'VND'), 'ALREADY_DEPOSIT', 'repeated payment webhook does not post again');
select is((select count(*) from public.tuition_payos_webhook_events e
  join public.tuition_payos_orders o on o.order_code = e.order_code
  join public.tuition_renewal_cases c on c.id = o.case_id
  where c.reminder_id = 'c0e1b200-0000-4000-8000-000000000021'), 1::bigint, 'one payment event remains');

select * from finish();
rollback;
