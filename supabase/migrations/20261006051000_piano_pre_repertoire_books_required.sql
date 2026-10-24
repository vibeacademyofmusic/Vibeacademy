-- Piano Pre Grade repertoire books are required and must appear on open academic records.
-- Students already inside this level receive NOT_STARTED subject and unit progress.
-- Completed grades stay historical. Lesson rows and other subjects are not rewritten.

do $req$
declare
  level uuid;
  before_levels jsonb;
  after_levels jsonb;
  before_others jsonb;
  after_others jsonb;
begin
  select l.id into level
  from public.curriculum_levels l
  join public.curriculums c on c.id = l.curriculum_id
  where c.code = 'PIANO' and l.code = 'PRE';
  if level is null then
    raise notice 'PIANO_PRE_ABSENT';
    return;
  end if;

  if (
    select count(*)
    from public.curriculum_subjects
    where level_id = level and code in ('REPERTOIRE_2A', 'REPERTOIRE_2B') and status = 'ACTIVE'
  ) <> 2 then
    raise exception 'PIANO_REPERTOIRE_BOOKS_MISSING';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status) order by id), '[]'::jsonb)
    into before_levels
  from public.student_level_progress;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb)
    into before_others
  from public.curriculum_subjects s
  where s.level_id = level and s.code not in ('REPERTOIRE_2A', 'REPERTOIRE_2B');

  update public.curriculum_subjects
  set is_required = true,
      completion_rule = 'ALL_REQUIRED_COMPONENTS'
  where level_id = level
    and code in ('REPERTOIRE_2A', 'REPERTOIRE_2B')
    and status = 'ACTIVE'
    and (
      is_required is distinct from true
      or completion_rule is distinct from 'ALL_REQUIRED_COMPONENTS'
    );

  update public.curriculum_subject_components c
  set is_required = true
  from public.curriculum_subjects s
  where c.subject_id = s.id
    and s.level_id = level
    and s.code in ('REPERTOIRE_2A', 'REPERTOIRE_2B')
    and c.status = 'ACTIVE'
    and c.is_required is distinct from true;

  insert into public.student_subject_progress (level_progress_id, subject_id, status)
  select lp.id, s.id, 'NOT_STARTED'
  from public.student_level_progress lp
  join public.curriculum_subjects s on s.level_id = lp.level_id
  where lp.level_id = level
    and lp.status = 'IN_PROGRESS'
    and s.code in ('REPERTOIRE_2A', 'REPERTOIRE_2B')
    and s.status = 'ACTIVE'
  on conflict (level_progress_id, subject_id) do nothing;

  insert into public.student_component_progress (subject_progress_id, component_id, status)
  select sp.id, c.id, 'NOT_STARTED'
  from public.student_subject_progress sp
  join public.curriculum_subjects s on s.id = sp.subject_id
  join public.curriculum_subject_components c on c.subject_id = s.id and c.status = 'ACTIVE'
  join public.student_level_progress lp on lp.id = sp.level_progress_id
  where s.level_id = level
    and s.code in ('REPERTOIRE_2A', 'REPERTOIRE_2B')
    and lp.status = 'IN_PROGRESS'
  on conflict (subject_progress_id, component_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status) order by id), '[]'::jsonb)
    into after_levels
  from public.student_level_progress;
  if after_levels is distinct from before_levels then
    raise exception 'PIANO_LEVEL_PROGRESS_CHANGED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb)
    into after_others
  from public.curriculum_subjects s
  where s.level_id = level and s.code not in ('REPERTOIRE_2A', 'REPERTOIRE_2B');
  if after_others is distinct from before_others then
    raise exception 'PIANO_OTHER_SUBJECT_CHANGED';
  end if;
end
$req$;
