begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
  ('c7310000-0000-4000-8000-000000000011'),
  ('c7310000-0000-4000-8000-000000000012'),
  ('c7310000-0000-4000-8000-000000000013');
insert into profiles(id, full_name, status) values
  ('c7310000-0000-4000-8000-000000000011', 'Lesson Super', 'ACTIVE'),
  ('c7310000-0000-4000-8000-000000000012', 'Lesson Other', 'ACTIVE'),
  ('c7310000-0000-4000-8000-000000000013', 'Lesson Inactive', 'INACTIVE');
insert into user_roles(user_id, role_id)
select 'c7310000-0000-4000-8000-000000000011', id from roles where code = 'SUPER_ADMIN';
insert into user_roles(user_id, role_id)
select 'c7310000-0000-4000-8000-000000000012', id from roles where code = 'BRANCH_ADMIN';
insert into user_roles(user_id, role_id)
select 'c7310000-0000-4000-8000-000000000013', id from roles where code = 'SUPER_ADMIN';

insert into curriculums(id, code, name, status) values
  ('c7310000-0000-4000-8000-000000000001', 'LESSONCRUD', 'Lesson CRUD', 'ACTIVE');
insert into curriculum_levels(id, curriculum_id, code, name, sequence_no, level_type, status) values
  ('c7310000-0000-4000-8000-000000000002', 'c7310000-0000-4000-8000-000000000001', 'G1', 'Grade 1', 1, 'GRADE', 'ACTIVE');
insert into curriculum_subjects(id, level_id, family_code, code, name, completion_rule, is_required, sort_order, status) values
  ('c7310000-0000-4000-8000-000000000003', 'c7310000-0000-4000-8000-000000000002', 'REPERTOIRE', 'REP', 'Repertoire', 'ALL_REQUIRED_COMPONENTS', true, 1, 'ACTIVE'),
  ('c7310000-0000-4000-8000-000000000006', 'c7310000-0000-4000-8000-000000000002', 'DIRECT', 'DIR', 'Direct', 'DIRECT_ASSESSMENT', true, 2, 'ACTIVE'),
  ('c7310000-0000-4000-8000-000000000007', 'c7310000-0000-4000-8000-000000000002', 'MANUAL', 'MAN', 'Manual', 'MANUAL', false, 3, 'ACTIVE');
insert into curriculum_subject_components(id, subject_id, code, name, is_required, sort_order, completion_rule, status) values
  ('c7310000-0000-4000-8000-000000000004', 'c7310000-0000-4000-8000-000000000003', 'CORE', 'Core', true, 1, 'ALL_REQUIRED_ITEMS', 'ACTIVE'),
  ('c7310000-0000-4000-8000-000000000005', 'c7310000-0000-4000-8000-000000000003', 'ETUDE', 'Etude', true, 2, 'DIRECT_ASSESSMENT', 'ACTIVE'),
  ('c7310000-0000-4000-8000-000000000008', 'c7310000-0000-4000-8000-000000000006', 'STORE', 'Storage', true, 1, 'DIRECT_ASSESSMENT', 'ACTIVE');

