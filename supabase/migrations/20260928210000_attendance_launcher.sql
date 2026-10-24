-- Read-only launcher. Reuses the dated canonical roster and actual-teacher resolver.
-- No table policies, attendance writes or permissions are changed.
create or replace function public.attendance_session_search(
 p_date date default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
 p_branch uuid default null, p_class uuid default null, p_teacher uuid default null,
 p_student text default null, p_status text default null, p_offset integer default 0
) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with authorized as materialized (
  select v.*, c.name class_name, c.code class_code, b.name branch_name,
   t.full_name teacher_name, r.name room_name
  from public.session_actual_teachers v
  join public.classes c on c.id=v.class_id join public.branches b on b.id=v.branch_id
  left join public.teachers t on t.id=v.teacher_id left join public.rooms r on r.id=v.room_id
  where v.occurrence_date=p_date and v.status<>'CANCELLED'
   and auth.uid() is not null and coalesce(public.account_is_active(),false)
   and public.can_access_session(v.session_id)
 ), counted as (
  select v.*, rr.total, rr.marked, rr.absent, rr.student_names, rr.student_attendance, rr.matched,
   case when rr.total>0 and rr.marked=rr.total then 'COMPLETE'
        when rr.marked>0 then 'IN_PROGRESS' else 'UNMARKED' end attendance_state
  from authorized v
  cross join lateral (
   select count(*) total, count(a.id) marked,
    count(*) filter(where a.status in ('ABSENT','EXCUSED')) absent,
    string_agg(coalesce(st.preferred_name,st.full_name,st.student_code), ', ' order by st.full_name)
      filter(where nullif(btrim(p_student),'') is null or st.id::text=p_student
       or st.full_name ilike '%'||btrim(p_student)||'%' or st.preferred_name ilike '%'||btrim(p_student)||'%'
       or st.student_code ilike '%'||btrim(p_student)||'%') student_names,
    string_agg(coalesce(st.preferred_name,st.full_name,st.student_code)||': '||
      case a.status when 'PRESENT' then 'Có mặt' when 'LATE' then 'Đi muộn'
       when 'ABSENT' then 'Vắng' when 'EXCUSED' then 'Có phép' else 'Chưa điểm danh' end, ', ' order by st.full_name)
      filter(where nullif(btrim(p_student),'') is not null and (st.id::text=p_student
       or st.full_name ilike '%'||btrim(p_student)||'%' or st.preferred_name ilike '%'||btrim(p_student)||'%'
       or st.student_code ilike '%'||btrim(p_student)||'%')) student_attendance,
    bool_or(st.id::text=p_student or st.full_name ilike '%'||btrim(p_student)||'%'
      or st.preferred_name ilike '%'||btrim(p_student)||'%' or st.student_code ilike '%'||btrim(p_student)||'%') matched
   from public.session_teaching_roster(v.session_id) rr join public.students st on st.id=rr.student_id
   left join public.attendance_records a on a.session_occurrence_id=v.session_id and a.enrollment_id=rr.enrollment_id
  ) rr
  where (p_branch is null or v.branch_id=p_branch) and (p_class is null or v.class_id=p_class)
   and (p_teacher is null or v.teacher_id=p_teacher)
 ), filtered as (
  select *, case when total>0 and marked=total then 3
    when starts_at<=now() and ends_at>now() then 0
    when starts_at>now() then 1 when marked<total or total=0 then 2 else 3 end priority
  from counted where (nullif(btrim(p_student),'') is null or matched)
   and (nullif(p_status,'') is null or p_status=attendance_state or (p_status='ABSENT' and absent>0))
 ), page as (
  select * from filtered order by priority,starts_at,session_id limit 25 offset greatest(0,least(coalesce(p_offset,0),100000))
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page) order by priority,starts_at,session_id) from page),'[]'::jsonb),
  'total',(select count(*) from filtered),
  'branches',coalesce((select jsonb_agg(x order by name) from (select distinct branch_id id,branch_name name from authorized) x),'[]'::jsonb),
  'classes',coalesce((select jsonb_agg(x order by name) from (select distinct class_id id,class_name name from authorized where p_branch is null or branch_id=p_branch) x),'[]'::jsonb),
  'teachers',coalesce((select jsonb_agg(x order by name) from (select distinct teacher_id id,teacher_name name from authorized where teacher_id is not null and (p_branch is null or branch_id=p_branch)) x),'[]'::jsonb))
$$;
revoke all on function public.attendance_session_search(date,uuid,uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.attendance_session_search(date,uuid,uuid,uuid,text,text,integer) to authenticated;
notify pgrst, 'reload schema';
