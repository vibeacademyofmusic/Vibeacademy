-- Session assignments override the existing class primary assignment; completed snapshots never drift.
create table public.session_teacher_assignments (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.session_occurrences(id),
 teacher_id uuid not null references public.teachers(id),
 assignment_type text not null check (assignment_type in ('PRIMARY','SUBSTITUTE','OVERRIDE')),
 reason text not null check (char_length(btrim(reason)) between 1 and 2000),
 assigned_by uuid references auth.users(id),
 assigned_at timestamptz not null default now(),
 effective_status text not null default 'ACTIVE' check (effective_status in ('ACTIVE','REPLACED')),
 replaced_by uuid references auth.users(id),
 replaced_at timestamptz,
 replacement_reason text
);
create unique index session_teacher_one_active on public.session_teacher_assignments(session_id) where effective_status='ACTIVE';
create index session_teacher_history on public.session_teacher_assignments(session_id,assigned_at desc);
create table public.session_teacher_snapshots (
 session_id uuid primary key references public.session_occurrences(id),
 teacher_id uuid references public.teachers(id),
 assignment_type text,
 assignment_id uuid references public.session_teacher_assignments(id),
 captured_at timestamptz not null default now()
);
alter table public.session_teacher_assignments enable row level security;
alter table public.session_teacher_snapshots enable row level security;
revoke all on public.session_teacher_assignments,public.session_teacher_snapshots from anon,authenticated;
grant select on public.session_teacher_assignments,public.session_teacher_snapshots to authenticated;
create policy session_teacher_admin on public.session_teacher_assignments for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy session_teacher_snapshot_admin on public.session_teacher_snapshots for select to authenticated using(public.has_role('SUPER_ADMIN'));

create view public.session_actual_teachers with(security_invoker=true) as
select o.id session_id,sc.class_id,c.branch_id,o.occurrence_date,o.starts_at,o.ends_at,o.status,o.schedule_id,o.room_id,o.notes,o.occurrence_type,o.source_occurrence_id,
 primary_teacher.teacher_id primary_teacher_id,
 case when snap.session_id is not null then snap.teacher_id else coalesce(a.teacher_id,primary_teacher.teacher_id) end teacher_id,
 case when snap.session_id is not null then snap.assignment_type else coalesce(a.assignment_type,'PRIMARY') end assignment_type,
 a.reason,a.assigned_by,a.assigned_at,
 snap.session_id is not null is_locked
from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id join public.classes c on c.id=sc.class_id
left join public.session_teacher_assignments a on a.session_id=o.id and a.effective_status='ACTIVE'
left join public.session_teacher_snapshots snap on snap.session_id=o.id
left join lateral (
 select (array_agg(ct.teacher_id))[1] teacher_id from public.class_teachers ct
 where ct.class_id=c.id and ct.teacher_role='PRIMARY' and ct.assigned_at<=o.occurrence_date
 and (ct.ended_at is null or ct.ended_at>=o.occurrence_date) and (ct.is_active or ct.ended_at is not null)
 having count(*)=1
) primary_teacher on true;
grant select on public.session_actual_teachers to authenticated;

