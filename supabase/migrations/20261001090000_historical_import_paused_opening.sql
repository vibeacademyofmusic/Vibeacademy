-- Historical import records the trusted current pause and the opening enrollment
-- in one transaction. That is not a new placement of an already persisted learner.
-- A paused learner created in this transaction, including a pgTAP subtransaction,
-- may receive one opening ACTIVE enrollment; the importer then writes the current
-- pause. A later placement of a paused learner stays denied.
-- A membership that already ended before today has no remaining sessions to check.

create or replace function public.placement_schedule_check(p_class uuid,p_student uuid,p_start date,p_end date default null,p_exclude uuid default null)
returns text language plpgsql stable security definer set search_path=public,pg_temp as $$
declare horizon date; first_day date:=greatest(p_start,registration_vietnam_today()); result text;
begin
 if p_end is not null and p_end < registration_vietnam_today() then
   return 'CLEAR';
 end if;
 select greatest(first_day,
   (select max(start_date) from classes), (select max(end_date) from classes),
   (select max(effective_from) from schedules), (select max(effective_to) from schedules),
   (select max(assigned_at) from class_teachers), (select max(ended_at) from class_teachers),
   (select max((ends_at at time zone 'Asia/Ho_Chi_Minh')::date) from session_occurrences),
   (select max(started_at) from enrollments), (select max(ended_at) from enrollments),
   (select max(ends_on) from enrollment_pauses)) + 14 into horizon;
 horizon:=least(horizon,coalesce(p_end,horizon));
 if exists(select 1 from schedules s join classes c on c.id=s.class_id
   where s.status='ACTIVE' and s.timezone<>'Asia/Ho_Chi_Minh'
   and (c.branch_id=(select branch_id from classes where id=p_class)
     or exists(select 1 from enrollments e where e.class_id=c.id and e.student_id=p_student and e.status in ('ACTIVE','PAUSED')))) then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 if not exists(select 1 from placement_timetable(p_class,first_day,horizon) where not makeup) then
   return 'PLACEMENT_SCHEDULE_REQUIRED';
 end if;
 if exists(select 1 from placement_timetable(p_class,first_day,horizon) where teacher_id is null or room_id is null) then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 if exists(select 1 from enrollments e where e.student_id=p_student and e.id is distinct from p_exclude
   and e.class_id<>p_class and e.status in ('ACTIVE','PAUSED') and coalesce(e.ended_at,horizon)>=first_day
   and not exists(select 1 from placement_timetable(e.class_id,greatest(first_day,e.started_at),least(horizon,e.ended_at)))) then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 with target as materialized (select * from placement_timetable(p_class,first_day,horizon)),
 others as materialized (
   select c.id class_id,t.* from classes c
   cross join lateral placement_timetable(c.id,first_day,horizon) t
   where c.id<>p_class and c.status not in ('CANCELLED','COMPLETED')
 ), overlapping_slots as (
   select a.*,b.class_id other_class,b.session_id other_session,b.makeup other_makeup,
     b.room_id other_room,b.teacher_id other_teacher
   from target a join others b on a.starts_at<b.ends_at and b.starts_at<a.ends_at
 )
 select case
   when exists(select 1 from overlapping_slots where room_id=other_room) then 'PLACEMENT_ROOM_CONFLICT'
   when exists(select 1 from overlapping_slots where teacher_id=other_teacher) then 'PLACEMENT_TEACHER_CONFLICT'
   when exists(select 1 from overlapping_slots o join enrollments e on e.class_id=o.other_class
     where not o.makeup and e.student_id=p_student and e.id is distinct from p_exclude
       and e.status in ('ACTIVE','PAUSED')
       and (o.starts_at at time zone 'Asia/Ho_Chi_Minh')::date between coalesce(e.started_at,e.enrolled_at) and coalesce(e.ended_at,horizon)
       and not is_enrollment_paused_on(e.id,(o.starts_at at time zone 'Asia/Ho_Chi_Minh')::date)
       and (not o.other_makeup or exists(select 1 from session_occurrence_participants sp where sp.session_occurrence_id=o.other_session and sp.enrollment_id=e.id))) then 'PLACEMENT_STUDENT_CONFLICT'
   when exists(select 1 from target a join session_actual_teachers v on a.starts_at<v.ends_at and v.starts_at<a.ends_at
     join session_occurrence_participants sp on sp.session_occurrence_id=v.session_id
     join enrollments e on e.id=sp.enrollment_id
     where not a.makeup and v.class_id<>p_class and v.status<>'CANCELLED' and e.student_id=p_student) then 'PLACEMENT_STUDENT_CONFLICT'
   when exists(select 1 from overlapping_slots o join classes c on c.id=o.other_class
     where (o.other_room is null or o.other_teacher is null)
     and (c.branch_id=(select branch_id from classes where id=p_class)
       or exists(select 1 from enrollments e where e.class_id=c.id and e.student_id=p_student and e.status in ('ACTIVE','PAUSED')))) then 'PLACEMENT_SCHEDULE_UNKNOWN'
   when exists(select 1 from target a join target b on a.starts_at<b.ends_at and b.starts_at<a.ends_at
     and (a.session_id,a.starts_at)<(b.session_id,b.starts_at)
     where a.room_id=b.room_id or a.teacher_id=b.teacher_id or (not a.makeup and not b.makeup)) then 'PLACEMENT_SCHEDULE_UNKNOWN'
   else 'CLEAR' end into result;
 return result;