select ok(not has_function_privilege('anon', 'public.create_curriculum_lesson(uuid,uuid,uuid,uuid,text,text,boolean,integer,text)', 'EXECUTE'), 'LSEC01 anon cannot create a lesson');
select ok(not has_function_privilege('anon', 'public.update_curriculum_lesson(uuid,uuid,uuid,uuid,text,text,boolean,integer,text)', 'EXECUTE'), 'anon cannot edit a lesson');
select ok(not has_function_privilege('anon', 'public.reorder_curriculum_lesson(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE'), 'anon cannot reorder a lesson');
select ok(not has_function_privilege('anon', 'public.retire_curriculum_lesson(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'anon cannot retire a lesson');
select ok(not has_table_privilege('anon', 'public.curriculum_component_items', 'INSERT'), 'LSEC08 anon cannot insert lesson rows');
select ok(not has_table_privilege('authenticated', 'public.curriculum_component_items', 'INSERT'), 'authenticated cannot insert lesson rows');
select ok(not has_table_privilege('authenticated', 'public.curriculum_component_items', 'UPDATE'), 'authenticated cannot update lesson rows');
select ok(not has_table_privilege('authenticated', 'public.curriculum_component_items', 'DELETE'), 'authenticated cannot delete lesson rows');
select ok(not has_function_privilege('authenticated', 'public.lesson_operator_component(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'ownership helper stays private');

select set_config('request.jwt.claim.sub', 'c7310000-0000-4000-8000-000000000012', true);
select throws_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003','c7310000-0000-4000-8000-000000000004','L01','Lesson 01',true,1,'ACTIVE')$$,
  '42501', 'Unauthorized', 'LSEC02 non-super-admin create is rejected'
);

select set_config('request.jwt.claim.sub', 'c7310000-0000-4000-8000-000000000013', true);
select throws_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003','c7310000-0000-4000-8000-000000000004','L01','Lesson 01',true,1,'ACTIVE')$$,
  '42501', 'Unauthorized', 'inactive account cannot create a lesson'
);

select set_config('request.jwt.claim.sub', 'c7310000-0000-4000-8000-000000000011', true);
select throws_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003','c7310000-0000-4000-8000-000000000004','bad code','Lesson',true,1,'ACTIVE')$$,
  'P0001', 'Invalid lesson code', 'LSEC06 invalid lesson code is rejected'
);
select throws_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000006','c7310000-0000-4000-8000-000000000004','L01','Lesson 01',true,1,'ACTIVE')$$,
  'P0001', 'Invalid academic structure', 'LSEC04 component from another subject is rejected'
);

select is(
  (select name from create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003','c7310000-0000-4000-8000-000000000004','l01','Lesson 01',true,1,'ACTIVE')),
  'Lesson 01',
  'LSEC03 L01 super-admin create returns the lesson and normalizes code'
);
select throws_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003','c7310000-0000-4000-8000-000000000004','L01','Duplicate',true,2,'ACTIVE')$$,
  '23505', 'Lesson code already exists', 'LSEC07 duplicate code in the same component is rejected'
);
select lives_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003','c7310000-0000-4000-8000-000000000005','L01','Etude 01',true,1,'ACTIVE')$$,
  'the same code is allowed under a different component'
);
select lives_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003','c7310000-0000-4000-8000-000000000004','L02','Lesson 02',true,2,'ACTIVE')$$,
  'second required lesson is created'
);
select lives_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003','c7310000-0000-4000-8000-000000000004','L03','Lesson 03',true,3,'ACTIVE')$$,
  'third lesson is created'
);

