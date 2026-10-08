-- Historical attendance must not reopen current learner profiles.
create function public.teacher_portal_session(p_session uuid)
returns table(session_id uuid,class_name text,starts_at timestamptz,ends_at timestamptz,status text)
language sql stable security definer set search_path=public,pg_temp as $$
 select o.id,c.name,o.starts_at,o.ends_at,o.status from session_occurrences o
 join schedules sc on sc.id=o.schedule_id join classes c on c.id=sc.class_id
 join session_actual_teachers a on a.session_id=o.id join teachers t on t.id=a.teacher_id
 where o.id=p_session and t.user_id=auth.uid() and t.status='ACTIVE'
 and public.teacher_can_access_session(o.id)
$$;
create function public.teacher_portal_attendance(p_session uuid,p_offset integer default 0)
returns table(attendance_id uuid,student_name text,status text)
language sql stable security definer set search_path=public,pg_temp as $$
 select a.id,case when public.teacher_can_access_student(e.student_id) then s.full_name
 else 'Học viên (hồ sơ lịch sử)' end,a.status
 from attendance_records a join enrollments e on e.id=a.enrollment_id join students s on s.id=e.student_id
 where a.session_occurrence_id=p_session and exists(select 1 from public.teacher_portal_session(p_session))
 order by a.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;
revoke all on function public.teacher_portal_session(uuid),public.teacher_portal_attendance(uuid,integer) from public,anon,authenticated;
grant execute on function public.teacher_portal_session(uuid),public.teacher_portal_attendance(uuid,integer) to authenticated;
