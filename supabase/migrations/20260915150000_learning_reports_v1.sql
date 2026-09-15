-- Reports are derived documents. They never mutate attendance or Academic progress.
create table public.learning_reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  enrollment_id uuid not null references public.enrollments(id),
  curriculum_enrollment_id uuid references public.student_curriculum_enrollments(id),
  branch_id uuid not null references public.branches(id),
  report_type text not null check (report_type in ('MONTHLY','END_OF_COURSE')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY_FOR_REVIEW','APPROVED','CANCELLED')),
  version integer not null default 1 check (version > 0),
  draft_data jsonb not null,
  snapshot_data jsonb,
  teacher_summary jsonb not null default '{}' check (jsonb_typeof(teacher_summary) = 'object' and octet_length(teacher_summary::text) <= 20000),
  admin_note text not null default '' check (char_length(admin_note) <= 4000),
  generated_at timestamptz not null default now(),
  generated_by uuid not null references auth.users(id),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  sent_at timestamptz check (sent_at is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(enrollment_id, report_type, period_start, period_end),
  check ((status = 'APPROVED') = (snapshot_data is not null and approved_at is not null and approved_by is not null))
);
create index learning_reports_list_idx on public.learning_reports(branch_id, period_start desc, id);
create index learning_reports_student_idx on public.learning_reports(student_id, period_start desc);
create table public.learning_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.learning_reports(id),
  event text not null,
  version integer not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.learning_reports enable row level security;
alter table public.learning_report_events enable row level security;
revoke all on public.learning_reports, public.learning_report_events from anon, authenticated;
grant select on public.learning_reports, public.learning_report_events to authenticated;
create policy report_admin_read on public.learning_reports for select to authenticated using (public.has_role('SUPER_ADMIN'));
create policy report_event_admin_read on public.learning_report_events for select to authenticated using (public.has_role('SUPER_ADMIN'));

create function public.guard_learning_report() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'DELETE' or old.status in ('APPROVED','CANCELLED') then raise exception 'Report is immutable'; end if;
  if (new.student_id,new.enrollment_id,new.curriculum_enrollment_id,new.branch_id,new.report_type,new.period_start,new.period_end)
    is distinct from (old.student_id,old.enrollment_id,old.curriculum_enrollment_id,old.branch_id,old.report_type,old.period_start,old.period_end)
    then raise exception 'Report identity is immutable'; end if;
  return new;
end $$;
create trigger guard_learning_report before update or delete on public.learning_reports for each row execute function public.guard_learning_report();

-- One SQL statement supplies a consistent source snapshot. Progress is as-of generation,
-- not reconstructed historic progress. Journal excerpts are bounded and labelled in UI.
create function public.learning_report_source(p_enrollment_id uuid,p_start date,p_end date)
returns jsonb language sql stable security definer set search_path=public as $$
with context as (
  select e.*, s.full_name,s.student_code,c.branch_id,c.name class_name,b.name branch_name
  from enrollments e join students s on s.id=e.student_id join classes c on c.id=e.class_id join branches b on b.id=c.branch_id
  where e.id=p_enrollment_id
), sessions as (
  select o.id,o.occurrence_type,a.id attendance_id,a.status attendance_status
  from context e join schedules sc on sc.class_id=e.class_id join session_occurrences o on o.schedule_id=sc.id
  left join attendance_records a on a.session_occurrence_id=o.id and a.enrollment_id=e.id
  where o.status <> 'CANCELLED'
    and o.starts_at >= (p_start::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and o.starts_at < ((p_end+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and (a.id is not null or
      (o.occurrence_type='MAKEUP' and exists(select 1 from session_occurrence_participants sp where sp.session_occurrence_id=o.id and sp.enrollment_id=e.id)) or
      (o.occurrence_type='REGULAR' and e.started_at <= o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
        and not exists(select 1 from enrollment_pauses ep where ep.enrollment_id=e.id and ep.status='ACTIVE' and o.occurrence_date between ep.starts_on and ep.ends_on)))
), journal_rows as (
  select j.content,j.repertoire,j.skills,j.homework,j.observation,j.updated_at
  from sessions s join learning_journals j on j.attendance_record_id=s.attendance_id
), subjects as (
  select l.name grade,lp.status grade_status,cs.name,cs.is_required,cs.completion_rule,
    coalesce(sp.status,'NOT_STARTED') status,sp.score,
    coalesce((select jsonb_agg(jsonb_build_object('name',cc.name,'required',cc.is_required,'status',coalesce(cp.status,'NOT_STARTED'),'score',cp.score) order by cc.sort_order,cc.id)
      from curriculum_subject_components cc left join student_component_progress cp on cp.component_id=cc.id and cp.subject_progress_id=sp.id
      where cc.subject_id=cs.id and cc.status='ACTIVE' and cs.completion_rule='ALL_REQUIRED_COMPONENTS'),'[]'::jsonb) components
  from context e join student_level_progress lp on lp.enrollment_id=e.student_curriculum_enrollment_id
  join curriculum_levels l on l.id=lp.level_id
  join curriculum_subjects cs on cs.level_id=l.id and cs.status='ACTIVE'
  left join student_subject_progress sp on sp.subject_id=cs.id and sp.level_progress_id=lp.id
)
select jsonb_build_object(
 'schema_version',1,'as_of',now(),'period_start',p_start,'period_end',p_end,
 'student',jsonb_build_object('id',e.student_id,'name',e.full_name,'code',e.student_code),
 'branch',jsonb_build_object('id',e.branch_id,'name',e.branch_name),'class_name',e.class_name,
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('code',t.teacher_code,'name',p.full_name,'role',ct.teacher_role) order by t.teacher_code)
   from class_teachers ct join teachers t on t.id=ct.teacher_id left join profiles p on p.id=t.user_id
   where ct.class_id=e.class_id and ct.assigned_at<=p_end and (ct.ended_at is null or ct.ended_at>=p_start)),'[]'::jsonb),
 'academic',jsonb_build_object('curriculum',cu.name,'current_grade',cl.name,'status',ce.status,
   'subjects',coalesce((select jsonb_agg(to_jsonb(s) order by s.grade,s.name) from subjects s),'[]'::jsonb)),
 'attendance',(select jsonb_build_object('scheduled',count(*),'attended',count(*) filter(where attendance_status in ('PRESENT','LATE')),
   'absent',count(*) filter(where attendance_status='ABSENT'),'excused',count(*) filter(where attendance_status='EXCUSED'),
   'unmarked',count(*) filter(where attendance_status is null),'makeup',count(*) filter(where occurrence_type='MAKEUP'),
   'rate',round(100.0 * count(*) filter(where attendance_status in ('PRESENT','LATE')) / nullif(count(*) filter(where attendance_status is not null),0),1)) from sessions),
 'journals',jsonb_build_object('count',(select count(*) from journal_rows),'excerpts',coalesce((select jsonb_agg(to_jsonb(j)) from (select * from journal_rows order by updated_at desc limit 30) j),'[]'::jsonb))
) from context e left join student_curriculum_enrollments ce on ce.id=e.student_curriculum_enrollment_id
left join curriculums cu on cu.id=ce.curriculum_id left join curriculum_levels cl on cl.id=ce.current_level_id;
$$;

create function public.generate_learning_report(p_enrollment_id uuid,p_type text,p_start date,p_end date)
returns uuid language plpgsql security definer set search_path=public as $$
declare e enrollments; r learning_reports; result uuid; payload jsonb;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 if p_type is null or p_type not in ('MONTHLY','END_OF_COURSE') or p_start is null or p_end is null or p_end<p_start
   or p_end >= (now() at time zone 'Asia/Ho_Chi_Minh')::date or p_end-p_start>3660 then raise exception 'Invalid closed report period'; end if;
 if p_type='MONTHLY' and (p_start<>date_trunc('month',p_start)::date or p_end<>(p_start+interval '1 month'-interval '1 day')::date) then raise exception 'Monthly report requires a full calendar month'; end if;
 select * into e from enrollments where id=p_enrollment_id for update;
 if not found or e.started_at is null or e.started_at>p_end or (e.ended_at is not null and e.ended_at<p_start) then raise exception 'Enrollment does not overlap period'; end if;
 select * into r from learning_reports where enrollment_id=p_enrollment_id and report_type=p_type and period_start=p_start and period_end=p_end;
 if found then return r.id; end if; -- Idempotent; regeneration is a separate explicit action.
 payload:=learning_report_source(p_enrollment_id,p_start,p_end);
 insert into learning_reports(student_id,enrollment_id,curriculum_enrollment_id,branch_id,report_type,period_start,period_end,draft_data,generated_by)
 values(e.student_id,e.id,e.student_curriculum_enrollment_id,(payload->'branch'->>'id')::uuid,p_type,p_start,p_end,payload,auth.uid()) returning id into result;
 insert into learning_report_events(report_id,event,version,actor_id) values(result,'GENERATED',1,auth.uid());
 return result;
end $$;

create function public.update_learning_report(p_id uuid,p_version integer,p_action text,p_summary jsonb default '{}'::jsonb,p_note text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare r learning_reports; new_data jsonb;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 select * into r from learning_reports where id=p_id for update;
 if not found or r.version is distinct from p_version then raise exception 'Report changed; reload'; end if;
 if r.status in ('APPROVED','CANCELLED') then raise exception 'Report is immutable'; end if;
 if p_action='SAVE' and r.status='DRAFT' then
   if p_summary is null or jsonb_typeof(p_summary)<>'object' or p_note is null then raise exception 'Invalid summary'; end if;
   if exists(select 1 from jsonb_each(p_summary) x where x.key not in ('general_comment','strengths','improvement_areas','next_focus','recommendation') or jsonb_typeof(x.value)<>'string' or char_length(x.value#>>'{}')>4000) then raise exception 'Invalid summary'; end if;
   update learning_reports set teacher_summary=p_summary,admin_note=p_note where id=p_id;
 elsif p_action='REGENERATE' and r.status='DRAFT' then
   if not exists(select 1 from enrollments e join classes c on c.id=e.class_id where e.id=r.enrollment_id and e.student_id=r.student_id and c.branch_id=r.branch_id and e.student_curriculum_enrollment_id is not distinct from r.curriculum_enrollment_id) then
     raise exception 'Report context changed; cannot regenerate';
   end if;
   new_data:=learning_report_source(r.enrollment_id,r.period_start,r.period_end);
   update learning_reports set draft_data=new_data,generated_at=now(),generated_by=auth.uid() where id=p_id;
 elsif p_action='READY' and r.status='DRAFT' then
   update learning_reports set status='READY_FOR_REVIEW' where id=p_id;
 elsif p_action='APPROVE' and r.status='READY_FOR_REVIEW' then
   -- Freeze exactly the reviewed draft; never silently refresh sources at approval.
   update learning_reports set status='APPROVED',snapshot_data=r.draft_data || jsonb_build_object('teacher_summary',r.teacher_summary,'admin_note',r.admin_note),approved_at=now(),approved_by=auth.uid() where id=p_id;
 elsif p_action='RETURN' and r.status='READY_FOR_REVIEW' then
   update learning_reports set status='DRAFT' where id=p_id;
 elsif p_action='CANCEL' then
   update learning_reports set status='CANCELLED' where id=p_id;
 else raise exception 'Invalid report transition'; end if;
 -- Single update above can make a report immutable; stamp version in the same BEFORE trigger instead.
 insert into learning_report_events(report_id,event,version,actor_id) values(p_id,p_action,r.version+1,auth.uid());
 return p_id;
end $$;
create function public.stamp_learning_report() returns trigger language plpgsql set search_path=public as $$
begin new.version:=old.version+1; new.updated_at:=now(); return new; end $$;
create trigger stamp_learning_report before update on public.learning_reports for each row execute function public.stamp_learning_report();
revoke all on function public.learning_report_source(uuid,date,date),public.generate_learning_report(uuid,text,date,date),public.update_learning_report(uuid,integer,text,jsonb,text),public.guard_learning_report(),public.stamp_learning_report() from public, anon, authenticated;
grant execute on function public.generate_learning_report(uuid,text,date,date),public.update_learning_report(uuid,integer,text,jsonb,text) to authenticated;

-- List fields remain snapshot-derived, including names after approval.
create view public.learning_report_list with (security_invoker=true) as
select id,student_id,enrollment_id,branch_id,report_type,status,period_start,period_end,generated_at,approved_at,
  coalesce(snapshot_data,draft_data)->'student'->>'name' student_name,
  coalesce(snapshot_data,draft_data)->'student'->>'code' student_code,
  coalesce(snapshot_data,draft_data)->'branch'->>'name' branch_name
from public.learning_reports;
grant select on public.learning_report_list to authenticated;
create index learning_report_events_report_idx on public.learning_report_events(report_id,created_at desc,id);
