-- Additive relationship validity; legacy links remain valid unless explicitly ended.
alter table public.student_parents add column valid_from timestamptz;
alter table public.student_parents add column valid_until timestamptz;
alter table public.student_parents add constraint student_parent_valid_dates
 check(valid_until is null or valid_from is null or valid_until>valid_from);

insert into public.permissions(code,name,module) values('feedback.submit','Submit own or linked-child lesson feedback','feedback') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
 select r.id,p.id from public.roles r cross join public.permissions p
 where r.code in ('STUDENT','PARENT') and p.code='feedback.submit' on conflict do nothing;

-- One assignment must supply the role, permission and branch scope together.
create function public.has_role_permission(p_role text,p_permission text,p_branch uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(
 select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
 join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id
 where ur.user_id=auth.uid() and r.code=p_role and p.code=p_permission
 and ur.is_active and (ur.valid_from is null or ur.valid_from<=now())
 and (ur.valid_until is null or ur.valid_until>now())
 and (ur.branch_id is null or ur.branch_id=p_branch))
$$;
revoke all on function public.has_role_permission(text,text,uuid) from public,anon,authenticated;
grant execute on function public.has_role_permission(text,text,uuid) to authenticated;

create or replace function public.submit_lesson_feedback(p_session_id uuid,p_student_id uuid,p_respondent_type text,p_overall integer,
 p_quality integer default null,p_communication integer default null,p_progress integer default null,p_comment text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare c record; t record; result uuid; low boolean;
begin
 if not public.account_is_active() then raise exception 'Unauthorized'; end if;
 if p_respondent_type='STUDENT' then
   if not exists(select 1 from students where id=p_student_id and user_id=auth.uid() and status='ACTIVE') then raise exception 'Invalid respondent relationship'; end if;
 elsif p_respondent_type='PARENT' then
   if not exists(select 1 from parents p join student_parents sp on sp.parent_id=p.id where p.user_id=auth.uid() and p.status='ACTIVE' and sp.student_id=p_student_id and sp.is_active and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now())) then raise exception 'Invalid respondent relationship'; end if;
 else raise exception 'Invalid respondent type'; end if;
 if p_overall is null or p_overall not between 1 and 5 or p_quality not between 1 and 5 or p_communication not between 1 and 5 or p_progress not between 1 and 5 or p_comment is null or char_length(p_comment)>4000 then raise exception 'Invalid ratings or comment'; end if;
 select o.id,o.starts_at,o.ends_at,o.occurrence_date,sc.class_id,cl.name class_name,cl.branch_id,b.name branch_name,
   e.id enrollment_id,s.full_name student_name,s.student_code
 into c from session_occurrences o join schedules sc on sc.id=o.schedule_id join classes cl on cl.id=sc.class_id
 join branches b on b.id=cl.branch_id join enrollments e on e.class_id=cl.id and e.student_id=p_student_id
 join students s on s.id=e.student_id join attendance_records a on a.enrollment_id=e.id and a.session_occurrence_id=o.id
 where o.id=p_session_id and o.status='COMPLETED' and o.ends_at<=now() and a.status in ('PRESENT','LATE');
 if not found then raise exception 'Session is not eligible for feedback'; end if;
 if not public.has_role_permission(p_respondent_type,'feedback.submit',c.branch_id) then raise exception 'Unauthorized'; end if;
 select tr.id,tr.full_name,tr.teacher_code into t from session_actual_teachers v join teachers tr on tr.id=v.teacher_id where v.session_id=c.id;
 if not found then raise exception 'Session teacher is missing or ambiguous'; end if;
 low:=p_overall<=lesson_feedback_low_threshold();
 insert into lesson_feedback(session_occurrence_id,enrollment_id,student_id,respondent_user_id,respondent_type,teacher_id,branch_id,session_starts_at,
 context_snapshot,overall_rating,lesson_quality_rating,teacher_communication_rating,progress_perception_rating,comment,is_low_rating,resolution_status)
 values(c.id,c.enrollment_id,p_student_id,auth.uid(),p_respondent_type,t.id,c.branch_id,c.starts_at,
 jsonb_build_object('student_name',c.student_name,'student_code',c.student_code,'teacher_name',coalesce(t.full_name,t.teacher_code),'branch_name',c.branch_name,'class_name',c.class_name,
 'respondent_name',(select full_name from profiles where id=auth.uid()),'teacher_basis','ACTUAL_SESSION_TEACHER'),
 p_overall,p_quality,p_communication,p_progress,btrim(p_comment),low,case when low then 'NEEDS_REVIEW' else 'NORMAL' end) returning id into result;
 return result;
end $$;
