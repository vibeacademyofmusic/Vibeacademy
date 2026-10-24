-- Links are student evidence only. Never write academic progress or YouTube grants.
-- Preserve the existing SUPER_ADMIN academic mutation boundary.
create table public.academic_video_links (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.student_curriculum_enrollments(id) on delete restrict,
  level_id uuid references public.curriculum_levels(id) on delete restrict,
  item_id uuid references public.curriculum_component_items(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 160),
  url text not null check (url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'),
  note text check (length(note) <= 1000),
  shared_with_family boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id),
  deleted_at timestamptz,
  check (item_id is null or level_id is not null),
  check ((deleted_at is null) = (deleted_by is null))
);
create unique index academic_video_links_active_url_idx
  on public.academic_video_links(enrollment_id, url) where deleted_at is null;

create table public.academic_video_link_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.academic_video_links(id) on delete restrict,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('CREATED', 'UPDATED', 'REMOVED')),
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index academic_video_link_events_link_idx on public.academic_video_link_events(link_id, created_at);

alter table public.academic_video_links enable row level security;
alter table public.academic_video_link_events enable row level security;
revoke all on public.academic_video_links, public.academic_video_link_events from public, anon, authenticated, service_role;
grant select on public.academic_video_links, public.academic_video_link_events to authenticated;

create function public.can_read_academic_video_links(p_enrollment uuid, p_shared boolean)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.student_curriculum_enrollments e where e.id=p_enrollment and (
      public.has_role('SUPER_ADMIN') or public.teacher_can_read_student_academic(e.student_id)
      or (p_shared and public.can_read_family_academic(e.student_id))
    )
  )
$$;
revoke all on function public.can_read_academic_video_links(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.can_read_academic_video_links(uuid,boolean) to authenticated;

create policy academic_video_links_read on public.academic_video_links for select to authenticated
  using (deleted_at is null and public.can_read_academic_video_links(enrollment_id,shared_with_family));
create policy academic_video_link_events_admin on public.academic_video_link_events for select to authenticated
  using (public.has_role('SUPER_ADMIN'));

create function public.academic_video_link_context(p_student uuid, p_enrollment uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare can_manage boolean; result jsonb;
begin
  if not public.can_read_academic_video_links(p_enrollment,true)
    or not exists(select 1 from public.student_curriculum_enrollments where id=p_enrollment and student_id=p_student)
  then raise exception using errcode='42501',message='VIDEO_LINK_FORBIDDEN'; end if;
  can_manage := public.has_role('SUPER_ADMIN');
  select jsonb_build_object(
    'can_manage',can_manage,
    'links',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'title',v.title,'url',v.url,'note',v.note,'level_id',v.level_id,'item_id',v.item_id,
      'level_name',l.name,'lesson_name',concat_ws(' · ',s.name,c.name,i.name),
      'shared_with_family',v.shared_with_family,'version',v.version
    ) order by v.created_at desc,v.id)
      from public.academic_video_links v
      left join public.curriculum_levels l on l.id=v.level_id
      left join public.curriculum_component_items i on i.id=v.item_id
      left join public.curriculum_subject_components c on c.id=i.component_id
      left join public.curriculum_subjects s on s.id=c.subject_id
      where v.enrollment_id=p_enrollment and v.deleted_at is null
      and public.can_read_academic_video_links(v.enrollment_id,v.shared_with_family)), '[]'::jsonb),
    'levels',case when can_manage then coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.sequence_no,l.id)
      from public.student_level_progress lp join public.curriculum_levels l on l.id=lp.level_id
      where lp.enrollment_id=p_enrollment), '[]'::jsonb) else '[]'::jsonb end,
    'lessons',case when can_manage then coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'level_id',s.level_id,'name',concat_ws(' · ',s.name,c.name,i.name))
      order by l.sequence_no,s.sort_order,c.sort_order,i.sort_order,i.id)
      from public.student_level_progress lp join public.curriculum_levels l on l.id=lp.level_id
      join public.curriculum_subjects s on s.level_id=l.id
      join public.curriculum_subject_components c on c.subject_id=s.id
      join public.curriculum_component_items i on i.component_id=c.id
      where lp.enrollment_id=p_enrollment), '[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end $$;