end $$;

create or replace function public.guard_placement_enrollment_integrity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c classes%rowtype; code text; opening_paused boolean;
begin
 if tg_op='UPDATE' then
   if new.class_id is distinct from old.class_id or new.student_id is distinct from old.student_id then
     if coalesce(old.started_at,old.enrolled_at)<=registration_vietnam_today() or placement_learning_history_exists(old.id) then
       raise exception 'PLACEMENT_HISTORY_LOCKED';
     end if;
   end if;
   if (new.class_id,new.student_id,new.started_at,new.status) is not distinct from (old.class_id,old.student_id,old.started_at,old.status) then return new; end if;
   if new.status='PAUSED' and old.status='ACTIVE' and new.class_id=old.class_id and new.student_id=old.student_id and new.started_at is not distinct from old.started_at then return new; end if;
 end if;
 if new.status not in ('ACTIVE','PAUSED') then return new; end if;
 select * into c from classes where id=new.class_id for update;
 perform 1 from students where id=new.student_id for update;
 if c.id is null or c.status<>'ACTIVE' then raise exception 'PLACEMENT_CLASS_DENIED'; end if;
 if new.started_at is null or (c.start_date is not null and new.started_at<c.start_date) or (c.end_date is not null and new.started_at>c.end_date) then raise exception 'PLACEMENT_START_DENIED'; end if;
 opening_paused := tg_op='INSERT'
   and new.status='ACTIVE'
   and exists(
     select 1 from students learner
     where learner.id=new.student_id
       and learner.status='PAUSED'
       and learner.default_branch_id is not distinct from c.branch_id
       and learner.xmin::text::bigint >= txid_current()
   )
   and not exists(
     select 1 from enrollments existing
     where existing.student_id=new.student_id and existing.id<>new.id
   );
 if not opening_paused and exists(select 1 from students where id=new.student_id and (status<>'ACTIVE' or default_branch_id is distinct from c.branch_id)) then
   raise exception 'PLACEMENT_CLASS_DENIED';
 end if;
 if exists(select 1 from enrollments where class_id=c.id and student_id=new.student_id and id<>new.id and status in ('ACTIVE','PAUSED')) then raise exception 'PLACEMENT_ALREADY_ENROLLED'; end if;
 if (select count(*) from enrollments where class_id=c.id and id<>new.id and status in ('ACTIVE','PAUSED'))>=c.capacity then raise exception 'PLACEMENT_CLASS_FULL'; end if;
 code:=class_enrollment_compatibility(c.id,new.student_id);
 if code<>'IN_SCOPE' then raise exception 'PLACEMENT_LEVEL_DENIED'; end if;
 code:=placement_schedule_check(c.id,new.student_id,new.started_at,new.ended_at,new.id);
 if code<>'CLEAR' then raise exception '%',code; end if;
 return new;
end $$;