select is(
  (select name from update_curriculum_lesson(
    'c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003',
    (select id from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000004' and code = 'L03'),
    'L03','Lesson 03 Updated',true,3,'ACTIVE')),
  'Lesson 03 Updated',
  'L02 edit changes the title and keeps the parent'
);
select is(
  (select component_id from curriculum_component_items where code = 'L03' and component_id = 'c7310000-0000-4000-8000-000000000004'),
  'c7310000-0000-4000-8000-000000000004'::uuid,
  'edit does not move the lesson to another component'
);

select lives_ok(
  $$select reorder_curriculum_lesson(
    'c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003',
    (select id from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000004' and code = 'L03'),
    'up','active')$$,
  'L03 move up succeeds'
);
select is(
  (select sort_order from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000004' and code = 'L03'),
  2,
  'L05 moved lesson keeps order 2 after the write'
);
select lives_ok(
  $$select reorder_curriculum_lesson(
    'c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003',
    (select id from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000004' and code = 'L03'),
    'down','active')$$,
  'L04 move down restores the original slot'
);
select is(
  (select string_agg(code, ',' order by sort_order) from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000004' and status = 'ACTIVE'),
  'L01,L02,L03',
  'active lesson order is contiguous after reorder'
);

-- Isolate the gate: make two lessons optional, then the last required active lesson cannot be retired.
select lives_ok(
  $$select update_curriculum_lesson(
    'c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003',
    (select id from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000004' and code = 'L02'),
    'L02','Lesson 02',false,2,'ACTIVE')$$,
  'a required lesson can become optional while another required lesson remains'
);
select lives_ok(
  $$select update_curriculum_lesson(
    'c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003',
    (select id from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000004' and code = 'L03'),
    'L03','Lesson 03 Updated',false,3,'ACTIVE')$$,
  'second lesson can become optional while one required lesson remains'
);
select throws_ok(
  $$select retire_curriculum_lesson(
    'c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000003',
    (select id from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000004' and code = 'L01'))$$,
  'P0001', 'Nhóm đánh giá hoàn thành từ Lesson bắt buộc cần ít nhất một Lesson bắt buộc đang hoạt động.',
  'L08 the last required active lesson cannot be retired'
);

select lives_ok(
  $$select create_curriculum_lesson('c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000006','c7310000-0000-4000-8000-000000000008','L01','Direct 01',true,1,'ACTIVE')$$,
  'direct assessment subject can store a lesson'
);
select is(
  (select completion_rule from curriculum_subjects where id = 'c7310000-0000-4000-8000-000000000006'),
  'DIRECT_ASSESSMENT',
  'L09 lesson writes do not change a direct assessment subject'
);
select is(
  (select completion_rule from curriculum_subjects where id = 'c7310000-0000-4000-8000-000000000007'),
  'MANUAL',
  'L10 lesson writes do not change a manual subject'
);
select lives_ok(
  $$select retire_curriculum_lesson(
    'c7310000-0000-4000-8000-000000000001','c7310000-0000-4000-8000-000000000002','c7310000-0000-4000-8000-000000000006',
    (select id from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000008' and code = 'L01'))$$,
  'L06 a direct-assessment lesson can be retired'
);
select is(
  (select status from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000008' and code = 'L01'),
  'INACTIVE',
  'retired lesson remains stored'
);

insert into branches(id, code, name) values ('c7310000-0000-4000-8000-000000000021', 'LCRUD', 'Lesson branch');
insert into students(id, student_code, full_name, default_branch_id) values
  ('c7310000-0000-4000-8000-000000000022', 'LCRUD-S', 'Lesson student', 'c7310000-0000-4000-8000-000000000021');
insert into student_curriculum_enrollments(id, student_id, curriculum_id, current_level_id, status) values
  ('c7310000-0000-4000-8000-000000000023', 'c7310000-0000-4000-8000-000000000022', 'c7310000-0000-4000-8000-000000000001', 'c7310000-0000-4000-8000-000000000002', 'ACTIVE');
insert into student_level_progress(id, enrollment_id, level_id, status) values
  ('c7310000-0000-4000-8000-000000000024', 'c7310000-0000-4000-8000-000000000023', 'c7310000-0000-4000-8000-000000000002', 'IN_PROGRESS');
insert into student_subject_progress(id, level_progress_id, subject_id, status) values
  ('c7310000-0000-4000-8000-000000000025', 'c7310000-0000-4000-8000-000000000024', 'c7310000-0000-4000-8000-000000000006', 'IN_PROGRESS');
insert into student_component_progress(id, subject_progress_id, component_id, status) values
  ('c7310000-0000-4000-8000-000000000026', 'c7310000-0000-4000-8000-000000000025', 'c7310000-0000-4000-8000-000000000008', 'IN_PROGRESS');
insert into student_component_item_progress(id, component_progress_id, item_id, status) values
  ('c7310000-0000-4000-8000-000000000027', 'c7310000-0000-4000-8000-000000000026',
   (select id from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000008' and code = 'L01'),
   'PASS');
select is(
  (select status from student_component_item_progress where id = 'c7310000-0000-4000-8000-000000000027'),
  'PASS',
  'L07 historical item progress remains after retirement'
);
select throws_ok(
  $$delete from curriculum_component_items where component_id = 'c7310000-0000-4000-8000-000000000008' and code = 'L01'$$,
  '23503', null,
  'a referenced lesson cannot be deleted'
);
select is(
  (select confdeltype::text from pg_constraint where conname = 'student_component_item_progress_item_id_fkey'),
  'r',
  'lesson progress reference is ON DELETE RESTRICT'
);

select * from finish();
rollback;
