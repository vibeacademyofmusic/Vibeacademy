-- The empty Guitar Diploma is retained, but it is not an active course.
-- A locked progress row may still reference the level, so the row is archived rather than deleted.
update public.curriculum_levels as level
set status = 'INACTIVE'
from public.curriculums as curriculum
where curriculum.id = level.curriculum_id
  and curriculum.code = 'GUITAR'
  and level.code = 'DIPLOMA'
  and level.status = 'ACTIVE'
  and not exists (
    select 1
    from public.curriculum_subjects as subject
    where subject.level_id = level.id
      and subject.status = 'ACTIVE'
  );
