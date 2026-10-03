-- A live manual grant cannot outlive the eligible course delivery window.
create or replace function public.learning_learner_for_level(p_level uuid) returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
 select s.id from public.students s
 join public.enrollments e on e.student_id=s.id
 join public.classes c on c.id=e.class_id join public.courses co on co.id=c.course_id
 join public.curriculums cu on cu.id=co.curriculum_id and cu.status='ACTIVE'
join public.curriculum_levels l on l.id=p_level and l.curriculum_id=co.curriculum_id
 join public.learning_access_grants g on g.enrollment_id=e.id and g.level_id=l.id
 where public.account_is_active() and public.has_role('STUDENT') and s.user_id=auth.uid() and s.status='ACTIVE'
 and public.has_role_permission('STUDENT','students.view_own',c.branch_id)
 and e.status='ACTIVE' and c.status='ACTIVE' and co.status='ACTIVE' and l.status='ACTIVE'
 and (c.start_date is null or c.start_date<=(now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and (c.end_date is null or c.end_date>=(now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and coalesce(e.started_at,e.enrolled_at)<=(now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (e.ended_at is null or e.ended_at>=(now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and not public.is_enrollment_paused_on(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and g.revoked_at is null and g.valid_from<=now() and g.valid_until>now()
 order by s.id limit 1
$$;
