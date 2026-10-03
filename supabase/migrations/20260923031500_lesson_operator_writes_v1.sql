-- Operator lesson writes. Progress, completion, and component rules stay unchanged.
-- Authenticated clients keep select-only access. These functions are the write path.

create function public.lesson_operator_component(
  p_curriculum_id uuid,
  p_level_id uuid,
  p_subject_id uuid,
  p_component_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.curriculum_subject_components component
    join public.curriculum_subjects subject on subject.id = component.subject_id
    join public.curriculum_levels level on level.id = subject.level_id
    where component.id = p_component_id
      and subject.id = p_subject_id
      and level.id = p_level_id
      and level.curriculum_id = p_curriculum_id
  ) then
    raise exception 'Invalid academic structure' using errcode = 'P0001';
  end if;

  perform 1
  from public.curriculum_subject_components
  where id = p_component_id
  for update;

  return p_component_id;
end;
$$;

create function public.normalize_lesson_order(p_component_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  with ordered as (
    select id, row_number() over (order by sort_order, id) as next_order
    from public.curriculum_component_items
    where component_id = p_component_id
  )
  update public.curriculum_component_items item
  set sort_order = ordered.next_order,
      updated_at = now()
  from ordered
  where item.id = ordered.id
    and item.sort_order is distinct from ordered.next_order;
end;
$$;

create function public.assert_required_active_lessons(
  p_component_id uuid,
  p_lesson_id uuid,
  p_status text,
  p_is_required boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule text;
  v_keeps_gate boolean;
begin
  select completion_rule into v_rule
  from public.curriculum_subject_components
  where id = p_component_id;

  if v_rule is distinct from 'ALL_REQUIRED_ITEMS' then
    return;
  end if;

  v_keeps_gate := p_status = 'ACTIVE' and p_is_required;
  if v_keeps_gate then
    return;
  end if;

  if not exists (
    select 1
    from public.curriculum_component_items item
    where item.component_id = p_component_id
      and item.id is distinct from p_lesson_id
      and item.status = 'ACTIVE'
      and item.is_required
  ) then
    raise exception 'Nhóm đánh giá hoàn thành từ Lesson bắt buộc cần ít nhất một Lesson bắt buộc đang hoạt động.'
      using errcode = 'P0001';
  end if;
end;
$$;

create function public.create_curriculum_lesson(
  p_curriculum_id uuid,
  p_level_id uuid,
  p_subject_id uuid,
  p_component_id uuid,
  p_code text,
  p_name text,
  p_is_required boolean,
  p_sort_order integer,
  p_status text
) returns public.curriculum_component_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_component uuid;
  v_code text;
  v_name text;
  v_order integer;
  v_row public.curriculum_component_items;
begin
  v_component := public.lesson_operator_component(p_curriculum_id, p_level_id, p_subject_id, p_component_id);
  v_code := upper(trim(coalesce(p_code, '')));
  v_name := trim(coalesce(p_name, ''));

  if v_code !~ '^[A-Z0-9_-]{2,50}$' then
    raise exception 'Invalid lesson code' using errcode = 'P0001';
  end if;
  if v_name = '' or char_length(v_name) > 200 then
    raise exception 'Lesson name is required' using errcode = 'P0001';
  end if;
  if p_status is distinct from 'ACTIVE' and p_status is distinct from 'INACTIVE' then
    raise exception 'Invalid lesson status' using errcode = 'P0001';
  end if;
  if p_sort_order is null or p_sort_order < 0 then
    raise exception 'Invalid sort order' using errcode = 'P0001';
  end if;
  if p_is_required is null then
    raise exception 'Invalid lesson requirement' using errcode = 'P0001';
  end if;

  v_order := p_sort_order;
  if v_order = 0 then
    select coalesce(max(sort_order), 0) + 1 into v_order
    from public.curriculum_component_items
    where component_id = v_component;
  end if;

  update public.curriculum_component_items
  set sort_order = sort_order + 1
  where component_id = v_component
    and sort_order >= v_order;

  insert into public.curriculum_component_items (
    component_id, code, name, sort_order, is_required, status
  ) values (
    v_component, v_code, v_name, v_order, p_is_required, p_status
  )
  returning * into v_row;

  perform public.normalize_lesson_order(v_component);

  select * into v_row
  from public.curriculum_component_items
  where id = v_row.id;

  return v_row;
exception
  when unique_violation then
    raise exception 'Lesson code already exists' using errcode = '23505';
end;
$$;

create function public.update_curriculum_lesson(
  p_curriculum_id uuid,
  p_level_id uuid,
  p_subject_id uuid,
  p_lesson_id uuid,
  p_code text,
  p_name text,
  p_is_required boolean,
  p_sort_order integer,
  p_status text
) returns public.curriculum_component_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_component uuid;
  v_code text;
  v_name text;
  v_current_order integer;
  v_row public.curriculum_component_items;
begin
  select item.component_id, item.sort_order
  into v_component, v_current_order
  from public.curriculum_component_items item
  where item.id = p_lesson_id;

  if v_component is null then
    raise exception 'Lesson not found' using errcode = 'P0001';
  end if;

  perform public.lesson_operator_component(p_curriculum_id, p_level_id, p_subject_id, v_component);
  v_code := upper(trim(coalesce(p_code, '')));
  v_name := trim(coalesce(p_name, ''));

  if v_code !~ '^[A-Z0-9_-]{2,50}$' then
    raise exception 'Invalid lesson code' using errcode = 'P0001';
  end if;
  if v_name = '' or char_length(v_name) > 200 then
    raise exception 'Lesson name is required' using errcode = 'P0001';
  end if;
  if p_status is distinct from 'ACTIVE' and p_status is distinct from 'INACTIVE' then
    raise exception 'Invalid lesson status' using errcode = 'P0001';
  end if;
  if p_sort_order is null or p_sort_order < 0 then
    raise exception 'Invalid sort order' using errcode = 'P0001';
  end if;
  if p_is_required is null then
    raise exception 'Invalid lesson requirement' using errcode = 'P0001';
  end if;

  perform public.assert_required_active_lessons(v_component, p_lesson_id, p_status, p_is_required);

  if p_sort_order > 0 and p_sort_order is distinct from v_current_order then
    update public.curriculum_component_items
    set sort_order = sort_order + 1
    where component_id = v_component
      and id <> p_lesson_id
      and sort_order >= p_sort_order;
  end if;

  update public.curriculum_component_items
  set code = v_code,
      name = v_name,
      is_required = p_is_required,
      sort_order = case when p_sort_order = 0 then sort_order else p_sort_order end,
      status = p_status
  where id = p_lesson_id
    and component_id = v_component
  returning * into v_row;

  perform public.normalize_lesson_order(v_component);

  select * into v_row
  from public.curriculum_component_items
  where id = p_lesson_id;

  return v_row;
exception
  when unique_violation then
    raise exception 'Lesson code already exists' using errcode = '23505';
end;
$$;

create function public.reorder_curriculum_lesson(
  p_curriculum_id uuid,
  p_level_id uuid,
  p_subject_id uuid,
  p_lesson_id uuid,
  p_direction text,
  p_scope text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_component uuid;
  v_neighbor uuid;
  v_current integer;
  v_other integer;
begin
  if p_direction is distinct from 'up' and p_direction is distinct from 'down' then
    raise exception 'Invalid lesson order' using errcode = 'P0001';
  end if;
  if p_scope is distinct from 'active' and p_scope is distinct from 'all' then
    raise exception 'Invalid lesson order' using errcode = 'P0001';
  end if;

  select item.component_id into v_component
  from public.curriculum_component_items item
  where item.id = p_lesson_id;

  if v_component is null then
    raise exception 'Lesson not found' using errcode = 'P0001';
  end if;

  perform public.lesson_operator_component(p_curriculum_id, p_level_id, p_subject_id, v_component);
  perform public.normalize_lesson_order(v_component);

  with ranked as (
    select id, row_number() over (order by sort_order, id) as position
    from public.curriculum_component_items
    where component_id = v_component
      and (p_scope = 'all' or status = 'ACTIVE')
  ), current_row as (
    select position from ranked where id = p_lesson_id
  )
  select neighbor.id into v_neighbor
  from ranked neighbor
  join current_row current
    on neighbor.position = current.position + case when p_direction = 'up' then -1 else 1 end;

  if v_neighbor is null then
    raise exception 'Invalid lesson order' using errcode = 'P0001';
  end if;

  select sort_order into v_current
  from public.curriculum_component_items
  where id = p_lesson_id;
  select sort_order into v_other
  from public.curriculum_component_items
  where id = v_neighbor;

  update public.curriculum_component_items
  set sort_order = -1
  where id = p_lesson_id;
  update public.curriculum_component_items
  set sort_order = v_current
  where id = v_neighbor;
  update public.curriculum_component_items
  set sort_order = v_other
  where id = p_lesson_id;

  perform public.normalize_lesson_order(v_component);
end;
$$;

create function public.retire_curriculum_lesson(
  p_curriculum_id uuid,
  p_level_id uuid,
  p_subject_id uuid,
  p_lesson_id uuid
) returns public.curriculum_component_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_component uuid;
  v_required boolean;
  v_row public.curriculum_component_items;
begin
  select item.component_id, item.is_required
  into v_component, v_required
  from public.curriculum_component_items item
  where item.id = p_lesson_id;

  if v_component is null then
    raise exception 'Lesson not found' using errcode = 'P0001';
  end if;

  perform public.lesson_operator_component(p_curriculum_id, p_level_id, p_subject_id, v_component);
  perform public.assert_required_active_lessons(v_component, p_lesson_id, 'INACTIVE', v_required);

  update public.curriculum_component_items
  set status = 'INACTIVE'
  where id = p_lesson_id
    and component_id = v_component
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.lesson_operator_component(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.normalize_lesson_order(uuid) from public, anon, authenticated, service_role;
revoke all on function public.assert_required_active_lessons(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.create_curriculum_lesson(uuid, uuid, uuid, uuid, text, text, boolean, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.update_curriculum_lesson(uuid, uuid, uuid, uuid, text, text, boolean, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.reorder_curriculum_lesson(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.retire_curriculum_lesson(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_curriculum_lesson(uuid, uuid, uuid, uuid, text, text, boolean, integer, text) to authenticated;
grant execute on function public.update_curriculum_lesson(uuid, uuid, uuid, uuid, text, text, boolean, integer, text) to authenticated;
grant execute on function public.reorder_curriculum_lesson(uuid, uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.retire_curriculum_lesson(uuid, uuid, uuid, uuid) to authenticated;
