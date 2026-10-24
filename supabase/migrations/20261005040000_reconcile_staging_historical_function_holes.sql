-- Forward-only reconciliation for three staging ledger holes.
--
-- Staging recorded 20260923040000_zalo_interaction_link_v1.sql while these
-- earlier files were absent from the ledger:
--   20260922310000_zalo_admin_read_v1.sql
--   20260922320000_crm_channel_state_v1.sql
--   20260923031500_lesson_operator_writes_v1.sql
--
-- 20260922310000 cannot be executed now. It creates the original
-- registration_zalo_connection(uuid), and PostgreSQL rejects that because the
-- applied 20260923040000 migration already replaced it. This migration does
-- not drop, replace, or regrant that function. It checks that the newer
-- return contract is still present, then installs the other final functions
-- and grants from a clean 209-migration database. No later release migration
-- changes those functions. Re-running this file is safe.

do $$
declare
  result_type text;
  identity_args text;
begin
  select pg_get_function_result(p.oid), pg_get_function_identity_arguments(p.oid)
    into result_type, identity_args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registration_zalo_connection';

  if identity_args is distinct from 'p_application uuid'
     or result_type is null
     or position('link_status text' in result_type) = 0
     or position('external_link_key text' in result_type) = 0
     or position('linked_at timestamp with time zone' in result_type) = 0
     or position('last_verified_at timestamp with time zone' in result_type) = 0
     or position('masked_user_id text' in result_type) = 0
     or position('connection_state' in result_type) > 0
     or position('provider text' in result_type) > 0 then
    raise exception 'registration_zalo_connection does not have the newer return contract';
  end if;
end;
$$;

-- Read-only Zalo admin projections. No outbound messages, no payload, no channel identity.

create or replace function public.zalo_integration_overview()
returns table (
  total_events bigint,
  events_today bigint,
  accepted_events bigint,
  pending_events bigint,
  failed_events bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  return query
  select
    count(*)::bigint,
    count(*) filter (
      where (received_at at time zone 'Asia/Ho_Chi_Minh')::date = public.registration_vietnam_today()
    )::bigint,
    count(*) filter (where status = 'ACCEPTED')::bigint,
    count(*) filter (where processed_at is null and processing_error is null)::bigint,
    count(*) filter (where processing_error is not null)::bigint
  from public.integration_webhook_events
  where provider = 'ZALO';
end;
$$;

create or replace function public.zalo_recent_events(p_limit integer)
returns table (
  id uuid,
  received_at timestamptz,
  event_type text,
  external_event_id text,
  status text,
  processing_state text,
  processing_error text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Limit out of range';
  end if;
  return query
  select
    event.id,
    event.received_at,
    event.event_type,
    event.external_event_id,
    event.status,
    case
      when event.processing_error is not null then 'FAILED'
      when event.processed_at is not null then 'PROCESSED'
      else 'PENDING'
    end,
    event.processing_error
  from public.integration_webhook_events event
  where event.provider = 'ZALO'
  order by event.received_at desc, event.id desc
  limit p_limit;
end;
$$;

create or replace function public.zalo_linked_customers()
returns table (
  link_id uuid,
  entity_type text,
  display_label text,
  branch_name text,
  linked_at timestamptz,
  last_verified_at timestamptz,
  link_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  return query
  select
    link.id,
    case
      when link.registration_application_id is not null then 'REGISTRATION'
      when link.parent_id is not null then 'PARENT'
      else 'STUDENT'
    end,
    case
      when link.registration_application_id is not null then coalesce(nullif(btrim(app.student_name), ''), app.application_code)
      when link.student_id is not null then coalesce(nullif(btrim(student.full_name), ''), student.student_code)
      else coalesce(
        (select profile.full_name from public.profiles profile where profile.id = parent.user_id),
        parent.parent_code
      )
    end,
    case
      when app.id is not null then branch.name
      when student.id is not null then student_branch.name
      else null
    end,
    link.linked_at,
    link.last_verified_at,
    link.status
  from public.customer_channel_links link
  left join public.registration_applications app on app.id = link.registration_application_id
  left join public.branches branch on branch.id = app.branch_id
  left join public.parents parent on parent.id = link.parent_id
  left join public.students student on student.id = link.student_id
  left join public.branches student_branch on student_branch.id = student.default_branch_id
  where link.provider = 'ZALO'
  order by link.created_at desc
  limit 100;
end;
$$;

revoke all on function public.zalo_integration_overview() from public, anon, authenticated, service_role;
revoke all on function public.zalo_recent_events(integer) from public, anon, authenticated, service_role;
revoke all on function public.zalo_linked_customers() from public, anon, authenticated, service_role;
grant execute on function public.zalo_integration_overview() to authenticated;
grant execute on function public.zalo_recent_events(integer) to authenticated;
grant execute on function public.zalo_linked_customers() to authenticated;

-- CRM reads Zalo as an explicit channel link. Phone numbers are not identity.

create or replace function public.crm_lead_channel_state(p_lead uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  lead public.crm_leads%rowtype;
  state text;
begin
  if p_lead is null or auth.uid() is null then
    return null;
  end if;
  select * into lead from public.crm_leads where id = p_lead;
  if not found or not public.crm_can('crm.view', lead.branch_id) then
    return null;
  end if;
  select case link.status
    when 'ACTIVE' then 'VERIFIED'
    when 'PENDING' then 'LINKED'
    when 'REVOKED' then 'REVOKED'
    else 'NONE'
  end
  into state
  from public.customer_channel_links link
  where link.provider = 'ZALO'
    and (
      (lead.converted_student_id is not null and link.student_id = lead.converted_student_id)
      or (lead.converted_parent_id is not null and link.parent_id = lead.converted_parent_id)
      or exists (
        select 1 from public.registration_applications app
        where app.id = link.registration_application_id
          and app.crm_lead_id = lead.id
      )
    )
  order by case link.status when 'ACTIVE' then 0 when 'PENDING' then 1 when 'REVOKED' then 2 else 3 end,
    link.created_at desc
  limit 1;
  return coalesce(state, 'NONE');
end;
$$;

revoke all on function public.crm_lead_channel_state(uuid) from public, anon, authenticated, service_role;
grant execute on function public.crm_lead_channel_state(uuid) to authenticated;

-- Operator lesson writes. Progress, completion, and component rules stay unchanged.
-- Authenticated clients keep select-only access. These functions are the write path.

create or replace function public.lesson_operator_component(
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

create or replace function public.normalize_lesson_order(p_component_id uuid)
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

create or replace function public.assert_required_active_lessons(
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

create or replace function public.create_curriculum_lesson(
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

create or replace function public.update_curriculum_lesson(
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

create or replace function public.reorder_curriculum_lesson(
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

create or replace function public.retire_curriculum_lesson(
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

do $$
declare
  result_type text;
  identity_args text;
begin
  select pg_get_function_result(p.oid), pg_get_function_identity_arguments(p.oid)
    into result_type, identity_args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registration_zalo_connection';

  if identity_args is distinct from 'p_application uuid'
     or result_type is null
     or position('link_status text' in result_type) = 0
     or position('external_link_key text' in result_type) = 0
     or position('linked_at timestamp with time zone' in result_type) = 0
     or position('last_verified_at timestamp with time zone' in result_type) = 0
     or position('masked_user_id text' in result_type) = 0
     or position('connection_state' in result_type) > 0
     or position('provider text' in result_type) > 0 then
    raise exception 'registration_zalo_connection does not have the newer return contract';
  end if;
end;
$$;
