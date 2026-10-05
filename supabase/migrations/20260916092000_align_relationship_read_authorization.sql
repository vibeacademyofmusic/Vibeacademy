-- Align existing relationship reads with role-specific permissions and link validity.

create or replace function public.student_branch_permission(p_student uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or (public.has_role('BRANCH_ADMIN') and exists(
 select 1 from public.enrollments e join public.classes c on c.id=e.class_id
 where e.student_id=p_student and public.student_belongs_to_branch(p_student,c.branch_id)
 and public.has_role_permission('BRANCH_ADMIN',p_permission,c.branch_id)))
$$;

create or replace function public.teacher_can_access_class(p_class uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.teachers t
 join public.class_teachers ct on ct.teacher_id=t.id join public.classes c on c.id=ct.class_id
 where t.user_id=auth.uid() and t.status='ACTIVE' and ct.class_id=p_class and ct.is_active and c.status='ACTIVE'
 and ct.assigned_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (ct.ended_at is null or ct.ended_at >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and (c.start_date is null or c.start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and (c.end_date is null or c.end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and public.has_role_permission('TEACHER','classes.view',c.branch_id))
$$;

create or replace function public.teacher_can_access_session(p_session uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.session_actual_teachers v
 join public.teachers t on t.id=v.teacher_id
 where v.session_id=p_session and v.status in ('SCHEDULED','COMPLETED') and t.user_id=auth.uid() and t.status='ACTIVE'
 and public.has_role_permission('TEACHER','attendance.view',v.branch_id)
 and (v.is_locked or exists(select 1 from public.session_teacher_assignments a where a.session_id=v.session_id and a.teacher_id=t.id and a.effective_status='ACTIVE')
 or public.teacher_can_access_class(v.class_id)))
$$;

create or replace function public.teacher_can_access_student(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id
 where e.student_id=p_student and public.has_role_permission('TEACHER','students.view_related',c.branch_id) and (
 (public.teacher_can_access_class(c.id) and e.status='ACTIVE' and not public.is_enrollment_paused_on(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date) and e.started_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (e.ended_at is null or e.ended_at >= (now() at time zone 'Asia/Ho_Chi_Minh')::date))
 or exists(select 1 from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id
 where sc.class_id=c.id and public.teacher_can_access_session(o.id) and (o.status='COMPLETED' or e.status='ACTIVE')
 and e.started_at<=o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
 and ((o.occurrence_type='REGULAR' and not public.is_enrollment_paused_on(e.id,o.occurrence_date)) or exists(select 1 from public.session_occurrence_participants sp where sp.session_occurrence_id=o.id and sp.enrollment_id=e.id)))))
$$;

create or replace function public.parent_can_access_student(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('PARENT') and (public.has_role_permission('PARENT','students.view_related',null) or exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id where e.student_id=p_student and public.student_belongs_to_branch(p_student,c.branch_id) and public.has_role_permission('PARENT','students.view_related',c.branch_id))) and exists(select 1 from public.parents p join public.student_parents sp on sp.parent_id=p.id
 where p.user_id=auth.uid() and p.status='ACTIVE' and sp.is_active and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now()) and sp.student_id=p_student)
$$;

create or replace function public.student_can_access_self(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('STUDENT') and (public.has_role_permission('STUDENT','students.view_own',null) or exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id where e.student_id=p_student and public.student_belongs_to_branch(p_student,c.branch_id) and public.has_role_permission('STUDENT','students.view_own',c.branch_id))) and exists(select 1 from public.students s where s.id=p_student and s.user_id=auth.uid() and s.status='ACTIVE')
$$;

create or replace function public.can_access_class(p_class uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(select 1 from public.classes c where c.id=p_class and (
 (public.has_role('BRANCH_ADMIN') and public.has_role_permission('BRANCH_ADMIN','classes.view',c.branch_id))
 or public.teacher_can_access_class(c.id) or exists(select 1 from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id where sc.class_id=c.id and public.teacher_can_access_session(o.id))))
$$;

create or replace function public.can_access_session(p_session uuid,p_permission text default 'attendance.view')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(select 1 from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id join public.classes c on c.id=sc.class_id
 where o.id=p_session and ((public.has_role('BRANCH_ADMIN') and public.has_role_permission('BRANCH_ADMIN',p_permission,c.branch_id))
 or (p_permission in ('attendance.view','learning_journals.view') and public.has_role_permission('TEACHER',p_permission,c.branch_id) and public.teacher_can_access_session(o.id))))
$$;

create or replace function public.can_access_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN')
 or (public.has_role('BRANCH_ADMIN') and public.has_role_permission('BRANCH_ADMIN','classes.view',p_branch))
 or (public.has_role('TEACHER') and exists(select 1 from public.classes c where c.branch_id=p_branch and public.can_access_class(c.id)))
$$;

alter policy "Parent views own parent record" on public.parents using (
 public.has_role('SUPER_ADMIN') or (public.has_role('PARENT') and status='ACTIVE' and user_id=auth.uid()));
alter policy "Teacher views own teacher record" on public.teachers using (
 public.has_role('SUPER_ADMIN') or (public.has_role('TEACHER') and status='ACTIVE' and user_id=auth.uid()));
alter policy "Teacher views own branch links" on public.teacher_branches using (
 public.has_role('SUPER_ADMIN') or (public.has_role_permission('TEACHER','classes.view',branch_id)
 and exists(select 1 from public.teachers t where t.id=teacher_id and t.user_id=auth.uid() and t.status='ACTIVE')));

-- Student/parent readers get a fixed projection, never staff notes or contact columns.
alter policy "Student views own student record" on public.students using (public.has_role('SUPER_ADMIN'));
create function public.related_student_profiles(p_student uuid default null)
returns table(id uuid,student_code text,full_name text,preferred_name text)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.id,s.student_code,s.full_name,s.preferred_name from public.students s
 where (p_student is null or s.id=p_student) and
 (public.has_role('SUPER_ADMIN') or public.student_can_access_self(s.id) or public.parent_can_access_student(s.id))
 order by s.student_code
$$;
revoke all on function public.related_student_profiles(uuid) from public,anon,authenticated;
grant execute on function public.related_student_profiles(uuid) to authenticated;

alter policy scoped_schedule_read on public.schedules using (
 public.teacher_can_access_class(class_id)
 or (public.has_role('BRANCH_ADMIN') and exists(select 1 from public.classes c where c.id=class_id and public.has_role_permission('BRANCH_ADMIN','classes.view',c.branch_id)))
 or exists(select 1 from public.session_occurrences o where o.schedule_id=schedules.id and public.can_access_session(o.id)));
