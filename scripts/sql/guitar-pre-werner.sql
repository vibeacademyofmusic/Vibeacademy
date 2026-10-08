-- Guitar Pre Grade only. Renames the existing method and repertoire subjects
-- and fills their Core lesson lists from the Werner operator map.
-- A database without GUITAR is left unchanged.

create or replace function public.apply_guitar_pre_werner_v1()
returns jsonb
language plpgsql
as $function$
declare
  plan jsonb := $plan$__PLAN_JSON__$plan$::jsonb;
  program uuid;
  v_level uuid;
  method_id uuid;
  repertoire_id uuid;
  method_component uuid;
  repertoire_component uuid;
  outside_before text;
  grades_before text;
  siblings_before text;
  identity_before text;
  progress_before jsonb;
  progress_count integer;
  v_repertoire_sort integer;
  lesson jsonb;
  v_item uuid;
  v_item_name text;
  renamed integer := 0;
  created integer := 0;
  kept integer := 0;
  active_count integer;
  code_count integer;
begin
  select id into program from public.curriculums where code = 'GUITAR';
  if program is null then
    return jsonb_build_object('applied', false, 'reason', 'GUITAR_NOT_PRESENT');
  end if;

  select id into v_level
  from public.curriculum_levels
  where curriculum_id = program and code = 'PRE';
  if v_level is null then
    raise exception 'GUITAR_PRE_LEVEL_MISSING';
  end if;
  if (select name from public.curriculum_levels where id = v_level) not in (plan->>'previous_level_name', plan->>'level_name') then
    raise exception 'GUITAR_PRE_LEVEL_NAME_CONFLICT';
  end if;

  select id into method_id
  from public.curriculum_subjects
  where level_id = v_level and code = plan->>'volume1_subject_code';
  select id into repertoire_id
  from public.curriculum_subjects
  where level_id = v_level and code = plan->>'volume2_subject_code';
  if method_id is null or repertoire_id is null then
    raise exception 'GUITAR_PRE_SUBJECTS_MISSING';
  end if;
  if (select name from public.curriculum_subjects where id = method_id) not in (plan->>'volume1_previous_name', plan->>'volume1_name') then
    raise exception 'GUITAR_METHOD_NAME_CONFLICT';
  end if;
  if not exists (
    select 1
    from public.curriculum_subjects
    where id = repertoire_id
      and name in (
        select jsonb_array_elements_text(plan->'volume2_previous_names')
        union all
        select plan->>'volume2_name'
      )
  ) then
    raise exception 'GUITAR_REPERTOIRE_NAME_CONFLICT';
  end if;

  if (select count(*) from public.curriculum_subject_components where subject_id = method_id) > 1 then
    raise exception 'GUITAR_METHOD_MULTIPLE_COMPONENTS';
  end if;
  if (select count(*) from public.curriculum_subject_components where subject_id = repertoire_id) <> 1 then
    raise exception 'GUITAR_REPERTOIRE_COMPONENT_CONFLICT';
  end if;

  select id into method_component
  from public.curriculum_subject_components
  where subject_id = method_id;
  select id into repertoire_component
  from public.curriculum_subject_components
  where subject_id = repertoire_id and code = 'CORE';
  if repertoire_component is null then
    raise exception 'GUITAR_REPERTOIRE_COMPONENT_CONFLICT';
  end if;
  if method_component is not null and (select code from public.curriculum_subject_components where id = method_component) <> 'CORE' then
    raise exception 'GUITAR_METHOD_COMPONENT_CONFLICT';
  end if;

  select md5(coalesce(string_agg(line, '|' order by line), '')) into outside_before
  from (
    select concat_ws(':', p.code, l.code, l.name, s.code, s.name, s.status, c.code, i.code, i.name, i.status, i.sort_order::text) as line
    from public.curriculums p
    join public.curriculum_levels l on l.curriculum_id = p.id
    left join public.curriculum_subjects s on s.level_id = l.id
    left join public.curriculum_subject_components c on c.subject_id = s.id
    left join public.curriculum_component_items i on i.component_id = c.id
    where p.code <> 'GUITAR'
  ) rows;
  select md5(coalesce(string_agg(line, '|' order by line), '')) into grades_before
  from (
    select concat_ws(':', l.code, l.name, s.code, s.name, s.status, c.code, i.id::text, i.code, i.name, i.status, i.sort_order::text) as line
    from public.curriculum_levels l
    left join public.curriculum_subjects s on s.level_id = l.id
    left join public.curriculum_subject_components c on c.subject_id = s.id
    left join public.curriculum_component_items i on i.component_id = c.id
    where l.curriculum_id = program and l.code <> 'PRE'
  ) rows;
  select md5(coalesce(string_agg(line, '|' order by line), '')) into siblings_before
  from (
    select concat_ws(':', s.code, s.name, s.status, s.is_required::text, c.code, i.id::text, i.code, i.name, i.status, i.sort_order::text) as line
    from public.curriculum_subjects s
    left join public.curriculum_subject_components c on c.subject_id = s.id
    left join public.curriculum_component_items i on i.component_id = c.id
    where s.level_id = v_level and s.id not in (method_id, repertoire_id)
  ) rows;
  select md5(coalesce(string_agg(line, '|' order by line), '')) into identity_before
  from (
    select concat_ws(':', code, family_code, is_required::text, completion_rule, coalesce(subject_level::text, '')) as line
    from public.curriculum_subjects
    where id in (method_id, repertoire_id)
  ) rows;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'item_id', p.item_id, 'status', p.status) order by p.id), '[]'::jsonb)
    into progress_before
  from public.student_component_item_progress p
  where p.item_id in (
    select i.id
    from public.curriculum_component_items i
    where i.component_id in (repertoire_component, method_component)
  );
  select count(*) into progress_count from public.student_component_item_progress;
  select sort_order into v_repertoire_sort from public.curriculum_subjects where id = repertoire_id;

  update public.curriculum_levels
  set name = plan->>'level_name'
  where id = v_level and name is distinct from plan->>'level_name';

  update public.curriculum_subjects
  set name = plan->>'volume1_name',
      status = 'ACTIVE',
      sort_order = 0
  where id = method_id;

  update public.curriculum_subjects
  set name = plan->>'volume2_name'
  where id = repertoire_id;

  if method_component is null then
    insert into public.curriculum_subject_components (
      subject_id, code, name, is_required, sort_order, completion_rule, status
    ) values (
      method_id, 'CORE', 'Core', true, 1, 'ALL_REQUIRED_ITEMS', 'ACTIVE'
    )
    returning id into method_component;
  end if;

  for lesson in select value from jsonb_array_elements(plan->'volume2')
  loop
    v_item := null;
    v_item_name := null;
    select i.id, i.name into v_item, v_item_name
    from public.curriculum_component_items i
    where i.component_id = repertoire_component and i.code = lesson->>'code';
    if not found then
      insert into public.curriculum_component_items (
        component_id, code, name, sort_order, is_required, status
      ) values (
        repertoire_component, lesson->>'code', lesson->>'title', (lesson->>'number')::int, true, 'ACTIVE'
      );
      created := created + 1;
    elsif v_item_name = lesson->>'title' then
      update public.curriculum_component_items
      set sort_order = (lesson->>'number')::int,
          is_required = true,
          status = 'ACTIVE'
      where id = v_item;
      kept := kept + 1;
    elsif v_item_name ~ '^Lesson [0-9]{2}$' then
      update public.curriculum_component_items
      set name = lesson->>'title',
          sort_order = (lesson->>'number')::int,
          is_required = true,
          status = 'ACTIVE'
      where id = v_item;
      renamed := renamed + 1;
    else
      raise exception 'GUITAR_EXISTING_LESSON_CONFLICT';
    end if;
  end loop;

  for lesson in select value from jsonb_array_elements(plan->'volume1')
  loop
    v_item := null;
    v_item_name := null;
    select i.id, i.name into v_item, v_item_name
    from public.curriculum_component_items i
    where i.component_id = method_component and i.code = lesson->>'code';
    if not found then
      insert into public.curriculum_component_items (
        component_id, code, name, sort_order, is_required, status
      ) values (
        method_component, lesson->>'code', lesson->>'title', (lesson->>'number')::int, true, 'ACTIVE'
      );
      created := created + 1;
    elsif v_item_name = lesson->>'title' then
      update public.curriculum_component_items
      set sort_order = (lesson->>'number')::int,
          is_required = true,
          status = 'ACTIVE'
      where id = v_item;
      kept := kept + 1;
    elsif v_item_name ~ '^Lesson [0-9]{2}$' then
      update public.curriculum_component_items
      set name = lesson->>'title',
          sort_order = (lesson->>'number')::int,
          is_required = true,
          status = 'ACTIVE'
      where id = v_item;
      renamed := renamed + 1;
    else
      raise exception 'GUITAR_EXISTING_LESSON_CONFLICT';
    end if;
  end loop;

  select count(*) into active_count
  from public.curriculum_component_items
  where component_id = method_component and status = 'ACTIVE';
  if active_count <> 50 then
    raise exception 'GUITAR_VOLUME1_ACTIVE_COUNT';
  end if;
  select count(*) into active_count
  from public.curriculum_component_items
  where component_id = repertoire_component and status = 'ACTIVE';
  if active_count <> 50 then
    raise exception 'GUITAR_VOLUME2_ACTIVE_COUNT';
  end if;
  if exists (
    select 1 from public.curriculum_component_items
    where component_id in (method_component, repertoire_component)
      and status = 'ACTIVE'
      and (is_required is distinct from true or code !~ '^L[0-9]{2}$' or sort_order not between 1 and 50)
  ) then
    raise exception 'GUITAR_LESSON_SHAPE';
  end if;
  select count(distinct code) into code_count
  from public.curriculum_component_items
  where component_id = method_component and status = 'ACTIVE';
  if code_count <> 50 then
    raise exception 'GUITAR_VOLUME1_CODE_COLLISION';
  end if;
  select count(distinct code) into code_count
  from public.curriculum_component_items
  where component_id = repertoire_component and status = 'ACTIVE';
  if code_count <> 50 then
    raise exception 'GUITAR_VOLUME2_CODE_COLLISION';
  end if;
  if exists (
    select 1
    from public.curriculum_component_items
    where component_id in (method_component, repertoire_component) and status = 'ACTIVE'
    group by component_id, sort_order
    having count(*) <> 1
  ) then
    raise exception 'GUITAR_DUPLICATE_SORT';
  end if;
  if exists (
    select 1
    from public.curriculum_component_items
    where component_id in (method_component, repertoire_component)
      and id not in (
        select i.id
        from public.curriculum_component_items i
        where i.status = 'ACTIVE' and i.sort_order between 1 and 50
      )
  ) then
    raise exception 'GUITAR_UNEXPECTED_EXTRA_LESSON';
  end if;

  if progress_before is distinct from (
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'item_id', p.item_id, 'status', p.status) order by p.id), '[]'::jsonb)
    from public.student_component_item_progress p
    where p.item_id in (
      select i.id from public.curriculum_component_items i
      where i.component_id in (method_component, repertoire_component)
    )
  ) or (select count(*) from public.student_component_item_progress) <> progress_count then
    raise exception 'GUITAR_PROGRESS_CHANGED';
  end if;
  if outside_before is distinct from (
    select md5(coalesce(string_agg(line, '|' order by line), ''))
    from (
      select concat_ws(':', p.code, l.code, l.name, s.code, s.name, s.status, c.code, i.code, i.name, i.status, i.sort_order::text) as line
      from public.curriculums p
      join public.curriculum_levels l on l.curriculum_id = p.id
      left join public.curriculum_subjects s on s.level_id = l.id
      left join public.curriculum_subject_components c on c.subject_id = s.id
      left join public.curriculum_component_items i on i.component_id = c.id
      where p.code <> 'GUITAR'
    ) rows
  ) or grades_before is distinct from (
    select md5(coalesce(string_agg(line, '|' order by line), ''))
    from (
      select concat_ws(':', l.code, l.name, s.code, s.name, s.status, c.code, i.id::text, i.code, i.name, i.status, i.sort_order::text) as line
      from public.curriculum_levels l
      left join public.curriculum_subjects s on s.level_id = l.id
      left join public.curriculum_subject_components c on c.subject_id = s.id
      left join public.curriculum_component_items i on i.component_id = c.id
      where l.curriculum_id = program and l.code <> 'PRE'
    ) rows
  ) or siblings_before is distinct from (
    select md5(coalesce(string_agg(line, '|' order by line), ''))
    from (
      select concat_ws(':', s.code, s.name, s.status, s.is_required::text, c.code, i.id::text, i.code, i.name, i.status, i.sort_order::text) as line
      from public.curriculum_subjects s
      left join public.curriculum_subject_components c on c.subject_id = s.id
      left join public.curriculum_component_items i on i.component_id = c.id
      where s.level_id = v_level and s.id not in (method_id, repertoire_id)
    ) rows
  ) or identity_before is distinct from (
    select md5(coalesce(string_agg(line, '|' order by line), ''))
    from (
      select concat_ws(':', code, family_code, is_required::text, completion_rule, coalesce(subject_level::text, '')) as line
      from public.curriculum_subjects
      where id in (method_id, repertoire_id)
    ) rows
  ) or (select sort_order from public.curriculum_subjects where id = repertoire_id) is distinct from v_repertoire_sort then
    raise exception 'GUITAR_UNRELATED_CONTENT_CHANGED';
  end if;

  return jsonb_build_object(
    'applied', true,
    'renamed', renamed,
    'created', created,
    'kept', kept,
    'retired', 0,
    'volume1_active', 50,
    'volume2_active', 50
  );
end;
$function$;

revoke all on function public.apply_guitar_pre_werner_v1() from public, anon, authenticated, service_role;
select public.apply_guitar_pre_werner_v1();
