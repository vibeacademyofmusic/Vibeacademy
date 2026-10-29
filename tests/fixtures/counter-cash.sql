-- Synthetic local/CI records only. Never execute against production.
insert into auth.users(id) values ('e9500000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
('e9500000-0000-4000-8000-000000000002', 'PayOS Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'e9500000-0000-4000-8000-000000000002', id from public.roles where code = 'SUPER_ADMIN';
insert into public.curriculums(id, code, name, status) values
('e9500000-0000-4000-8000-000000000020', 'PAYOS-C', 'Guitar PayOS', 'ACTIVE');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status) values
('e9500000-0000-4000-8000-000000000021', 'e9500000-0000-4000-8000-000000000020', 'PAYOS-L', 'Grade 1', 1, 'ACTIVE');
insert into public.curriculum_subjects(id, level_id, family_code, code, name, subject_level, is_required, completion_rule, sort_order, status) values
('e9500000-0000-4000-8000-000000000022', 'e9500000-0000-4000-8000-000000000021', 'TECHNIQUE', 'PAYOS-S', 'Technique', 1, true, 'DIRECT_ASSESSMENT', 1, 'ACTIVE');

select set_config('request.jwt.claim.sub', 'e9500000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

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
values ('c0e1b100-0000-4000-8000-000000000017', 'c0e1b100-0000-4000-8000-000000000015', 'c0e1b100-0000-4000-8000-000000000011', 'c0e1b100-0000-4000-8000-000000000012', true, 'ACTIVE', (current_date - interval '3 months')::date);
insert into public.teachers(id, teacher_code, full_name, status) values ('c0e1b100-0000-4000-8000-000000000018', 'REN-T', 'Renewal teacher', 'ACTIVE');
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at)
values ('c0e1b100-0000-4000-8000-000000000014', 'c0e1b100-0000-4000-8000-000000000018', 'PRIMARY', true, (current_date - interval '3 months')::date);
insert into public.rooms(id, branch_id, code, name, capacity) values ('c0e1b100-0000-4000-8000-000000000019', (select id from public.branches where code = 'V01'), 'REN-ROOM', 'Renewal room', 1);
insert into public.schedules(class_id, room_id, day_of_week, start_time, end_time, effective_from, timezone, status)
values ('c0e1b100-0000-4000-8000-000000000014', 'c0e1b100-0000-4000-8000-000000000019', 1, time '06:00', time '07:00', (current_date - interval '3 months')::date, 'Asia/Ho_Chi_Minh', 'ACTIVE');
insert into public.enrollments(id, student_id, class_id, student_curriculum_enrollment_id, enrolled_at, started_at, status)
values ('c0e1b100-0000-4000-8000-000000000020', 'c0e1b100-0000-4000-8000-000000000015', 'c0e1b100-0000-4000-8000-000000000014', 'c0e1b100-0000-4000-8000-000000000017', (current_date - interval '3 months')::date, (current_date - interval '3 months')::date, 'ACTIVE');
insert into public.enrollment_tuition(enrollment_id, tuition_plan_id, starts_on, status, discount_type, discount_value)
values ('c0e1b100-0000-4000-8000-000000000020', (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'), (current_date - interval '3 months')::date, 'ACTIVE', 'NONE', 0);
insert into public.tuition_reminders(id, enrollment_tuition_id, event_code, window_start, window_end)
select 'c0e1b100-0000-4000-8000-000000000021', id, 'RENEWAL_V1', current_date, current_date + 30
from public.enrollment_tuition where enrollment_id = 'c0e1b100-0000-4000-8000-000000000020';

