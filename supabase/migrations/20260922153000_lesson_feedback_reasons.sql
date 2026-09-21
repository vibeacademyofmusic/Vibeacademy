-- Structured, immutable reason selections for an existing lesson feedback submission.
create table public.lesson_feedback_reasons (
 id uuid primary key default gen_random_uuid(),
 feedback_id uuid not null references public.lesson_feedback(id),
 reason_code text not null,
 reason_label text not null,
 created_at timestamptz not null default now(),
 unique (feedback_id, reason_code)
);
create index lesson_feedback_reasons_feedback_idx on public.lesson_feedback_reasons(feedback_id, reason_code);
alter table public.lesson_feedback_reasons enable row level security;
revoke all on public.lesson_feedback_reasons from anon, authenticated;
grant select on public.lesson_feedback_reasons to authenticated;
create policy feedback_reasons_admin_read on public.lesson_feedback_reasons
 for select to authenticated using (public.has_role('SUPER_ADMIN'));

create function public.guard_lesson_feedback_reasons() returns trigger
language plpgsql set search_path=public, pg_temp as $$
begin
 raise exception 'Submitted feedback is immutable';
end $$;
create trigger guard_lesson_feedback_reasons
 before update or delete on public.lesson_feedback_reasons
 for each row execute function public.guard_lesson_feedback_reasons();

drop function public.submit_lesson_feedback(uuid, uuid, text, integer, integer, integer, integer, text);

create function public.submit_lesson_feedback(
 p_session_id uuid,
 p_student_id uuid,
 p_respondent_type text,
 p_overall integer,
 p_quality integer default null,
 p_communication integer default null,
 p_progress integer default null,
 p_comment text default '',
 p_reasons text[] default '{}'
) returns uuid
language plpgsql security definer set search_path=public, pg_temp as $$
declare c record; t record; result uuid; low boolean; allowed text[];
begin
 if not public.account_is_active() then raise exception 'Unauthorized'; end if;
 if p_respondent_type='STUDENT' then
   if not exists(select 1 from students where id=p_student_id and user_id=auth.uid() and status='ACTIVE') then raise exception 'Invalid respondent relationship'; end if;
 elsif p_respondent_type='PARENT' then
   if not exists(select 1 from parents p join student_parents sp on sp.parent_id=p.id where p.user_id=auth.uid() and p.status='ACTIVE' and sp.student_id=p_student_id and sp.is_active and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now())) then raise exception 'Invalid respondent relationship'; end if;
 else raise exception 'Invalid respondent type'; end if;
 if p_overall is null or p_overall not between 1 and 5 or p_quality not between 1 and 5 or p_communication not between 1 and 5 or p_progress not between 1 and 5 or p_comment is null or char_length(p_comment)>4000 then raise exception 'Invalid ratings or comment'; end if;
 if p_reasons is null then p_reasons := '{}'; end if;
 if p_overall<=2 then
   allowed := array['CONTENT_UNCLEAR','PACE_INAPPROPRIATE','TEACHER_SUPPORT_INSUFFICIENT','SESSION_TIMING_ISSUE','CONTENT_BELOW_EXPECTATION'];
 elsif p_overall>=4 then
   allowed := array['TEACHER_CLEAR_GUIDANCE','CONTENT_APPROPRIATE','TEACHER_SUPPORTIVE','SESSION_ON_TIME','OVERALL_SATISFIED'];
 else
   allowed := array[]::text[];
 end if;
 if exists (select 1 from unnest(p_reasons) code group by code having count(*)>1)
    or exists (select 1 from unnest(p_reasons) code where code <> all(allowed)) then
   raise exception 'Unsupported feedback reason';
 end if;
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
 insert into lesson_feedback_reasons(feedback_id, reason_code, reason_label)
 select result, code, case code
   when 'TEACHER_CLEAR_GUIDANCE' then 'Giảng viên hướng dẫn dễ hiểu'
   when 'CONTENT_APPROPRIATE' then 'Nội dung buổi học phù hợp'
   when 'TEACHER_SUPPORTIVE' then 'Giảng viên tận tâm và hỗ trợ tốt'
   when 'SESSION_ON_TIME' then 'Buổi học diễn ra đúng giờ, đúng kế hoạch'
   when 'OVERALL_SATISFIED' then 'Tôi hài lòng với buổi học hôm nay'
   when 'CONTENT_UNCLEAR' then 'Nội dung buổi học chưa dễ hiểu'
   when 'PACE_INAPPROPRIATE' then 'Tiến độ buổi học chưa phù hợp'
   when 'TEACHER_SUPPORT_INSUFFICIENT' then 'Tôi chưa nhận được đủ sự hỗ trợ từ giảng viên'
   when 'SESSION_TIMING_ISSUE' then 'Buổi học chưa diễn ra đúng giờ hoặc đúng kế hoạch'
   when 'CONTENT_BELOW_EXPECTATION' then 'Nội dung buổi học chưa đúng kỳ vọng'
 end
 from unnest(p_reasons) as code;
 return result;
end $$;

revoke all on function public.submit_lesson_feedback(uuid,uuid,text,integer,integer,integer,integer,text,text[]) from public, anon, authenticated;
grant execute on function public.submit_lesson_feedback(uuid,uuid,text,integer,integer,integer,integer,text,text[]) to authenticated;
