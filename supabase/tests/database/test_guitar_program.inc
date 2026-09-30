-- Self-contained Guitar program for database tests.
-- Clean migrations do not seed the local TEST_GUITAR demo.
insert into public.curriculums(id, code, name)
values ('c2100000-0000-4000-8000-0000000000b0', 'TEST_GUITAR', 'Guitar');

insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, level_number, level_type)
values
  ('c2100000-0000-4000-8000-0000000000b1', 'c2100000-0000-4000-8000-0000000000b0', 'PRE', 'Pre', 1, null, 'FOUNDATION'),
  ('c2100000-0000-4000-8000-0000000000b2', 'c2100000-0000-4000-8000-0000000000b0', 'GRADE_1', 'Grade 1', 2, 1, 'GRADE'),
  ('c2100000-0000-4000-8000-0000000000b3', 'c2100000-0000-4000-8000-0000000000b0', 'GRADE_3', 'Grade 3', 3, 3, 'GRADE'),
  ('c2100000-0000-4000-8000-0000000000b4', 'c2100000-0000-4000-8000-0000000000b0', 'GRADE_5', 'Grade 5', 4, 5, 'GRADE'),
  ('c2100000-0000-4000-8000-0000000000b5', 'c2100000-0000-4000-8000-0000000000b0', 'GRADE_6', 'Grade 6', 5, 6, 'GRADE');

insert into public.curriculum_subjects(id, level_id, family_code, code, name, subject_level, is_required, completion_rule, sort_order, status)
select
  ('c2100000-0000-4000-8000-000000000c0' || i)::uuid,
  level_id,
  'REPERTOIRE',
  'REPERTOIRE',
  'Repertoire',
  null,
  true,
  'ALL_REQUIRED_COMPONENTS',
  1,
  'ACTIVE'
from (
  select id as level_id, row_number() over (order by sequence_no) as i
  from public.curriculum_levels
  where curriculum_id = 'c2100000-0000-4000-8000-0000000000b0'
) levels;

insert into public.curriculum_subject_components(id, subject_id, code, name, is_required, sort_order, status, completion_rule)
select
  ('c2100000-0000-4000-8000-000000000d0' || i)::uuid,
  id,
  'CORE',
  'Core',
  true,
  1,
  'ACTIVE',
  'ALL_REQUIRED_ITEMS'
from (
  select id, row_number() over (order by id) as i
  from public.curriculum_subjects
  where level_id in (
    select id from public.curriculum_levels
    where curriculum_id = 'c2100000-0000-4000-8000-0000000000b0'
  )
) subjects;

insert into public.curriculum_component_items(id, component_id, code, name, sort_order, is_required, status)
select
  ('c2100000-0000-4000-8000-000000000e0' || i)::uuid,
  id,
  'L01',
  'Lesson 1',
  1,
  true,
  'ACTIVE'
from (
  select id, row_number() over (order by id) as i
  from public.curriculum_subject_components
  where subject_id in (
    select id from public.curriculum_subjects
    where level_id in (
      select id from public.curriculum_levels
      where curriculum_id = 'c2100000-0000-4000-8000-0000000000b0'
    )
  )
) components;
