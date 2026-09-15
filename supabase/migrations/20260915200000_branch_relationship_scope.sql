-- Phase 2 pilot: active operational membership, not preferred branch or financial snapshots.
alter table public.student_parents add column is_active boolean not null default true;
insert into public.permissions(code,name,module) select code,code,split_part(code,'.',1) from (values
 ('students.update_basic'),('classes.view'),('classes.manage'),('attendance.view'),('learning_journals.view'),('learning_reports.view')) v(code) on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where
 (r.code='BRANCH_ADMIN' and p.code in ('students.view','students.update_basic','classes.view','classes.manage','attendance.view','attendance.manage','learning_journals.view','learning_reports.view'))
 or (r.code='TEACHER' and p.code in ('students.view_related','classes.view','attendance.view','learning_journals.view'))
 or (r.code='PARENT' and p.code='students.view_related') or (r.code='STUDENT' and p.code='students.view_own')
on conflict do nothing;

create function public.student_belongs_to_branch(p_student uuid,p_branch uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(
 select 1 from public.enrollments e join public.classes c on c.id=e.class_id
 where e.student_id=p_student and c.branch_id=p_branch and e.status='ACTIVE' and c.status='ACTIVE'
 and not public.is_enrollment_paused_on(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and e.started_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (e.ended_at is null or e.ended_at >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and (c.start_date is null or c.start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and (c.end_date is null or c.end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date))
$$;
create function public.student_branch_permission(p_student uuid,p_permission text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or (public.has_role('BRANCH_ADMIN') and exists(
 select 1 from public.enrollments e join public.classes c on c.id=e.class_id
 where e.student_id=p_student and public.student_belongs_to_branch(p_student,c.branch_id)
 and public.has_permission(p_permission,c.branch_id)))
$$;
create function public.teacher_can_access_class(p_class uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.teachers t
 join public.class_teachers ct on ct.teacher_id=t.id join public.classes c on c.id=ct.class_id
 where t.user_id=auth.uid() and t.status='ACTIVE' and ct.class_id=p_class and ct.is_active and c.status='ACTIVE'
 and ct.assigned_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (ct.ended_at is null or ct.ended_at >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and (c.start_date is null or c.start_date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and (c.end_date is null or c.end_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
 and public.has_permission('classes.view',c.branch_id))
$$;
-- Completed actual-teacher snapshots retain access to that session only, even after a class assignment ends.
-- For scheduled sessions, explicit overrides take precedence; cancelled sessions confer no teacher access.
create function public.teacher_can_access_session(p_session uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.session_actual_teachers v
 join public.teachers t on t.id=v.teacher_id
 where v.session_id=p_session and v.status in ('SCHEDULED','COMPLETED') and t.user_id=auth.uid() and t.status='ACTIVE'
 and public.has_permission('attendance.view',v.branch_id)
 and (v.is_locked or exists(select 1 from public.session_teacher_assignments a where a.session_id=v.session_id and a.teacher_id=t.id and a.effective_status='ACTIVE')
 or public.teacher_can_access_class(v.class_id)))
$$;
create function public.teacher_can_access_student(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id
 where e.student_id=p_student and public.has_permission('students.view_related',c.branch_id) and (
 (public.teacher_can_access_class(c.id) and e.status='ACTIVE' and not public.is_enrollment_paused_on(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date) and e.started_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (e.ended_at is null or e.ended_at >= (now() at time zone 'Asia/Ho_Chi_Minh')::date))
 or exists(select 1 from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id
 where sc.class_id=c.id and public.teacher_can_access_session(o.id) and (o.status='COMPLETED' or e.status='ACTIVE')
 and e.started_at<=o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
 and ((o.occurrence_type='REGULAR' and not public.is_enrollment_paused_on(e.id,o.occurrence_date)) or exists(select 1 from public.session_occurrence_participants sp where sp.session_occurrence_id=o.id and sp.enrollment_id=e.id)))))
$$;
create function public.parent_can_access_student(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('PARENT') and (public.has_permission('students.view_related') or exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id where e.student_id=p_student and public.student_belongs_to_branch(p_student,c.branch_id) and public.has_permission('students.view_related',c.branch_id))) and exists(select 1 from public.parents p join public.student_parents sp on sp.parent_id=p.id
 where p.user_id=auth.uid() and p.status='ACTIVE' and sp.is_active and sp.student_id=p_student)
$$;
create function public.student_can_access_self(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('STUDENT') and (public.has_permission('students.view_own') or exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id where e.student_id=p_student and public.student_belongs_to_branch(p_student,c.branch_id) and public.has_permission('students.view_own',c.branch_id))) and exists(select 1 from public.students s where s.id=p_student and s.user_id=auth.uid() and s.status='ACTIVE')
$$;
create or replace function public.can_access_student(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(select 1 from public.students s where s.id=p_student) and (
 public.student_branch_permission(p_student,'students.view') or public.teacher_can_access_student(p_student)
 or public.parent_can_access_student(p_student) or public.student_can_access_self(p_student))
$$;
create function public.can_access_class(p_class uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(select 1 from public.classes c where c.id=p_class and (
 (public.has_role('BRANCH_ADMIN') and public.has_permission('classes.view',c.branch_id))
 or public.teacher_can_access_class(c.id) or exists(select 1 from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id where sc.class_id=c.id and public.teacher_can_access_session(o.id))))
$$;
create function public.can_access_session(p_session uuid,p_permission text default 'attendance.view')
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(select 1 from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id join public.classes c on c.id=sc.class_id
 where o.id=p_session and ((public.has_role('BRANCH_ADMIN') and public.has_permission(p_permission,c.branch_id))
 or (p_permission in ('attendance.view','learning_journals.view') and public.has_permission(p_permission,c.branch_id) and public.teacher_can_access_session(o.id))))
$$;
-- Definers terminate policy recursion by reading relationship tables as owner. Never accept caller-supplied user identity.
revoke all on function public.student_belongs_to_branch(uuid,uuid),public.student_branch_permission(uuid,text),public.teacher_can_access_class(uuid),public.teacher_can_access_session(uuid),public.teacher_can_access_student(uuid),public.parent_can_access_student(uuid),public.student_can_access_self(uuid),public.can_access_class(uuid),public.can_access_session(uuid,text) from public,anon,authenticated;
grant execute on function public.student_belongs_to_branch(uuid,uuid),public.student_branch_permission(uuid,text),public.teacher_can_access_class(uuid),public.teacher_can_access_session(uuid),public.teacher_can_access_student(uuid),public.parent_can_access_student(uuid),public.student_can_access_self(uuid),public.can_access_class(uuid),public.can_access_session(uuid,text) to authenticated;

-- Staff pilot. Parent/student helpers do not open attendance, journals or academic history policies yet.
create policy branch_student_read on public.students for select to authenticated using(public.student_branch_permission(id,'students.view'));
create policy scoped_class_read on public.classes for select to authenticated using(public.can_access_class(id));
create policy scoped_session_read on public.session_occurrences for select to authenticated using(public.can_access_session(id));
create policy scoped_schedule_read on public.schedules for select to authenticated using(public.teacher_can_access_class(class_id) or (public.has_role('BRANCH_ADMIN') and exists(select 1 from public.classes c where c.id=class_id and public.has_permission('classes.view',c.branch_id))) or exists(select 1 from public.session_occurrences o where o.schedule_id=schedules.id and public.can_access_session(o.id)));
create policy scoped_attendance_read on public.attendance_records for select to authenticated using(public.can_access_session(session_occurrence_id));
create policy scoped_journal_read on public.learning_journals for select to authenticated using(exists(select 1 from public.attendance_records a where a.id=attendance_record_id and public.can_access_session(a.session_occurrence_id,'learning_journals.view')));
-- The existing owner self-policy is narrowed to an active identity. No new parent/student data is exposed.
alter policy "Student views own student record" on public.students using(public.student_can_access_self(id) or public.has_role('SUPER_ADMIN'));
-- Branch metadata is scoped below as well; UI filtering is not an authorization boundary.

-- Narrow projection keeps student contact details, internal notes, and account IDs out of teacher responses.
create function public.scoped_students(p_student uuid default null)
returns table(id uuid,student_code text,full_name text,preferred_name text) language sql stable security definer set search_path=public,pg_temp as $$
 select s.id,s.student_code,s.full_name,s.preferred_name from public.students s
 where (p_student is null or s.id=p_student) and (public.has_role('SUPER_ADMIN') or public.student_branch_permission(s.id,'students.view') or public.teacher_can_access_student(s.id)) order by s.student_code
$$;
create function public.update_student_basic(p_student uuid,p_full_name text,p_preferred_name text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.student_branch_permission(p_student,'students.update_basic') then raise exception 'Unauthorized'; end if;
 if p_full_name is null or char_length(btrim(p_full_name)) not between 1 and 200 or char_length(p_preferred_name)>200 then raise exception 'Invalid student name'; end if;
 update public.students set full_name=btrim(p_full_name),preferred_name=nullif(btrim(p_preferred_name),'') where id=p_student;
 if not found then raise exception 'Student not found'; end if;
end $$;
revoke all on function public.scoped_students(uuid),public.update_student_basic(uuid,text,text) from public,anon,authenticated;
grant execute on function public.scoped_students(uuid),public.update_student_basic(uuid,text,text) to authenticated;

create function public.can_access_branch(p_branch uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN')
 or (public.has_role('BRANCH_ADMIN') and public.has_permission('classes.view',p_branch))
 or (public.has_role('TEACHER') and exists(select 1 from public.classes c where c.branch_id=p_branch and public.can_access_class(c.id)))
$$;
revoke all on function public.can_access_branch(uuid) from public,anon,authenticated;
grant execute on function public.can_access_branch(uuid) to authenticated;
alter policy "Authenticated users can view branches" on public.branches using(public.can_access_branch(id));
