-- Raw feedback is private to SUPER_ADMIN. Submission authorization uses actual relationships.
create function public.lesson_feedback_low_threshold() returns integer language sql immutable set search_path=public as $$ select 2 $$;
create table public.lesson_feedback (
 id uuid primary key default gen_random_uuid(),
 session_occurrence_id uuid not null references public.session_occurrences(id),
 enrollment_id uuid not null references public.enrollments(id),
 student_id uuid not null references public.students(id),
 respondent_user_id uuid not null references auth.users(id),
 respondent_type text not null check(respondent_type in ('STUDENT','PARENT')),
 teacher_id uuid not null references public.teachers(id),
 branch_id uuid not null references public.branches(id),
 context_snapshot jsonb not null,
 session_starts_at timestamptz not null,
 overall_rating smallint not null check(overall_rating between 1 and 5),
 lesson_quality_rating smallint check(lesson_quality_rating between 1 and 5),
 teacher_communication_rating smallint check(teacher_communication_rating between 1 and 5),
 progress_perception_rating smallint check(progress_perception_rating between 1 and 5),
 comment text not null default '' check(char_length(comment)<=4000),
 is_low_rating boolean not null,
 resolution_status text not null check(resolution_status in ('NORMAL','NEEDS_REVIEW','IN_REVIEW','RESOLVED')),
 resolution_note text not null default '' check(char_length(resolution_note)<=4000),
 resolved_by uuid references auth.users(id),
 resolved_at timestamptz,
 submitted_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 version integer not null default 1,
 unique(session_occurrence_id,student_id,respondent_user_id,respondent_type),
 check ((resolution_status='RESOLVED') = (resolved_by is not null and resolved_at is not null))
);
create index lesson_feedback_list_idx on public.lesson_feedback(branch_id,session_starts_at desc,id);
create index lesson_feedback_teacher_idx on public.lesson_feedback(teacher_id,session_starts_at desc,id);
create index lesson_feedback_review_idx on public.lesson_feedback(resolution_status,session_starts_at desc,id);
create table public.lesson_feedback_events (
 id uuid primary key default gen_random_uuid(),
 feedback_id uuid not null references public.lesson_feedback(id),
 status text not null,
 note text not null,
 actor_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index lesson_feedback_events_lookup on public.lesson_feedback_events(feedback_id,created_at desc,id);
alter table public.lesson_feedback enable row level security;
alter table public.lesson_feedback_events enable row level security;
revoke all on public.lesson_feedback,public.lesson_feedback_events from anon,authenticated;
grant select on public.lesson_feedback,public.lesson_feedback_events to authenticated;
create policy feedback_admin_read on public.lesson_feedback for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy feedback_events_admin_read on public.lesson_feedback_events for select to authenticated using(public.has_role('SUPER_ADMIN'));

create function public.guard_lesson_feedback() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'Feedback history cannot be deleted'; end if;
 if (to_jsonb(new)-array['resolution_status','resolution_note','resolved_by','resolved_at','updated_at','version']) is distinct from
    (to_jsonb(old)-array['resolution_status','resolution_note','resolved_by','resolved_at','updated_at','version']) then raise exception 'Submitted feedback is immutable'; end if;
 new.version:=old.version+1; new.updated_at:=now(); return new;
end $$;
create trigger guard_lesson_feedback before update or delete on public.lesson_feedback for each row execute function public.guard_lesson_feedback();

create function public.submit_lesson_feedback(p_session_id uuid,p_student_id uuid,p_respondent_type text,p_overall integer,
 p_quality integer default null,p_communication integer default null,p_progress integer default null,p_comment text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare c record; t record; result uuid; low boolean; teacher_count integer;
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
 select count(*) into teacher_count from class_teachers where class_id=c.class_id and teacher_role='PRIMARY'
   and assigned_at<=c.occurrence_date and (ended_at is null or ended_at>=c.occurrence_date) and (is_active or ended_at is not null);
 if teacher_count<>1 then raise exception 'Session teacher is missing or ambiguous'; end if;
 select tr.id,tr.full_name,tr.teacher_code into t from class_teachers ct join teachers tr on tr.id=ct.teacher_id
 where ct.class_id=c.class_id and ct.teacher_role='PRIMARY' and ct.assigned_at<=c.occurrence_date
   and (ct.ended_at is null or ct.ended_at>=c.occurrence_date) and (ct.is_active or ct.ended_at is not null);
 low:=p_overall<=lesson_feedback_low_threshold();
 insert into lesson_feedback(session_occurrence_id,enrollment_id,student_id,respondent_user_id,respondent_type,teacher_id,branch_id,session_starts_at,
 context_snapshot,overall_rating,lesson_quality_rating,teacher_communication_rating,progress_perception_rating,comment,is_low_rating,resolution_status)
 values(c.id,c.enrollment_id,p_student_id,auth.uid(),p_respondent_type,t.id,c.branch_id,c.starts_at,
 jsonb_build_object('student_name',c.student_name,'student_code',c.student_code,'teacher_name',coalesce(t.full_name,t.teacher_code),'branch_name',c.branch_name,'class_name',c.class_name,
 'respondent_name',(select full_name from profiles where id=auth.uid()),'teacher_basis','CLASS_PRIMARY_AT_SUBMISSION'),
 p_overall,p_quality,p_communication,p_progress,btrim(p_comment),low,case when low then 'NEEDS_REVIEW' else 'NORMAL' end) returning id into result;
 return result;
end $$;

create function public.resolve_lesson_feedback(p_id uuid,p_version integer,p_status text,p_note text)
returns uuid language plpgsql security definer set search_path=public as $$
declare f lesson_feedback;
begin
 if not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 select * into f from lesson_feedback where id=p_id for update;
 if not found or f.version is distinct from p_version then raise exception 'Feedback changed; reload'; end if;
 if p_status is null or p_status not in ('IN_REVIEW','RESOLVED') or p_status=f.resolution_status or (f.resolution_status='RESOLVED' and p_status<>'IN_REVIEW') then raise exception 'Invalid resolution transition'; end if;
 if p_note is null or char_length(btrim(p_note)) not between 1 and 4000 then raise exception 'Resolution note required'; end if;
 update lesson_feedback set resolution_status=p_status,resolution_note=btrim(p_note),resolved_by=case when p_status='RESOLVED' then auth.uid() end,
 resolved_at=case when p_status='RESOLVED' then now() end where id=p_id;
 insert into lesson_feedback_events(feedback_id,status,note,actor_id) values(p_id,p_status,btrim(p_note),auth.uid());
 return p_id;
end $$;
create view public.lesson_feedback_teacher_monthly with(security_invoker=true) as
 select teacher_id,branch_id,date_trunc('month',session_starts_at at time zone 'Asia/Ho_Chi_Minh')::date as period_month,
 count(*) feedback_count,avg(overall_rating) average_overall_rating,avg(lesson_quality_rating) average_lesson_quality,
 avg(teacher_communication_rating) average_communication,avg(progress_perception_rating) average_progress_perception,
 count(*) filter(where is_low_rating) low_rating_count
 from public.lesson_feedback group by 1,2,3;
create view public.lesson_feedback_branch_monthly with(security_invoker=true) as
 select branch_id,date_trunc('month',session_starts_at at time zone 'Asia/Ho_Chi_Minh')::date as period_month,
 count(*) feedback_count,avg(overall_rating) average_overall_rating,count(*) filter(where is_low_rating) low_rating_count
 from public.lesson_feedback group by 1,2;
grant select on public.lesson_feedback_teacher_monthly,public.lesson_feedback_branch_monthly to authenticated;
revoke all on function public.lesson_feedback_low_threshold(),public.guard_lesson_feedback(),public.submit_lesson_feedback(uuid,uuid,text,integer,integer,integer,integer,text),public.resolve_lesson_feedback(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.submit_lesson_feedback(uuid,uuid,text,integer,integer,integer,integer,text),public.resolve_lesson_feedback(uuid,integer,text,text) to authenticated;
