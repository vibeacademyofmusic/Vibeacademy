-- Owner decision: previous teaching does not authorize current learner profiles.
-- Current active class assignment or a scheduled assigned session remains eligible.
create or replace function public.teacher_can_access_student(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id
 where e.student_id=p_student and public.has_role_permission('TEACHER','students.view_related',c.branch_id) and (
 (public.teacher_can_access_class(c.id) and e.status='ACTIVE' and not public.is_enrollment_paused_on(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date) and e.started_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (e.ended_at is null or e.ended_at >= (now() at time zone 'Asia/Ho_Chi_Minh')::date))
 or exists(select 1 from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id
 where sc.class_id=c.id and public.teacher_can_access_session(o.id) and o.status='SCHEDULED' and e.status='ACTIVE'
 and e.started_at<=o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
 and ((o.occurrence_type='REGULAR' and not public.is_enrollment_paused_on(e.id,o.occurrence_date)) or exists(select 1 from public.session_occurrence_participants sp where sp.session_occurrence_id=o.id and sp.enrollment_id=e.id)))))
$$;


-- SECURITY DEFINER avoids dependence on attendance RLS when an author retains a
-- journal independently of the session's current teacher assignment.
create function public.can_read_learning_journal(p_journal uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(
  select 1 from public.learning_journals j
  join public.attendance_records a on a.id=j.attendance_record_id
  join public.session_occurrences o on o.id=a.session_occurrence_id
  join public.schedules sc on sc.id=o.schedule_id
  join public.classes c on c.id=sc.class_id
  where j.id=p_journal and (
   public.has_role_permission('BRANCH_ADMIN','learning_journals.view',c.branch_id)
   or (public.has_role_permission('TEACHER','learning_journals.view',c.branch_id)
    and exists(select 1 from public.teachers t where t.user_id=auth.uid() and t.status='ACTIVE')
    and (j.created_by=auth.uid()
     or public.teacher_can_access_class(c.id)
     or (o.status='SCHEDULED' and public.teacher_can_access_session(o.id))))))
$$;
revoke all on function public.can_read_learning_journal(uuid) from public,anon,authenticated;
grant execute on function public.can_read_learning_journal(uuid) to authenticated;
alter policy scoped_journal_read on public.learning_journals using(public.can_read_learning_journal(id));
