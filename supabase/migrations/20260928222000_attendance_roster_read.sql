-- Narrow read boundary for the existing branch attendance permission.
-- Do not widen enrollment table access or attendance mutation permissions.
begin;
create function public.attendance_roster_read(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not coalesce(public.account_is_active(),false)
   or not (public.has_role('SUPER_ADMIN') or public.has_role('BRANCH_ADMIN'))
   or not coalesce(public.can_access_session(p_session),false) then
   raise exception 'ATTENDANCE_UNAUTHORIZED';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'enrollment_id',rr.enrollment_id,'student_id',rr.student_id,
   'student_code',st.student_code,'full_name',st.full_name,'preferred_name',st.preferred_name,
   'attendance_id',a.id,'status',a.status,'notes',a.notes
 ) order by st.full_name,rr.enrollment_id)
 from public.session_teaching_roster(p_session) rr
 join public.students st on st.id=rr.student_id
 left join public.attendance_records a on a.session_occurrence_id=p_session and a.enrollment_id=rr.enrollment_id),'[]'::jsonb);
end $$;
revoke all on function public.attendance_roster_read(uuid) from public,anon,authenticated,service_role;
grant execute on function public.attendance_roster_read(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
