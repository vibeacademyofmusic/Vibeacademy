-- Require a real Lesson for all future saves; preserve legacy links for correction.
create or replace function public.save_academic_video_link(
  p_student uuid,p_enrollment uuid,p_id uuid,p_version integer,p_title text,p_url text,
  p_note text,p_level uuid,p_item uuid,p_shared boolean
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare before_row public.academic_video_links; after_row public.academic_video_links;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception using errcode='42501',message='VIDEO_LINK_FORBIDDEN';
  end if;
  if p_level is null or p_item is null then raise exception 'VIDEO_LINK_LESSON_REQUIRED'; end if;
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
