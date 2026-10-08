-- Piano Pre Grade only. Renames the existing Methode Book subject in place.
-- Does not copy score content. Does not complete a grade or open the next grade.
set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_advisory_xact_lock(hashtextextended('vibe:piano-pre-pa1:20261005', 0));

do $pa1$
declare
  plan jsonb := (select payload from pa1_plan);
  program uuid;
  level uuid;
  subject uuid;
  draft uuid;
  unit jsonb;
  lesson jsonb;
  component uuid;
  item uuid;
  before_subject public.curriculum_subjects%rowtype;
  before_level_name text;
  before_level_rule text;
  before_level_status text;
  before_level_sequence integer;
  others_before jsonb;
  others_after jsonb;
  pre_step_before jsonb;
  pre_step_after jsonb;
  levels_before jsonb;
  levels_after jsonb;
  lesson_count integer;
  added_progress integer := 0;
  column_ready boolean;
  draft_history boolean;
begin
  if plan is null or jsonb_array_length(plan->'lessons') <> 50 or jsonb_array_length(plan->'units') <> 11 then
    raise exception 'Piano Adventures plan must contain 11 units and 50 lessons';
  end if;

  select id into program from public.curriculums where code = 'PIANO';
  if program is null then
    create temp table if not exists pa1_report(payload jsonb) on commit drop;
    delete from pa1_report;
    insert into pa1_report values (jsonb_build_object('skipped', true, 'reason', 'PIANO catalog is not present'));
    return;
  end if;

  select id, name, completion_rule, status, sequence_no
    into level, before_level_name, before_level_rule, before_level_status, before_level_sequence
  from public.curriculum_levels
  where curriculum_id = program and code = 'PRE';
  if level is null then
    raise exception 'PIANO exists but Pre level (code PRE) was not found';
  end if;
  if before_level_name not in ('Pre', 'Pre Grade') then
    raise exception 'Refusing to relabel Piano level PRE from %', before_level_name;
  end if;

  select * into before_subject
  from public.curriculum_subjects
  where level_id = level
    and code = 'METHODE_BOOK'
    and name in ('Methode Book', plan->>'subject_name');
  if not found then
    raise exception 'Piano Pre Methode Book subject was not found; refusing to create a second subject';
  end if;
  if (select count(*) from public.curriculum_subjects
      where level_id = level and code = 'METHODE_BOOK') <> 1 then
    raise exception 'Ambiguous Piano Pre METHODE_BOOK subject';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) into others_before
  from public.curriculum_subjects s
  where s.level_id = level and s.id <> before_subject.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'subject', to_jsonb(s),
    'components', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.curriculum_subject_components c where c.subject_id = s.id), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.curriculum_component_items i join public.curriculum_subject_components c on c.id = i.component_id where c.subject_id = s.id), '[]'::jsonb)
  ) order by s.id), '[]'::jsonb) into pre_step_before
  from public.curriculum_subjects s
  join public.curriculum_levels l on l.id = s.level_id
  where l.curriculum_id = program and l.code = 'PRE_STEP';

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'student_level_progress' and column_name = 'level_id'
  ) into column_ready;
  if column_ready then
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status) order by id), '[]'::jsonb)
      into levels_before
    from public.student_level_progress;
  end if;

  select id into draft
  from public.curriculum_subject_components
  where subject_id = before_subject.id and code = 'LESSON_DRAFTS';
  if draft is not null then
    if exists (
      select 1 from public.student_component_item_progress ip
      join public.curriculum_component_items i on i.id = ip.item_id
      where i.component_id = draft
    ) then
      raise exception 'Piano Pre draft lessons have student history';
    end if;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'student_component_progress' and column_name = 'component_id'
    ) then
      execute 'select exists (select 1 from public.student_component_progress where component_id = $1)'
        into draft_history using draft;
      if draft_history then
        raise exception 'Piano Pre draft component has student history';
      end if;
    end if;
    if to_regclass('public.academic_video_links') is not null then
      execute 'select exists (select 1 from public.academic_video_links v join public.curriculum_component_items i on i.id = v.item_id where i.component_id = $1)'
        into draft_history using draft;
      if draft_history then
        raise exception 'Piano Pre draft lessons are referenced by video links';
      end if;
    end if;
  end if;

  if before_level_name is distinct from plan->>'level_name' then
    update public.curriculum_levels set name = plan->>'level_name' where id = level;
  end if;

  if before_subject.name is distinct from plan->>'subject_name' or before_subject.status is distinct from 'ACTIVE' then
    update public.curriculum_subjects
      set name = plan->>'subject_name', status = 'ACTIVE'
      where id = before_subject.id;
  end if;

  if draft is not null then
    delete from public.curriculum_component_items where component_id = draft;
    delete from public.curriculum_subject_components where id = draft;
  end if;

  for unit in select value from jsonb_array_elements(plan->'units') loop
    select id into component
    from public.curriculum_subject_components
    where subject_id = before_subject.id and code = unit->>'code';
    if component is null then
      insert into public.curriculum_subject_components
        (subject_id, code, name, is_required, sort_order, completion_rule, status)
      values
        (before_subject.id, unit->>'code', unit->>'name', true, (unit->>'sort_order')::integer, 'ALL_REQUIRED_ITEMS', 'ACTIVE')
      returning id into component;
    else
      update public.curriculum_subject_components
        set name = unit->>'name',
            is_required = true,
            sort_order = (unit->>'sort_order')::integer,
            completion_rule = 'ALL_REQUIRED_ITEMS',
            status = 'ACTIVE'
        where id = component
          and (name, is_required, sort_order, completion_rule, status)
              is distinct from
              (unit->>'name', true, (unit->>'sort_order')::integer, 'ALL_REQUIRED_ITEMS', 'ACTIVE');
    end if;
  end loop;

  for lesson in select value from jsonb_array_elements(plan->'lessons') loop
    select id into component
    from public.curriculum_subject_components
    where subject_id = before_subject.id and code = lesson->>'unit';
    if component is null then
      raise exception 'Missing unit %', lesson->>'unit';
    end if;
    select id into item
    from public.curriculum_component_items
    where component_id = component and code = lesson->>'lesson_code';
    if item is null then
      insert into public.curriculum_component_items
        (component_id, code, name, sort_order, is_required, status)
      values
        (component, lesson->>'lesson_code', lesson->>'title', (lesson->>'sort_order')::integer, true, 'ACTIVE')
      returning id into item;
    else
      update public.curriculum_component_items
        set name = lesson->>'title',
            sort_order = (lesson->>'sort_order')::integer,
            is_required = true,
            status = 'ACTIVE'
        where id = item
          and (name, sort_order, is_required, status)
              is distinct from
              (lesson->>'title', (lesson->>'sort_order')::integer, true, 'ACTIVE');
    end if;

    insert into public.curriculum_lesson_guides (
      item_id, source_book, source_edition, source_authors, source_pages, piece_reference,
      learning_objectives, core_concepts, teacher_demonstration, guided_practice,
      independent_practice, review, checkpoint, homework
    ) values (
      item, lesson->>'source_book', lesson->>'source_edition', lesson->>'source_authors',
      lesson->>'source_pages', lesson->>'piece_reference', lesson->>'learning_objectives',
      lesson->>'core_concepts', lesson->>'teacher_demonstration', lesson->>'guided_practice',
      lesson->>'independent_practice', lesson->>'review', lesson->>'checkpoint', lesson->>'homework'
    )
    on conflict (item_id) do update set
      source_book = excluded.source_book,
      source_edition = excluded.source_edition,
      source_authors = excluded.source_authors,
      source_pages = excluded.source_pages,
      piece_reference = excluded.piece_reference,
      learning_objectives = excluded.learning_objectives,
      core_concepts = excluded.core_concepts,
      teacher_demonstration = excluded.teacher_demonstration,
      guided_practice = excluded.guided_practice,
      independent_practice = excluded.independent_practice,
      review = excluded.review,
      checkpoint = excluded.checkpoint,
      homework = excluded.homework,
      updated_at = now()
    where public.curriculum_lesson_guides.source_pages is distinct from excluded.source_pages
       or public.curriculum_lesson_guides.learning_objectives is distinct from excluded.learning_objectives
       or public.curriculum_lesson_guides.checkpoint is distinct from excluded.checkpoint
       or public.curriculum_lesson_guides.homework is distinct from excluded.homework
       or public.curriculum_lesson_guides.teacher_demonstration is distinct from excluded.teacher_demonstration
       or public.curriculum_lesson_guides.guided_practice is distinct from excluded.guided_practice
       or public.curriculum_lesson_guides.independent_practice is distinct from excluded.independent_practice
       or public.curriculum_lesson_guides.review is distinct from excluded.review
       or public.curriculum_lesson_guides.core_concepts is distinct from excluded.core_concepts
       or public.curriculum_lesson_guides.piece_reference is distinct from excluded.piece_reference
       or public.curriculum_lesson_guides.source_book is distinct from excluded.source_book
       or public.curriculum_lesson_guides.source_edition is distinct from excluded.source_edition
       or public.curriculum_lesson_guides.source_authors is distinct from excluded.source_authors;
  end loop;

  select count(*) into lesson_count
  from public.curriculum_component_items i
  join public.curriculum_subject_components c on c.id = i.component_id
  where c.subject_id = before_subject.id and i.status = 'ACTIVE';
  if lesson_count <> 50 then
    raise exception 'Piano Pre Grade active lesson count is %, expected 50', lesson_count;
  end if;
  if exists (
    select 1 from public.curriculum_component_items i
    join public.curriculum_subject_components c on c.id = i.component_id
    where c.subject_id = before_subject.id
    group by i.code
    having count(*) > 1
  ) then
    raise exception 'Duplicate lesson code inside Piano Pre Grade';
  end if;

  -- Open the new subject for students already inside this level, as NOT_STARTED only.
  -- Existing progress rows and level statuses are checked after the inserts.
  if column_ready then
    insert into public.student_subject_progress (level_progress_id, subject_id, status)
    select lp.id, before_subject.id, 'NOT_STARTED'
    from public.student_level_progress lp
    where lp.level_id = level
    on conflict (level_progress_id, subject_id) do nothing;
    get diagnostics added_progress = row_count;

    insert into public.student_component_progress (subject_progress_id, component_id, status)
    select sp.id, c.id, 'NOT_STARTED'
    from public.student_subject_progress sp
    join public.curriculum_subject_components c on c.subject_id = sp.subject_id
    where sp.subject_id = before_subject.id
      and c.status = 'ACTIVE'
    on conflict (subject_progress_id, component_id) do nothing;

    insert into public.student_component_item_progress (component_progress_id, item_id, status)
    select cp.id, i.id, 'NOT_STARTED'
    from public.student_component_progress cp
    join public.curriculum_component_items i on i.component_id = cp.component_id
    join public.curriculum_subject_components c on c.id = cp.component_id
    where c.subject_id = before_subject.id
      and i.status = 'ACTIVE'
    on conflict (component_progress_id, item_id) do nothing;

    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status) order by id), '[]'::jsonb)
      into levels_after
    from public.student_level_progress;
    if levels_after is distinct from levels_before then
      raise exception 'Academic level status changed while authoring Piano Adventures';
    end if;
  end if;

  if (select name from public.curriculum_levels where id = level) is distinct from plan->>'level_name'
     or (select completion_rule from public.curriculum_levels where id = level) is distinct from before_level_rule
     or (select status from public.curriculum_levels where id = level) is distinct from before_level_status
     or (select sequence_no from public.curriculum_levels where id = level) is distinct from before_level_sequence
     or (select code from public.curriculum_levels where id = level) is distinct from 'PRE' then
    raise exception 'Piano Pre level identity changed beyond the display name';
  end if;

  if exists (
    select 1 from public.curriculum_subjects
    where id = before_subject.id
      and (code is distinct from before_subject.code
        or family_code is distinct from before_subject.family_code
        or is_required is distinct from before_subject.is_required
        or completion_rule is distinct from before_subject.completion_rule
        or sort_order is distinct from before_subject.sort_order
        or level_id is distinct from before_subject.level_id
        or name is distinct from plan->>'subject_name'
        or status is distinct from 'ACTIVE')
  ) then
    raise exception 'Piano Pre subject identity changed beyond the approved rename';
  end if;
  if before_subject.is_required then
    raise exception 'Piano Pre Methode Book is required; subject completion could participate in grade completion';
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) into others_after
  from public.curriculum_subjects s
  where s.level_id = level and s.id <> before_subject.id;
  if others_after is distinct from others_before then
    raise exception 'Another Piano Pre subject was changed';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'subject', to_jsonb(s),
    'components', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.curriculum_subject_components c where c.subject_id = s.id), '[]'::jsonb),
    'lessons', coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.curriculum_component_items i join public.curriculum_subject_components c on c.id = i.component_id where c.subject_id = s.id), '[]'::jsonb)
  ) order by s.id), '[]'::jsonb) into pre_step_after
  from public.curriculum_subjects s
  join public.curriculum_levels l on l.id = s.level_id
  where l.curriculum_id = program and l.code = 'PRE_STEP';
  if pre_step_after is distinct from pre_step_before then
    raise exception 'Piano Pre Step was changed';
  end if;

  create temp table if not exists pa1_report(payload jsonb) on commit drop;
  delete from pa1_report;
  insert into pa1_report values (jsonb_build_object(
    'skipped', false,
    'subject_id', before_subject.id,
    'level_id', level,
    'program_id', program,
    'old_subject_name', before_subject.name,
    'new_subject_name', plan->>'subject_name',
    'level_name', plan->>'level_name',
    'subject_is_required', false,
    'level_completion_rule', before_level_rule,
    'promotion', 'subject completion does not complete the level while this subject stays optional',
    'active_lessons', lesson_count,
    'progress_subjects_added', added_progress,
    'level_status_unchanged', true
  ));
end
$pa1$;

select payload as report from pa1_report;
