-- Teacher portal reads reuse canonical assignment/history guards; no write grants.
create function public.teacher_portal_sessions(p_history boolean default false,p_offset integer default 0)
returns table(session_id uuid,class_name text,starts_at timestamptz,ends_at timestamptz,status text)
language sql stable security definer set search_path=public,pg_temp as $$
 select o.id,c.name,o.starts_at,o.ends_at,o.status
 from session_occurrences o join schedules s on s.id=o.schedule_id join classes c on c.id=s.class_id
 join session_actual_teachers a on a.session_id=o.id join teachers t on t.id=a.teacher_id
 where t.user_id=auth.uid() and t.status='ACTIVE' and public.teacher_can_access_session(o.id)
 and ((p_history and o.status='COMPLETED') or (not p_history and o.status='SCHEDULED' and o.ends_at>=now()))
 order by case when p_history then o.starts_at end desc,case when not p_history then o.starts_at end,o.id
 limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

create function public.teacher_portal_classes(p_offset integer default 0)
returns table(class_id uuid,code text,name text)
language sql stable security definer set search_path=public,pg_temp as $$
 select c.id,c.code,c.name from classes c where public.teacher_can_access_class(c.id)
 order by c.code,c.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

create function public.teacher_portal_journals(p_offset integer default 0)
returns table(journal_id uuid,class_name text,starts_at timestamptz,content text,repertoire text,skills text,homework text,observation text,is_author boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select j.id,c.name,o.starts_at,j.content,j.repertoire,j.skills,j.homework,j.observation,j.created_by=auth.uid()
 from learning_journals j join attendance_records a on a.id=j.attendance_record_id
 join session_occurrences o on o.id=a.session_occurrence_id join schedules s on s.id=o.schedule_id
 join classes c on c.id=s.class_id
 where public.has_role_permission('TEACHER','learning_journals.view',c.branch_id)
 and public.can_read_learning_journal(j.id)
 order by o.starts_at desc,j.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

insert into public.permissions(code,name,module) values('feedback.view_own','View own teaching feedback summary','feedback') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from roles r cross join permissions p
where r.code='TEACHER' and p.code='feedback.view_own' on conflict do nothing;
create function public.teacher_feedback_summary(p_offset integer default 0)
returns table(month date,response_count bigint,overall_average numeric)
language sql stable security definer set search_path=public,pg_temp as $$
 select date_trunc('month',f.session_starts_at at time zone 'Asia/Ho_Chi_Minh')::date,count(*),round(avg(f.overall_rating),2)
 from lesson_feedback f join teachers t on t.id=f.teacher_id
 where t.user_id=auth.uid() and t.status='ACTIVE' and public.has_role_permission('TEACHER','feedback.view_own',f.branch_id)
 group by 1 order by 1 desc limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

create function public.own_payroll_off_cycle_corrections(p_offset integer default 0)
returns table(correction_id uuid,period_id uuid,currency text,amount numeric,reason text,approved_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select c.id,p.period_id,c.currency,c.delta,c.reason,c.approved_at
 from payroll_corrections c join teacher_payrolls p on p.id=c.original_payroll_id
 join payroll_periods per on per.id=p.period_id
 where c.run_type='OFF_CYCLE_CORRECTION' and per.status='FINALIZED'
 and (public.can_read_own_payroll(p.teacher_id,p.branch_id) or public.can_read_employee_payroll(p.employee_id,p.branch_id))
 order by c.approved_at desc,c.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

revoke all on function public.teacher_portal_sessions(boolean,integer),public.teacher_portal_classes(integer),public.teacher_portal_journals(integer),public.teacher_feedback_summary(integer),public.own_payroll_off_cycle_corrections(integer) from public,anon,authenticated;
grant execute on function public.teacher_portal_sessions(boolean,integer),public.teacher_portal_classes(integer),public.teacher_portal_journals(integer),public.teacher_feedback_summary(integer),public.own_payroll_off_cycle_corrections(integer) to authenticated;
