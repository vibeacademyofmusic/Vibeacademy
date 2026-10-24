-- Owner-approved historical access. No direct table grants or financial mutations.
insert into public.permissions(code,name,module)
select domain||'.'||audience,domain||' '||audience,domain
from (values('attendance'),('learning_reports'),('tuition')) d(domain)
cross join (values('view_own'),('view_related')) a(audience)
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on
 (r.code='STUDENT' and p.code in ('attendance.view_own','learning_reports.view_own','tuition.view_own'))
 or (r.code='PARENT' and p.code in ('attendance.view_related','learning_reports.view_related','tuition.view_related'))
on conflict do nothing;

create function public.can_read_student_history(p_student uuid,p_branch uuid,p_domain text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_branch is not null and p_domain in ('attendance','learning_reports','tuition') and (
 public.has_role('SUPER_ADMIN')
 or (public.has_role_permission('STUDENT',p_domain||'.view_own',p_branch) and exists(
  select 1 from public.students s where s.id=p_student and s.user_id=auth.uid()
  and s.status in ('ACTIVE','PAUSED','GRADUATED')))
 or (public.has_role_permission('PARENT',p_domain||'.view_related',p_branch) and exists(
  select 1 from public.parents p join public.student_parents sp on sp.parent_id=p.id
  where p.user_id=auth.uid() and p.status='ACTIVE' and sp.student_id=p_student and sp.is_active
  and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now()))))
$$;

create function public.student_attendance_history(p_student uuid,p_limit integer default 50,p_offset integer default 0)
returns table(attendance_id uuid,session_id uuid,occurrence_date date,starts_at timestamptz,ends_at timestamptz,class_name text,attendance_status text,session_status text)
language sql stable security definer set search_path=public,pg_temp as $$
 select a.id,o.id,o.occurrence_date,o.starts_at,o.ends_at,c.name,a.status,o.status
 from public.attendance_records a join public.enrollments e on e.id=a.enrollment_id
 join public.session_occurrences o on o.id=a.session_occurrence_id
 join public.schedules sc on sc.id=o.schedule_id join public.classes c on c.id=sc.class_id
 where e.student_id=p_student and public.can_read_student_history(e.student_id,c.branch_id,'attendance')
 order by o.starts_at desc,a.id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0))
$$;

-- Explicit report projection: approved snapshot only. Never draft_data/admin_note.
-- Scalar/array field allowlists avoid exposing new private fields added by future sources.
create function public.public_report_snapshot(p_snapshot jsonb)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'schema_version',p_snapshot->'schema_version','as_of',p_snapshot->'as_of',
 'period_start',p_snapshot->'period_start','period_end',p_snapshot->'period_end',
 'student',jsonb_build_object('id',p_snapshot#>'{student,id}','name',p_snapshot#>'{student,name}','code',p_snapshot#>'{student,code}'),
 'branch',jsonb_build_object('id',p_snapshot#>'{branch,id}','name',p_snapshot#>'{branch,name}'),
 'class_name',p_snapshot->'class_name',
 'attendance',(select jsonb_object_agg(k,p_snapshot->'attendance'->k) from unnest(array['scheduled','attended','absent','excused','unmarked','makeup','rate']) k),
 'teacher_summary',(select jsonb_object_agg(k,p_snapshot->'teacher_summary'->k) from unnest(array['general_comment','strengths','improvement_areas','next_focus','recommendation']) k),
 'academic',jsonb_build_object('curriculum',p_snapshot#>'{academic,curriculum}','current_grade',p_snapshot#>'{academic,current_grade}','status',p_snapshot#>'{academic,status}',
  'subjects',coalesce((select jsonb_agg(jsonb_build_object('grade',s->'grade','grade_status',s->'grade_status','name',s->'name','is_required',s->'is_required','completion_rule',s->'completion_rule','status',s->'status','score',s->'score',
   'components',coalesce((select jsonb_agg(jsonb_build_object('name',c->'name','required',c->'required','status',c->'status','score',c->'score')) from jsonb_array_elements(coalesce(s->'components','[]'::jsonb)) c),'[]'::jsonb)))
   from jsonb_array_elements(coalesce(p_snapshot#>'{academic,subjects}','[]'::jsonb)) s),'[]'::jsonb)),
 'journals',jsonb_build_object('count',p_snapshot#>'{journals,count}','excerpts',coalesce((select jsonb_agg(jsonb_build_object('content',j->'content','repertoire',j->'repertoire','skills',j->'skills','homework',j->'homework','observation',j->'observation','updated_at',j->'updated_at')) from jsonb_array_elements(coalesce(p_snapshot#>'{journals,excerpts}','[]'::jsonb)) j),'[]'::jsonb)),
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('code',t->'code','name',t->'name','role',t->'role')) from jsonb_array_elements(coalesce(p_snapshot->'teachers','[]'::jsonb)) t),'[]'::jsonb))
$$;

create function public.student_approved_reports(p_student uuid,p_limit integer default 50,p_offset integer default 0)
returns table(report_id uuid,report_type text,period_start date,period_end date,approved_at timestamptz,snapshot jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
 select r.id,r.report_type,r.period_start,r.period_end,r.approved_at,public.public_report_snapshot(r.snapshot_data)
 from public.learning_reports r where r.student_id=p_student and r.status='APPROVED'
 and public.can_read_student_history(r.student_id,r.branch_id,'learning_reports')
 order by r.period_end desc,r.id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0))
$$;

create function public.student_debt_history(p_student uuid,p_limit integer default 50,p_offset integer default 0)
returns table(invoice_id uuid,invoice_number text,currency text,total_amount numeric,allocated_amount numeric,outstanding_balance numeric,receivable_status text,issued_on date,due_on date)
language sql stable security definer set search_path=public,pg_temp as $$
 select r.invoice_id,r.invoice_number,r.currency,r.total_amount,r.allocated_amount,r.outstanding_balance,r.receivable_status,r.issued_on,r.due_on
 from public.invoice_receivables r where r.student_id_snapshot=p_student and r.invoice_status='ISSUED'
 and public.can_read_student_history(r.student_id_snapshot,r.branch_id_snapshot,'tuition')
 order by r.issued_on desc,r.invoice_id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0))
$$;

revoke all on function public.public_report_snapshot(jsonb) from public,anon,authenticated;
revoke all on function public.can_read_student_history(uuid,uuid,text),public.student_attendance_history(uuid,integer,integer),public.student_approved_reports(uuid,integer,integer),public.student_debt_history(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.can_read_student_history(uuid,uuid,text),public.student_attendance_history(uuid,integer,integer),public.student_approved_reports(uuid,integer,integer),public.student_debt_history(uuid,integer,integer) to authenticated;
