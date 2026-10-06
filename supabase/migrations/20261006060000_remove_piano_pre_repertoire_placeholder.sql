-- Remove the retired Piano Pre Grade placeholder "Repertoire Pre".
-- It was replaced by Piano Adventures 2A and 2B.
-- Only NOT_STARTED placeholder progress is removed. Other programs stay untouched.

do $drop$
declare
  subject uuid;
  before_levels jsonb;
  after_levels jsonb;
  before_others jsonb;
  after_others jsonb;
begin
  select s.id into subject
  from public.curriculum_subjects s
  join public.curriculum_levels l on l.id = s.level_id
  join public.curriculums c on c.id = l.curriculum_id
  where c.code = 'PIANO'
    and l.code = 'PRE'
    and s.code = 'REPERTOIRE'
    and s.name = 'Repertoire Pre'
    and s.status = 'INACTIVE';

  if subject is null then
    raise notice 'PIANO_PRE_REPERTOIRE_PLACEHOLDER_ABSENT';
    return;
  end if;

  if exists (
    select 1
    from public.student_subject_progress
    where subject_id = subject and status is distinct from 'NOT_STARTED'
  ) or exists (
    select 1
    from public.student_component_progress cp
    join public.curriculum_subject_components c on c.id = cp.component_id
    where c.subject_id = subject and cp.status is distinct from 'NOT_STARTED'
  ) or exists (
    select 1
    from public.student_component_item_progress ip
    join public.curriculum_component_items i on i.id = ip.item_id
    join public.curriculum_subject_components c on c.id = i.component_id
    where c.subject_id = subject and ip.status is distinct from 'NOT_STARTED'
  ) then
    raise exception 'PIANO_REPERTOIRE_PROGRESS_NOT_PLACEHOLDER';
  end if;

  if exists (
    select 1
    from public.curriculum_component_items i
    join public.curriculum_subject_components c on c.id = i.component_id
    where c.subject_id = subject and i.name !~ '^Lesson [0-9]{2}$'
  ) then
    raise exception 'PIANO_REPERTOIRE_CONTENT_NOT_PLACEHOLDER';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status) order by id), '[]'::jsonb)
    into before_levels
  from public.student_level_progress;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb)
    into before_others
  from public.curriculum_subjects s
  where s.id <> subject;

  delete from public.student_component_item_progress ip
  using public.curriculum_component_items i
  join public.curriculum_subject_components c on c.id = i.component_id
  where ip.item_id = i.id and c.subject_id = subject;

  delete from public.student_component_progress cp
  using public.curriculum_subject_components c
  where cp.component_id = c.id and c.subject_id = subject;

  delete from public.student_subject_progress where subject_id = subject;

  delete from public.academic_video_links v
  using public.curriculum_component_items i
  join public.curriculum_subject_components c on c.id = i.component_id
  where v.item_id = i.id and c.subject_id = subject;

  delete from public.curriculum_lesson_syllabi g
  using public.curriculum_component_items i
  join public.curriculum_subject_components c on c.id = i.component_id
  where g.item_id = i.id and c.subject_id = subject;

  perform set_config('registration.write', 'on', true);
  update public.student_placement_cases set subject_id = null where subject_id = subject;
  update public.registration_applications set subject_id = null where subject_id = subject;

  delete from public.curriculum_subjects where id = subject;

  if exists (
    select 1 from public.curriculum_subjects
    where code = 'REPERTOIRE' and name = 'Repertoire Pre' and id = subject
  ) then
    raise exception 'PIANO_REPERTOIRE_STILL_PRESENT';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status) order by id), '[]'::jsonb)
    into after_levels
  from public.student_level_progress;
  if after_levels is distinct from before_levels then
    raise exception 'PIANO_LEVEL_PROGRESS_CHANGED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb)
    into after_others
  from public.curriculum_subjects s;
  if after_others is distinct from before_others then
    raise exception 'UNRELATED_SUBJECT_CHANGED';
  end if;
end
$drop$;
