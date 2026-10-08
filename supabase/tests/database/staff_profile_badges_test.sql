begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is((select buckets.public from storage.buckets buckets where buckets.id = 'staff-portraits'), false, 'portrait bucket is private');
select ok(
  pg_get_function_result('public.staff_name_card(uuid)'::regprocedure) !~* 'email|phone|citizen|salary|payroll|cccd',
  'name card columns stay public'
);

insert into auth.users(id) values
  ('c7261800-0000-4000-8000-000000000001'),
  ('c7261800-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
  ('c7261800-0000-4000-8000-000000000001', 'Staff badge super', 'ACTIVE'),
  ('c7261800-0000-4000-8000-000000000002', 'Staff badge other', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'c7261800-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id)
select 'c7261800-0000-4000-8000-000000000002', id from public.roles where code = 'BRANCH_ADMIN';

insert into public.curriculums(id, code, name, status) values
  ('c7261800-0000-4000-8000-000000000010', 'STAFFCARD', 'Staff card synthetic', 'ACTIVE'),
  ('c7261800-0000-4000-8000-000000000012', 'STAFF-GTR', 'Guitar', 'ACTIVE'),
  ('c7261800-0000-4000-8000-000000000013', 'STAFF-PNO', 'Piano', 'ACTIVE');
insert into public.branches(id, code, name, status) values
  ('c7261800-0000-4000-8000-000000000020', 'STAFF-CARD', 'Chi nhánh thẻ thử', 'ACTIVE');
insert into public.teachers(id, teacher_code, full_name) values
  ('c7261800-0000-4000-8000-000000000030', 'GV-CARD', 'Giáo viên thẻ thử');
update public.organization_units set branch_id = 'c7261800-0000-4000-8000-000000000020' where code = 'HQ';

create temp table f(id uuid);
grant all on f to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c7261800-0000-4000-8000-000000000001', true);
insert into f select public.create_employee(
  'HQ', '2026-09-01', 'Lý Minh Kha', 'Giảng dạy', 'PER_SESSION',
  (select id from public.roles where code = 'TEACHER'),
  null, null, 'Hồ sơ thử huy hiệu'
);

select lives_ok($$select public.assign_staff_teaching((select id from f), 'c7261800-0000-4000-8000-000000000012', 'TEACHER', '2026-09-01', 'Dạy guitar')$$, 'guitar teacher capacity');
select lives_ok($$select public.assign_staff_teaching((select id from f), 'c7261800-0000-4000-8000-000000000013', 'ASSISTANT', '2026-09-01', 'Trợ giảng piano')$$, 'piano assistant capacity');
select throws_ok($$select public.assign_staff_teaching((select id from f), 'c7261800-0000-4000-8000-000000000012', 'TEACHER', '2026-09-15', 'Trùng')$$, 'P0001', 'STAFF_TEACHING_OVERLAP', 'same capacity is not overwritten');
select lives_ok($$select public.assign_staff_position((select id from f), 'VAM', '2026-09-01', 'Vị trí VAM')$$, 'VAM position');
select lives_ok($$select public.assign_staff_position((select id from f), 'VAS', '2026-09-01', 'Vị trí VAS')$$, 'VAS can coexist');
select throws_ok($$select public.assign_staff_position((select id from f), 'MANAGER', '2026-09-01', 'Sai mã')$$, 'P0001', 'STAFF_POSITION_UNKNOWN', 'only VAS VAM VAH');

select is(
  (select teaching_badges from public.staff_name_card((select id from f))),
  array['Giáo viên Guitar', 'Trợ giảng Piano']::text[],
  'card lists subject-specific teaching badges'
);
select is(
  (select position_badges from public.staff_name_card((select id from f))),
  array['VAM', 'VAS']::text[],
  'card lists concurrent position badges'
);
select is((select branch_name from public.staff_name_card((select id from f))), 'Chi nhánh thẻ thử', 'card shows the current linked branch');
select is(
  (select operational_role_id from public.employee_versions where employee_id = (select id from f) order by version desc limit 1),
  (select id from public.roles where code = 'TEACHER'),
  'position badges do not replace operational role'
);
select is((select count(*) from public.user_roles where user_id = 'c7261800-0000-4000-8000-000000000001'), 1::bigint, 'badges do not grant another account role');
select is((select count(*) from public.staff_compensation_components where employee_id = (select id from f)), 0::bigint, 'badges do not create payroll components');

select lives_ok($$select public.end_staff_teaching((select id from public.staff_teaching_assignments where employee_id = (select id from f) and capacity = 'TEACHER'), '2026-09-20', 'Kết thúc guitar')$$, 'end keeps history');
select is((select status from public.staff_teaching_assignments where employee_id = (select id from f) and capacity = 'TEACHER'), 'INACTIVE', 'ended capacity stays on file');
select is((select curriculum_id from public.staff_teaching_assignments where employee_id = (select id from f) and capacity = 'TEACHER' and status = 'INACTIVE'), 'c7261800-0000-4000-8000-000000000012'::uuid, 'ending does not rewrite the subject');
select is((select teaching_badges from public.staff_name_card((select id from f))), array['Trợ giảng Piano']::text[], 'ended capacity leaves the card');
select lives_ok($$select public.assign_staff_teaching((select id from f), 'c7261800-0000-4000-8000-000000000012', 'TEACHER', '2026-09-21', 'Dạy lại')$$, 'a later capacity can start after history');

select lives_ok($$select public.record_staff_portrait((select id from f), (select id from f)::text || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1.png', 'image/png', 1200, 800, 1000)$$, 'portrait metadata recorded');
select lives_ok($$select public.record_staff_portrait((select id from f), (select id from f)::text || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2.png', 'image/png', 1400, 900, 1100)$$, 'replacement keeps one active portrait');
select is((select count(*) from public.staff_portraits where employee_id = (select id from f) and status = 'ACTIVE'), 1::bigint, 'one active portrait');
select is((select count(*) from public.staff_portraits where employee_id = (select id from f) and status = 'REPLACED'), 1::bigint, 'previous portrait retained as replaced');
select throws_ok($$select public.record_staff_portrait((select id from f), (select id from f)::text || '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3.png', 'image/png', 100, 50, 50)$$, 'P0001', 'STAFF_PORTRAIT_INVALID', 'tiny portrait rejected');
select is((select public.remove_staff_portrait((select id from f), 'Gỡ ảnh thử') like (select id from f)::text || '/%'), true, 'remove returns the private path');
select is((select count(*) from public.staff_portraits where employee_id = (select id from f) and status = 'ACTIVE'), 0::bigint, 'removed portrait is not active');

select lives_ok($$select public.link_employee_identity((select id from f), null, 'c7261800-0000-4000-8000-000000000030', 'Liên kết giáo viên đã xác nhận')$$, 'explicit teacher link');
create temp table g(id uuid);
insert into g select public.create_employee('ST', '2026-09-02', 'Người thứ hai', 'Vận hành', 'MONTHLY', null, null, null, 'Hồ sơ thứ hai');
select throws_ok($$select public.link_employee_identity((select id from g), null, 'c7261800-0000-4000-8000-000000000030', 'Trùng giáo viên')$$, '23505', null, 'one teacher cannot belong to two staff profiles');

select set_config('request.jwt.claim.sub', 'c7261800-0000-4000-8000-000000000002', true);
select throws_ok($$select public.assign_staff_position((select id from f limit 1), 'VAH', '2026-09-01', 'Không được')$$, 'P0001', 'STAFF_PROFILE_UNAUTHORIZED', 'branch admin cannot assign positions');
select throws_ok($$select * from public.staff_name_card((select id from f limit 1))$$, 'P0001', 'STAFF_PROFILE_UNAUTHORIZED', 'branch admin cannot read the name card');
select is((select count(*) from public.staff_teaching_assignments), 0::bigint, 'teaching rows stay hidden without staff administration');

select * from finish();
rollback;
