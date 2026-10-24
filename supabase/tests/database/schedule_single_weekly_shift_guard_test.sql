-- New independent teaching shifts have one recurring weekly slot. The
-- migration-time allowlist preserves already approved multi-day classes.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('f3700000-0000-4000-8000-000000000001', 'TEST-SINGLE-SHIFT', 'TEST Single Shift');
insert into public.curriculums(id, code, name) values
  ('f3700000-0000-4000-8000-000000000010', 'TEST-SINGLE-PIANO', 'TEST Piano');
insert into public.courses(id, curriculum_id, code, name) values
  ('f3700000-0000-4000-8000-000000000030',
   'f3700000-0000-4000-8000-000000000010', 'TEST-SINGLE-COURSE', 'TEST Piano');
insert into public.classes(id, branch_id, course_id, code, name, class_type,
  capacity, status) values
  ('f3700000-0000-4000-8000-000000000040', 'f3700000-0000-4000-8000-000000000001',
   'f3700000-0000-4000-8000-000000000030', 'TEST-SINGLE-NEW', 'TEST New Shift',
   'GROUP', 2, 'ACTIVE'),
  ('f3700000-0000-4000-8000-000000000041', 'f3700000-0000-4000-8000-000000000001',
   'f3700000-0000-4000-8000-000000000030', 'TEST-SINGLE-LEGACY', 'TEST Legacy Shift',
   'GROUP', 2, 'ACTIVE');
insert into public.rooms(id, branch_id, code, name, capacity, status) values
  ('f3700000-0000-4000-8000-000000000050', 'f3700000-0000-4000-8000-000000000001',
   'TEST-SINGLE-ROOM', 'TEST Legacy Room', 2, 'ACTIVE');

select lives_ok($$insert into public.schedules(id, class_id, day_of_week,
  start_time, end_time, effective_from, status) values
  ('f3700000-0000-4000-8000-000000000070', 'f3700000-0000-4000-8000-000000000040',
   1, time '08:00', time '09:00', current_date + 1, 'ACTIVE')$$,
  'a new shift accepts its first weekly schedule');
select throws_ok($$insert into public.schedules(id, class_id, day_of_week,
  start_time, end_time, effective_from, status) values
  ('f3700000-0000-4000-8000-000000000071', 'f3700000-0000-4000-8000-000000000040',
   2, time '10:00', time '11:00', current_date + 1, 'ACTIVE')$$,
  'P0001', 'SCHEDULE_SHIFT_MULTIDAY',
  'new shift cannot acquire a second simultaneous weekly schedule');
select lives_ok($$update public.schedules set effective_to = current_date + 7
  where id = 'f3700000-0000-4000-8000-000000000070'$$,
  'first schedule may be closed on an inclusive end date');
select lives_ok($$insert into public.schedules(id, class_id, day_of_week,
  start_time, end_time, effective_from, status) values
  ('f3700000-0000-4000-8000-000000000071', 'f3700000-0000-4000-8000-000000000040',
   2, time '10:00', time '11:00', current_date + 8, 'ACTIVE')$$,
  'a subsequent non-overlapping schedule version is allowed');
select throws_ok($$update public.schedules set effective_from = current_date + 7
  where id = 'f3700000-0000-4000-8000-000000000071'$$,
  'P0001', 'SCHEDULE_SHIFT_MULTIDAY',
  'inclusive boundary cannot overlap two active versions');

-- Only class IDs captured at migration time get this exception in production.
-- A class-level exception preserves inactive weekday reactivation and
-- split_recurring_schedule, which creates a new schedule ID.
insert into maintenance_private.legacy_preexisting_class_ids(class_id) values
  ('f3700000-0000-4000-8000-000000000041');
insert into public.schedules(id, class_id, room_id, day_of_week, start_time, end_time,
  effective_from, status) values
  ('f3700000-0000-4000-8000-000000000072', 'f3700000-0000-4000-8000-000000000041',
   'f3700000-0000-4000-8000-000000000050', 3, time '13:00', time '14:00', current_date + 1, 'INACTIVE'),
  ('f3700000-0000-4000-8000-000000000073', 'f3700000-0000-4000-8000-000000000041',
   'f3700000-0000-4000-8000-000000000050', 4, time '13:00', time '14:00', current_date + 1, 'ACTIVE');
select lives_ok($$update public.schedules set status = 'ACTIVE'
  where id = 'f3700000-0000-4000-8000-000000000072'$$,
  'preexisting class may reactivate its second approved weekday');
select lives_ok($$update public.schedules set start_time = time '13:30', end_time = time '14:30'
  where id = 'f3700000-0000-4000-8000-000000000073'$$,
  'grandfathered multi-day schedule remains editable');
insert into auth.users(id) values ('f3700000-0000-4000-8000-000000000099');
insert into public.profiles(id, full_name, status) values
  ('f3700000-0000-4000-8000-000000000099', 'TEST Schedule Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'f3700000-0000-4000-8000-000000000099', id
from public.roles where code = 'SUPER_ADMIN';
select set_config('request.jwt.claim.sub', 'f3700000-0000-4000-8000-000000000099', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$select public.split_recurring_schedule(
  'f3700000-0000-4000-8000-000000000072', current_date + 8,
  3::smallint, time '15:00', time '16:00', 'f3700000-0000-4000-8000-000000000050')$$,
  'approved legacy multi-day class can split one weekday into a new version');
select is((select count(*) from public.schedules
  where class_id = 'f3700000-0000-4000-8000-000000000041'),
  3::bigint, 'legacy split retains both original weekdays and its new version');
select ok(not has_table_privilege('authenticated',
  'maintenance_private.legacy_preexisting_class_ids', 'INSERT'),
  'authenticated clients cannot add new classes to the legacy allowlist');

select * from finish();
rollback;
