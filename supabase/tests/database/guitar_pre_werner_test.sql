begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_function('public', 'apply_guitar_pre_werner_v1', 'Guitar Pre Werner authoring function is installed');

create temp table guitar_pre_werner_progress_before as
select count(*)::int as total from public.student_component_item_progress;

create temp table guitar_pre_werner_items_before as
select i.id
from public.curriculum_component_items i
join public.curriculum_subject_components c on c.id = i.component_id
join public.curriculum_subjects s on s.id = c.subject_id
join public.curriculum_levels l on l.id = s.level_id
join public.curriculums p on p.id = l.curriculum_id
where p.code = 'GUITAR' and l.code = 'PRE';

create temp table guitar_pre_werner_report as
select public.apply_guitar_pre_werner_v1() as report;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((select report->>'applied' from guitar_pre_werner_report), 'true', 'local Guitar catalog is reconciled')
  else skip('Guitar catalog is absent from this database')
end;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((
    select s.name from public.curriculum_subjects s
    join public.curriculum_levels l on l.id = s.level_id
    join public.curriculums p on p.id = l.curriculum_id
    where p.code = 'GUITAR' and l.code = 'PRE' and s.code = 'METHODE_BOOK'
  ), 'Classical Guitar Method – Volume 1', 'Volume 1 subject name')
  else skip('Guitar catalog is absent from this database')
end;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((
    select s.name from public.curriculum_subjects s
    join public.curriculum_levels l on l.id = s.level_id
    join public.curriculums p on p.id = l.curriculum_id
    where p.code = 'GUITAR' and l.code = 'PRE' and s.code = 'REPERTOIRE'
  ), 'Classical Guitar Method – Volume 2', 'Volume 2 subject name')
  else skip('Guitar catalog is absent from this database')
end;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((
    select count(*)::int from public.curriculum_component_items i
    join public.curriculum_subject_components c on c.id = i.component_id
    join public.curriculum_subjects s on s.id = c.subject_id
    join public.curriculum_levels l on l.id = s.level_id
    join public.curriculums p on p.id = l.curriculum_id
    where p.code = 'GUITAR' and l.code = 'PRE' and s.code = 'METHODE_BOOK' and i.status = 'ACTIVE'
  ), 50, 'Volume 1 has 50 active lessons')
  else skip('Guitar catalog is absent from this database')
end;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((
    select count(*)::int from public.curriculum_component_items i
    join public.curriculum_subject_components c on c.id = i.component_id
    join public.curriculum_subjects s on s.id = c.subject_id
    join public.curriculum_levels l on l.id = s.level_id
    join public.curriculums p on p.id = l.curriculum_id
    where p.code = 'GUITAR' and l.code = 'PRE' and s.code = 'REPERTOIRE' and i.status = 'ACTIVE'
  ), 50, 'Volume 2 has 50 active lessons')
  else skip('Guitar catalog is absent from this database')
end;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((
    select count(*)::int from public.curriculum_component_items i
    join public.curriculum_subject_components c on c.id = i.component_id
    join public.curriculum_subjects s on s.id = c.subject_id
    join public.curriculum_levels l on l.id = s.level_id
    join public.curriculums p on p.id = l.curriculum_id
    where p.code = 'GUITAR' and l.code = 'PRE' and s.code in ('METHODE_BOOK', 'REPERTOIRE') and i.status = 'ACTIVE'
      and i.code ~ '^L(0[1-9]|[1-4][0-9]|50)$' and i.sort_order between 1 and 50 and i.is_required
  ), 100, 'active codes and sort positions are the required L01-L50 lists')
  else skip('Guitar catalog is absent from this database')
end;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((
    select count(*)::int from guitar_pre_werner_items_before b
    where not exists (select 1 from public.curriculum_component_items i where i.id = b.id)
  ), 0, 'no historical Guitar Pre lesson row is deleted')
  else skip('Guitar catalog is absent from this database')
end;

select is(
  (select count(*)::int from public.student_component_item_progress),
  (select total from guitar_pre_werner_progress_before),
  'student lesson progress row count is unchanged'
);

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((
    select l.name from public.curriculum_levels l
    join public.curriculums p on p.id = l.curriculum_id
    where p.code = 'GUITAR' and l.code = 'GRADE_1'
  ), 'Grade 1', 'Guitar Grade 1 is unchanged')
  else skip('Guitar catalog is absent from this database')
end;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((
    select s.name from public.curriculum_subjects s
    join public.curriculum_levels l on l.id = s.level_id
    join public.curriculums p on p.id = l.curriculum_id
    where p.code = 'GUITAR' and l.code = 'PRE' and s.code = 'TECHNIQUE_FOUNDATION'
  ), 'Technique Foundation Pre', 'Technique Foundation is unchanged')
  else skip('Guitar catalog is absent from this database')
end;

select case
  when exists (select 1 from public.curriculums where code = 'GUITAR')
  then is((select report->>'retired' from guitar_pre_werner_report), '0', 'placeholder lessons are renamed rather than retired')
  else skip('Guitar catalog is absent from this database')
end;

select * from finish();
rollback;