create function public.save_academic_video_link(
  p_student uuid,p_enrollment uuid,p_id uuid,p_version integer,p_title text,p_url text,
  p_note text,p_level uuid,p_item uuid,p_shared boolean
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare before_row public.academic_video_links; after_row public.academic_video_links;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception using errcode='42501',message='VIDEO_LINK_FORBIDDEN';
  end if;
  -- Lock the actual enrollment; never trust a client-supplied student association.
  perform 1 from public.student_curriculum_enrollments where id=p_enrollment and student_id=p_student for share;
  if not found then raise exception using errcode='42501',message='VIDEO_LINK_FORBIDDEN'; end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 160
    or p_url is null or p_url !~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
    or length(p_note)>1000 or p_shared is null or p_version is null
    or (p_id is null and p_version<>0) or (p_id is not null and p_version<1)
  then raise exception 'VIDEO_LINK_INVALID'; end if;
  if (p_level is not null and not exists (
    select 1 from public.student_level_progress lp join public.curriculum_levels l on l.id=lp.level_id
    join public.student_curriculum_enrollments e on e.id=lp.enrollment_id
    where lp.enrollment_id=p_enrollment and lp.level_id=p_level and l.curriculum_id=e.curriculum_id
  )) or (p_item is not null and (p_level is null or not exists (
    select 1 from public.curriculum_component_items i
    join public.curriculum_subject_components c on c.id=i.component_id
    join public.curriculum_subjects s on s.id=c.subject_id
    where i.id=p_item and s.level_id=p_level
  ))) then raise exception 'VIDEO_LINK_CONTEXT'; end if;

  if p_id is null then
    insert into public.academic_video_links(enrollment_id,level_id,item_id,title,url,note,shared_with_family,created_by,updated_by)
    values(p_enrollment,p_level,p_item,btrim(p_title),p_url,nullif(btrim(p_note),''),p_shared,auth.uid(),auth.uid())
    returning * into after_row;
  else
    select * into before_row from public.academic_video_links
      where id=p_id and enrollment_id=p_enrollment and deleted_at is null for update;
    if not found or before_row.version<>p_version then raise exception 'VIDEO_LINK_STALE'; end if;
    update public.academic_video_links set level_id=p_level,item_id=p_item,title=btrim(p_title),url=p_url,
      note=nullif(btrim(p_note),''),shared_with_family=p_shared,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp()
      where id=p_id returning * into after_row;
  end if;
  insert into public.academic_video_link_events(link_id,actor_id,action,before_data,after_data)
    values(after_row.id,auth.uid(),case when p_id is null then 'CREATED' else 'UPDATED' end,
      case when p_id is null then null else to_jsonb(before_row) end,to_jsonb(after_row));
  return after_row.id;
end $$;

create function public.remove_academic_video_link(p_student uuid,p_enrollment uuid,p_id uuid,p_version integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare before_row public.academic_video_links; after_row public.academic_video_links;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') or not exists (
    select 1 from public.student_curriculum_enrollments where id=p_enrollment and student_id=p_student
  ) then raise exception using errcode='42501',message='VIDEO_LINK_FORBIDDEN'; end if;
  select * into before_row from public.academic_video_links
    where id=p_id and enrollment_id=p_enrollment and deleted_at is null for update;
  if not found or p_version is null or before_row.version<>p_version then raise exception 'VIDEO_LINK_STALE'; end if;
  update public.academic_video_links set deleted_at=clock_timestamp(),deleted_by=auth.uid(),
    updated_at=clock_timestamp(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into after_row;
  insert into public.academic_video_link_events(link_id,actor_id,action,before_data,after_data)
    values(p_id,auth.uid(),'REMOVED',to_jsonb(before_row),to_jsonb(after_row));
end $$;

revoke all on function public.academic_video_link_context(uuid,uuid),
  public.save_academic_video_link(uuid,uuid,uuid,integer,text,text,text,uuid,uuid,boolean),
  public.remove_academic_video_link(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.academic_video_link_context(uuid,uuid),
  public.save_academic_video_link(uuid,uuid,uuid,integer,text,text,text,uuid,uuid,boolean),
  public.remove_academic_video_link(uuid,uuid,uuid,integer) to authenticated;

comment on table public.academic_video_links is 'Student journey video URLs only. Sharing in VIBE does not grant/revoke YouTube access or affect academic completion.';