create function public.set_session_teacher(p_session_id uuid,p_teacher_id uuid,p_type text,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare s record;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 select o.status,c.branch_id into s from session_occurrences o join schedules sc on sc.id=o.schedule_id join classes c on c.id=sc.class_id where o.id=p_session_id for update of o;
 if not found then raise exception 'Session not found'; end if;
 if s.status<>'SCHEDULED' or exists(select 1 from session_teacher_snapshots where session_id=p_session_id) then raise exception 'Completed or cancelled session assignment is locked'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Assignment reason required'; end if;
 if p_teacher_id is not null then
   if p_type is null or p_type not in ('PRIMARY','SUBSTITUTE','OVERRIDE') then raise exception 'Invalid assignment type'; end if;
   if not exists(select 1 from teachers where id=p_teacher_id and status='ACTIVE') then raise exception 'Teacher must be active'; end if;
   if not exists(select 1 from teacher_branches where teacher_id=p_teacher_id and branch_id=s.branch_id) then raise exception 'Teacher must belong to session branch'; end if;
 end if;
 update session_teacher_assignments set effective_status='REPLACED',replaced_at=now(),replaced_by=auth.uid(),replacement_reason=btrim(p_reason) where session_id=p_session_id and effective_status='ACTIVE';
 if p_teacher_id is not null then
 insert into session_teacher_assignments(session_id,teacher_id,assignment_type,reason,assigned_by) values(p_session_id,p_teacher_id,p_type,btrim(p_reason),auth.uid());
 end if;
end $$;

create function public.capture_session_teacher() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='COMPLETED' then
 insert into session_teacher_snapshots(session_id,teacher_id,assignment_type,assignment_id)
 select v.session_id,v.teacher_id,v.assignment_type,a.id from session_actual_teachers v
 left join session_teacher_assignments a on a.session_id=v.session_id and a.effective_status='ACTIVE'
 where v.session_id=new.id on conflict(session_id) do nothing;
 end if;
 return new;
end $$;
create trigger capture_session_teacher after insert or update of status on public.session_occurrences for each row execute function public.capture_session_teacher();
-- Historical completed sessions are explicitly locked, including those with unresolved teachers.
insert into public.session_teacher_snapshots(session_id,teacher_id,assignment_type,assignment_id)
select v.session_id,v.teacher_id,v.assignment_type,a.id from public.session_actual_teachers v
left join public.session_teacher_assignments a on a.session_id=v.session_id and a.effective_status='ACTIVE' where v.status='COMPLETED';

create function public.guard_session_teacher_history() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_table_name='session_teacher_snapshots' or tg_op='DELETE' then raise exception 'Session teacher history is immutable'; end if;
 if old.effective_status<>'ACTIVE' or new.effective_status<>'REPLACED' or
 (to_jsonb(new)-array['effective_status','replaced_at','replaced_by','replacement_reason']) is distinct from (to_jsonb(old)-array['effective_status','replaced_at','replaced_by','replacement_reason']) then raise exception 'Session teacher history is immutable'; end if;
 return new;
end $$;
create trigger guard_session_teacher_history before update or delete on public.session_teacher_assignments for each row execute function public.guard_session_teacher_history();
create trigger guard_session_teacher_snapshot before update or delete on public.session_teacher_snapshots for each row execute function public.guard_session_teacher_history();
create view public.learning_journal_teachers with(security_invoker=true) as
select j.id journal_id,v.session_id,v.teacher_id,v.assignment_type from public.learning_journals j join public.attendance_records a on a.id=j.attendance_record_id join public.session_actual_teachers v on v.session_id=a.session_occurrence_id;
grant select on public.learning_journal_teachers to authenticated;
revoke all on function public.set_session_teacher(uuid,uuid,text,text),public.capture_session_teacher(),public.guard_session_teacher_history() from public,anon,authenticated;
grant execute on function public.set_session_teacher(uuid,uuid,text,text) to authenticated;

create or replace function public.submit_lesson_feedback(p_session_id uuid,p_student_id uuid,p_respondent_type text,p_overall integer,
 p_quality integer default null,p_communication integer default null,p_progress integer default null,p_comment text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare c record; t record; result uuid; low boolean;
begin
 if auth.uid() is null then raise exception 'Unauthorized'; end if;
 if p_respondent_type='STUDENT' then
   if not exists(select 1 from students where id=p_student_id and user_id=auth.uid()) then raise exception 'Invalid respondent relationship'; end if;
 elsif p_respondent_type='PARENT' then
   if not exists(select 1 from parents p join student_parents sp on sp.parent_id=p.id where p.user_id=auth.uid() and p.status='ACTIVE' and sp.student_id=p_student_id) then raise exception 'Invalid respondent relationship'; end if;
 else raise exception 'Invalid respondent type'; end if;
 if p_overall is null or p_overall not between 1 and 5 or p_quality not between 1 and 5 or p_communication not between 1 and 5 or p_progress not between 1 and 5 or p_comment is null or char_length(p_comment)>4000 then raise exception 'Invalid ratings or comment'; end if;
 select o.id,o.starts_at,o.ends_at,o.occurrence_date,sc.class_id,cl.name class_name,cl.branch_id,b.name branch_name,
   e.id enrollment_id,s.full_name student_name,s.student_code
 into c from session_occurrences o join schedules sc on sc.id=o.schedule_id join classes cl on cl.id=sc.class_id
 join branches b on b.id=cl.branch_id join enrollments e on e.class_id=cl.id and e.student_id=p_student_id
 join students s on s.id=e.student_id join attendance_records a on a.enrollment_id=e.id and a.session_occurrence_id=o.id
 where o.id=p_session_id and o.status='COMPLETED' and o.ends_at<=now() and a.status in ('PRESENT','LATE');
 if not found then raise exception 'Session is not eligible for feedback'; end if;
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
