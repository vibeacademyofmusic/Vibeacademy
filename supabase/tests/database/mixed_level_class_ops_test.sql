-- Mixed-level class ops DB tests (pgTAP)

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_column('public', 'classes', 'accepted_from_level_id', 'DB01 from level column');
select has_column('public', 'classes', 'accepted_to_level_id', 'DB01 to level column');

insert into public.curriculums(id, code, name, status)
values ('a1000000-0000-4000-8000-0000000000c1', 'TEST_ML_GUITAR', 'TEST Mixed Guitar Curriculum', 'ACTIVE')
on conflict (code) do update set name = excluded.name;

insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status)
values
  ('a1000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-0000000000c1', 'PRE', 'Pre', 0, 'ACTIVE'),
  ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-0000000000c1', 'G1', 'Grade 1', 1, 'ACTIVE'),
  ('a1000000-0000-4000-8000-000000000015', 'a1000000-0000-4000-8000-0000000000c1', 'G5', 'Grade 5', 5, 'ACTIVE'),
  ('a1000000-0000-4000-8000-000000000016', 'a1000000-0000-4000-8000-0000000000c1', 'G6', 'Grade 6', 6, 'ACTIVE')
on conflict (id) do nothing;

insert into public.curriculums(id, code, name, status)
values ('a1000000-0000-4000-8000-0000000000c2', 'TEST_ML_PIANO', 'TEST Mixed Piano Curriculum', 'ACTIVE')
on conflict (code) do update set name = excluded.name;

insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status)
values ('a1000000-0000-4000-8000-000000000025', 'a1000000-0000-4000-8000-0000000000c2', 'P5', 'Piano Grade 5', 5, 'ACTIVE')
on conflict (id) do nothing;

insert into public.courses(id, curriculum_id, level_id, code, name, status)
values ('a1000000-0000-4000-8000-0000000000c0', 'a1000000-0000-4000-8000-0000000000c1', null, 'TEST_ML_COURSE', 'TEST Mixed Guitar Course', 'ACTIVE')
on conflict (code) do update set curriculum_id = excluded.curriculum_id;

insert into public.branches(id, code, name, status)
values ('a1000000-0000-4000-8000-0000000000b0', 'TEST_ML_BR', 'TEST ML Branch', 'ACTIVE')
on conflict (code) do nothing;

insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status)
values (
  'a1000000-0000-4000-8000-0000000000a0',
  'a1000000-0000-4000-8000-0000000000b0',
  'a1000000-0000-4000-8000-0000000000c0',
  'TEST_ML_CLASS',
  'TEST Mixed Guitar',
  'GROUP',
  8,
  'ACTIVE'
)
on conflict (branch_id, code) do update set name = excluded.name;

select lives_ok(
  $$update public.classes set accepted_from_level_id = null, accepted_to_level_id = null where id = 'a1000000-0000-4000-8000-0000000000a0'$$,
  'DB05 null/null scope allowed'
);

select lives_ok(
  $$update public.classes set accepted_from_level_id = 'a1000000-0000-4000-8000-000000000010', accepted_to_level_id = 'a1000000-0000-4000-8000-000000000015' where id = 'a1000000-0000-4000-8000-0000000000a0'$$,
  'DB02 valid Pre→G5'
);

select throws_ok(
  $$update public.classes set accepted_from_level_id = 'a1000000-0000-4000-8000-000000000010', accepted_to_level_id = 'a1000000-0000-4000-8000-000000000025' where id = 'a1000000-0000-4000-8000-0000000000a0'$$,
  'P0001',
  'Class level scope must use Levels from the Course curriculum',
  'DB03 cross-curriculum rejected'
);

select throws_ok(
  $$update public.classes set accepted_from_level_id = 'a1000000-0000-4000-8000-000000000015', accepted_to_level_id = 'a1000000-0000-4000-8000-000000000010' where id = 'a1000000-0000-4000-8000-0000000000a0'$$,
  'P0001',
  'Class level scope from sequence cannot exceed to sequence',
  'DB04 reversed sequence rejected'
);

select throws_ok(
  $$update public.classes set accepted_from_level_id = 'a1000000-0000-4000-8000-000000000010', accepted_to_level_id = null where id = 'a1000000-0000-4000-8000-0000000000a0'$$,
  'P0001',
  'Class level scope requires both from and to Levels, or both null',
  'DB06 partial scope rejected'
);

update public.classes
set accepted_from_level_id = 'a1000000-0000-4000-8000-000000000010',
    accepted_to_level_id = 'a1000000-0000-4000-8000-000000000015'
where id = 'a1000000-0000-4000-8000-0000000000a0';

select is(
  public.class_enrollment_compatibility('a1000000-0000-4000-8000-0000000000a0', 'a1000000-0000-4000-8000-0000000000ff'),
  'ACADEMIC_PROGRAM_MISSING',
  'compatibility missing program'
);

select throws_ok(
  $$select public.set_class_level_scope('a1000000-0000-4000-8000-0000000000a0', 'a1000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000015')$$,
  'P0001',
  'Unauthorized',
  'DB07 unauthorized write denied'
);

select has_function('public', 'class_enrollment_compatibility', array['uuid','uuid'], 'compatibility RPC exists');
select has_function('public', 'class_student_current_level', array['uuid','uuid'], 'current level RPC exists');
select has_function('public', 'set_class_level_scope', array['uuid','uuid','uuid'], 'set scope RPC exists');

select * from finish();
rollback;
