create or replace function public.apply_violin_pre_step_fiddle_time_v1(p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $violin_apply$
declare
  v_curriculum uuid;
  v_level uuid;
  v_progress_before text;
  v_progress_after text;
  v_catalog_before text;
  v_catalog_after text;
  v_book jsonb;
  v_section jsonb;
  v_lesson jsonb;
  v_subject uuid;
  v_component uuid;
  v_item uuid;
  v_inserted integer := 0;
  v_preserved integer := 0;
  v_subjects jsonb := '[]'::jsonb;
  v_existing public.curriculum_lesson_syllabi%rowtype;
begin
  if p_plan->>'program_code' is distinct from 'VIOLIN'
     or p_plan->>'level_code' is distinct from 'PRE_STEP'
     or p_plan->>'level_name' is distinct from 'Pre Step'
     or p_plan->>'level_type' is distinct from 'FOUNDATION'
     or jsonb_array_length(p_plan->'books') is distinct from 2
  then
    raise exception 'VIOLIN_PRE_STEP_PLAN_SHAPE';
  end if;

  select id into v_curriculum from public.curriculums where code = 'VIOLIN';
  if v_curriculum is null then
    raise exception 'VIOLIN_PROGRAM_MISSING';
  end if;
  perform 1 from public.curriculums where id = v_curriculum for update;

  v_progress_before := (
    select md5(coalesce(string_agg(
      slp.id::text || '|' || slp.enrollment_id::text || '|' || slp.level_id::text || '|' || slp.status
      || '|' || coalesce(slp.started_at::text, '') || '|' || coalesce(slp.completed_at::text, ''),
      ',' order by slp.id), ''))
    from public.student_level_progress slp
  ) || '|' || (
    select md5(coalesce(string_agg(e.id::text || '|' || coalesce(e.current_level_id::text, '') || '|' || e.status, ',' order by e.id), ''))
    from public.student_curriculum_enrollments e
  );

  v_catalog_before := (
    select md5(coalesce(string_agg(
      c.code || '|' || l.id::text || '|' || l.code || '|' || l.name || '|' || l.sequence_no::text || '|' || l.level_type || '|' || l.status,
      ',' order by c.code, l.sequence_no, l.code), ''))
    from public.curriculum_levels l
    join public.curriculums c on c.id = l.curriculum_id
    where c.code <> 'VIOLIN' or l.code <> 'PRE_STEP'
  ) || '|' || (
    select md5(coalesce(string_agg(
      s.id::text || '|' || s.code || '|' || s.name || '|' || s.is_required::text || '|' || s.completion_rule || '|' || s.status,
      ',' order by s.id), ''))
    from public.curriculum_subjects s
    join public.curriculum_levels l on l.id = s.level_id
    where l.curriculum_id <> v_curriculum or l.code <> 'PRE_STEP'
  );

  select id into v_level
  from public.curriculum_levels
  where curriculum_id = v_curriculum and code = 'PRE_STEP';

  if v_level is null then
    if exists (
      select 1 from public.curriculum_levels
      where curriculum_id = v_curriculum and sequence_no = 0
    ) then
      raise exception 'VIOLIN_SEQUENCE_0_TAKEN';
    end if;
    insert into public.curriculum_levels (
      curriculum_id, code, name, sequence_no, level_number, level_type, completion_rule, status
    ) values (
      v_curriculum, 'PRE_STEP', 'Pre Step', 0, null, 'FOUNDATION', 'MANUAL', 'ACTIVE'
    ) returning id into v_level;
  else
    if exists (
      select 1 from public.curriculum_levels
      where id = v_level
        and (
          name is distinct from 'Pre Step'
          or sequence_no is distinct from 0
          or level_type is distinct from 'FOUNDATION'
          or level_number is not null
          or curriculum_id is distinct from v_curriculum
        )
    ) then
      raise exception 'VIOLIN_PRE_STEP_IDENTITY_CONFLICT';
    end if;
    update public.curriculum_levels
    set completion_rule = 'MANUAL', status = 'ACTIVE', updated_at = now()
    where id = v_level
      and (completion_rule is distinct from 'MANUAL' or status is distinct from 'ACTIVE');
  end if;

  for v_book in select value from jsonb_array_elements(p_plan->'books')
  loop
    if v_book->>'is_required' is distinct from 'true'
       or jsonb_array_length(v_book->'lessons') is distinct from 50
       or v_book->>'subject_code' not in ('FT_JOGGERS_B1', 'FT_RUNNERS_B2')
    then
      raise exception 'VIOLIN_PRE_STEP_BOOK_SHAPE';
    end if;

    select id into v_subject
    from public.curriculum_subjects
    where level_id = v_level and code = v_book->>'subject_code';

    if v_subject is null then
      insert into public.curriculum_subjects (
        level_id, family_code, code, name, is_required, completion_rule, sort_order, status
      ) values (
        v_level, 'METHODE_BOOK', v_book->>'subject_code', v_book->>'subject_name', true, 'MANUAL',
        (v_book->>'subject_order')::integer, 'ACTIVE'
      ) returning id into v_subject;
    else
      update public.curriculum_subjects
      set
        name = v_book->>'subject_name',
        is_required = true,
        completion_rule = 'MANUAL',
        family_code = 'METHODE_BOOK',
        sort_order = (v_book->>'subject_order')::integer,
        status = 'ACTIVE',
        updated_at = now()
      where id = v_subject
        and (
          name is distinct from v_book->>'subject_name'
          or is_required is distinct from true
          or completion_rule is distinct from 'MANUAL'
          or family_code is distinct from 'METHODE_BOOK'
          or sort_order is distinct from (v_book->>'subject_order')::integer
          or status is distinct from 'ACTIVE'
        );
    end if;

    v_subjects := v_subjects || jsonb_build_array(jsonb_build_object(
      'code', v_book->>'subject_code',
      'id', v_subject
    ));

    for v_section in select value from jsonb_array_elements(v_book->'sections')
    loop
      select id into v_component
      from public.curriculum_subject_components
      where subject_id = v_subject and code = v_section->>'key';
      if v_component is null then
        insert into public.curriculum_subject_components (
          subject_id, code, name, is_required, sort_order, status, completion_rule
        ) values (
          v_subject, v_section->>'key', v_section->>'title', false,
          (v_section->>'sort_order')::integer, 'ACTIVE', 'DIRECT_ASSESSMENT'
        ) returning id into v_component;
      end if;
    end loop;

    for v_lesson in select value from jsonb_array_elements(v_book->'lessons')
    loop
      select id into v_component
      from public.curriculum_subject_components
      where subject_id = v_subject and code = v_lesson->>'section_key';
      if v_component is null then
        raise exception 'VIOLIN_PRE_STEP_SECTION_MISSING';
      end if;

      select id into v_item
      from public.curriculum_component_items
      where component_id = v_component and code = v_lesson->>'stable_key';
      if v_item is null then
        insert into public.curriculum_component_items (
          component_id, code, name, sort_order, is_required, status
        ) values (
          v_component, v_lesson->>'stable_key', v_lesson->>'title',
          (v_lesson->>'sort_order')::integer, false, 'ACTIVE'
        ) returning id into v_item;
      end if;

      select * into v_existing
      from public.curriculum_lesson_syllabi
      where item_id = v_item;

      if v_existing.item_id is null then
        insert into public.curriculum_lesson_syllabi (
          item_id, source_book, source_authors, source_sha256, unit_title,
          source_pdf_pages, source_printed_pages, learning_objectives,
          classroom_activities, homework, teacher_notes, source_context, content_scope
        ) values (
          v_item, v_book->>'subject_name', v_book->>'authors', v_book->>'source_sha256',
          v_lesson->>'unit_title', v_lesson->>'source_pdf_pages', v_lesson->>'source_printed_pages',
          v_lesson->>'learning_objectives', v_lesson->>'classroom_activities', v_lesson->>'homework',
          v_lesson->>'teacher_notes', coalesce(v_lesson->>'source_context', ''), v_lesson->>'content_scope'
        );
        v_inserted := v_inserted + 1;
      elsif v_existing.source_sha256 is distinct from v_book->>'source_sha256' then
        raise exception 'VIOLIN_PRE_STEP_SOURCE_CONFLICT';
      elsif v_existing.learning_objectives is distinct from v_lesson->>'learning_objectives'
         or v_existing.classroom_activities is distinct from v_lesson->>'classroom_activities'
         or v_existing.homework is distinct from v_lesson->>'homework'
         or v_existing.teacher_notes is distinct from v_lesson->>'teacher_notes'
         or v_existing.content_scope is distinct from v_lesson->>'content_scope'
         or v_existing.source_pdf_pages is distinct from v_lesson->>'source_pdf_pages'
         or v_existing.source_printed_pages is distinct from v_lesson->>'source_printed_pages'
         or v_existing.unit_title is distinct from v_lesson->>'unit_title'
         or v_existing.source_book is distinct from v_book->>'subject_name'
      then
        v_preserved := v_preserved + 1;
      end if;
    end loop;
  end loop;

  if (
    select count(*)
    from public.curriculum_component_items i
    join public.curriculum_subject_components c on c.id = i.component_id
    join public.curriculum_subjects s on s.id = c.subject_id
    where s.level_id = v_level and s.code in ('FT_JOGGERS_B1', 'FT_RUNNERS_B2')
  ) is distinct from 100 then
    raise exception 'VIOLIN_PRE_STEP_LESSON_COUNT';
  end if;

  if exists (
    select 1
    from public.curriculum_subjects
    where level_id = v_level
      and code in ('FT_JOGGERS_B1', 'FT_RUNNERS_B2')
      and (is_required is distinct from true or completion_rule is distinct from 'MANUAL')
  ) then
    raise exception 'VIOLIN_PRE_STEP_REQUIRED_MEMBERSHIP';
  end if;

  v_progress_after := (
    select md5(coalesce(string_agg(
      slp.id::text || '|' || slp.enrollment_id::text || '|' || slp.level_id::text || '|' || slp.status
      || '|' || coalesce(slp.started_at::text, '') || '|' || coalesce(slp.completed_at::text, ''),
      ',' order by slp.id), ''))
    from public.student_level_progress slp
  ) || '|' || (
    select md5(coalesce(string_agg(e.id::text || '|' || coalesce(e.current_level_id::text, '') || '|' || e.status, ',' order by e.id), ''))
    from public.student_curriculum_enrollments e
  );
  if v_progress_before is distinct from v_progress_after then
    raise exception 'VIOLIN_PRE_STEP_PROGRESS_CHANGED';
  end if;

  v_catalog_after := (
    select md5(coalesce(string_agg(
      c.code || '|' || l.id::text || '|' || l.code || '|' || l.name || '|' || l.sequence_no::text || '|' || l.level_type || '|' || l.status,
      ',' order by c.code, l.sequence_no, l.code), ''))
    from public.curriculum_levels l
    join public.curriculums c on c.id = l.curriculum_id
    where c.code <> 'VIOLIN' or l.code <> 'PRE_STEP'
  ) || '|' || (
    select md5(coalesce(string_agg(
      s.id::text || '|' || s.code || '|' || s.name || '|' || s.is_required::text || '|' || s.completion_rule || '|' || s.status,
      ',' order by s.id), ''))
    from public.curriculum_subjects s
    join public.curriculum_levels l on l.id = s.level_id
    where l.curriculum_id <> v_curriculum or l.code <> 'PRE_STEP'
  );
  if v_catalog_before is distinct from v_catalog_after then
    raise exception 'VIOLIN_PRE_STEP_OTHER_CATALOG_CHANGED';
  end if;

  return jsonb_build_object(
    'curriculum_id', v_curriculum,
    'level_id', v_level,
    'subjects', v_subjects,
    'syllabi_inserted', v_inserted,
    'syllabi_preserved', v_preserved,
    'subject_count', (select count(*) from public.curriculum_subjects where level_id = v_level)
  );
end;
$violin_apply$;

revoke all on function public.apply_violin_pre_step_fiddle_time_v1(jsonb) from public, anon, authenticated, service_role;

do $violin_gate$
declare
  src text;
begin
  src := pg_get_functiondef('public.start_student_academic_level(uuid,uuid,date)'::regprocedure);
  if src like '%completion_rule is distinct from ''MANUAL''%' then
    return;
  end if;
  if position('and previous_level.sequence_no < v_level_sequence' in src) = 0 then
    raise exception 'VIOLIN_PRE_STEP_START_FUNCTION_SHAPE';
  end if;
  src := replace(
    src,
    'and previous_level.sequence_no < v_level_sequence',
    'and previous_level.sequence_no < v_level_sequence' || E'\n      and previous_level.completion_rule is distinct from ''MANUAL'''
  );
  execute src;
end;
$violin_gate$;
