-- Owner confirmed: excused makeup retains the same entitlement, with booking history.
alter table public.session_occurrence_participants
  add column booking_status text not null default 'ACTIVE' check (booking_status in ('ACTIVE','CANCELLED','RELEASED')),
  add column booking_closed_at timestamptz,
  add column booking_close_reason text;
drop index public.session_occurrence_participants_credit_idx;
create unique index session_occurrence_participants_credit_idx
  on public.session_occurrence_participants(makeup_credit_id)
  where makeup_credit_id is not null and booking_status = 'ACTIVE';

create function public.release_excused_makeup_credit(p_occurrence uuid, p_enrollment uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.makeup_credits%rowtype;
begin
  for c in select * from public.makeup_credits
    where reserved_occurrence_id=p_occurrence and enrollment_id=p_enrollment and status='RESERVED'
    for update
  loop
    update public.session_occurrence_participants
    set booking_status='RELEASED', booking_closed_at=clock_timestamp(), booking_close_reason='EXCUSED'
    where session_occurrence_id=p_occurrence and makeup_credit_id=c.id and booking_status='ACTIVE';
    update public.makeup_credits set status='AVAILABLE', reserved_occurrence_id=null,
      reserved_at=null,used_at=null,cancelled_at=null where id=c.id and status='RESERVED' and reserved_occurrence_id=p_occurrence;
    if not found then continue; end if;
    insert into public.academic_operation_exceptions(kind,enrollment_id,source_id,actor_id,note,payload)
    select 'MAKEUP_CREDIT_RELEASED',c.enrollment_id,c.id,auth.uid(),'Nghỉ có phép đã xác nhận: trả lại chính quyền học bù đã đặt.',
      jsonb_build_object('occurrence_id',p_occurrence,'reason','EXCUSED','credit_id',c.id)
    where not exists (
      select 1 from public.academic_operation_exceptions existing
      where existing.kind='MAKEUP_CREDIT_RELEASED' and existing.source_id=c.id
        and existing.payload->>'occurrence_id'=p_occurrence::text
    );
  end loop;
end $$;
revoke all on function public.release_excused_makeup_credit(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sync_makeup_credits_from_session_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.occurrence_type = 'REGULAR' and new.status = 'COMPLETED' then
    insert into public.makeup_credits (enrollment_id, source_occurrence_id, source_attendance_record_id, source_reason, status)
    select attendance.enrollment_id, new.id, attendance.id, 'EXCUSED', 'AVAILABLE'
    from public.attendance_records attendance
    where attendance.session_occurrence_id = new.id
      and attendance.status = 'EXCUSED'
      and not exists(select 1 from public.absence_reports r where r.attendance_record_id=attendance.id and r.confirmation <> 'EXCUSED')
      and exists(select 1 from public.enrollments e join public.schedules sc on sc.class_id=e.class_id
        where e.id=attendance.enrollment_id and sc.id=new.schedule_id
          and coalesce(e.started_at,e.enrolled_at)<=new.occurrence_date
          and (e.ended_at is null or e.ended_at>=new.occurrence_date))
      and not public.is_enrollment_paused_on(attendance.enrollment_id, new.occurrence_date)
    on conflict (source_occurrence_id, enrollment_id) do update
    set source_attendance_record_id = excluded.source_attendance_record_id,
      source_reason = 'EXCUSED', status = 'AVAILABLE',
      reserved_occurrence_id = null, reserved_at = null, used_at = null, cancelled_at = null
    where public.makeup_credits.status in ('AVAILABLE', 'CANCELLED');
    return new;
  end if;

  if new.occurrence_type = 'REGULAR' and new.status = 'CANCELLED' then
    insert into public.makeup_credits (enrollment_id, source_occurrence_id, source_attendance_record_id, source_reason, status)
    select enrollment.id, new.id, null, 'SESSION_CANCELLED', 'AVAILABLE'
    from public.schedules schedule
    join public.enrollments enrollment on enrollment.class_id = schedule.class_id
    where schedule.id = new.schedule_id
      and coalesce(enrollment.started_at, enrollment.enrolled_at) <= new.occurrence_date
      and (enrollment.ended_at is null or enrollment.ended_at >= new.occurrence_date)
      and not public.is_enrollment_paused_on(enrollment.id, new.occurrence_date)
    on conflict (source_occurrence_id, enrollment_id) do update
    set source_attendance_record_id = null, source_reason = 'SESSION_CANCELLED', status = 'AVAILABLE',
      reserved_occurrence_id = null, reserved_at = null, used_at = null, cancelled_at = null
    where public.makeup_credits.status in ('AVAILABLE', 'CANCELLED');
    return new;
  end if;

  if new.occurrence_type = 'REGULAR' and new.status = 'SCHEDULED' and old.status in ('COMPLETED', 'CANCELLED') then
    update public.makeup_credits
    set status = 'CANCELLED', reserved_occurrence_id = null, reserved_at = null, used_at = null, cancelled_at = now()
    where source_occurrence_id = new.id and status = 'AVAILABLE';
    return new;
  end if;

  if new.occurrence_type = 'MAKEUP' and new.status = 'COMPLETED' then
    perform public.release_excused_makeup_credit(new.id,a.enrollment_id)
    from public.attendance_records a
    where a.session_occurrence_id=new.id and a.status='EXCUSED'
      and not exists(select 1 from public.absence_reports r where r.attendance_record_id=a.id and r.confirmation <> 'EXCUSED');
    update public.makeup_credits credit
    set status = 'USED', used_at = coalesce(credit.used_at, now())
    where credit.reserved_occurrence_id = new.id and credit.status = 'RESERVED'
      and exists (
        select 1 from public.attendance_records attendance
        where attendance.session_occurrence_id = new.id
          and attendance.enrollment_id = credit.enrollment_id
          and attendance.status = 'PRESENT'
      );
    insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, note, payload)
    select 'MAKEUP_COMPLETED_WITHOUT_PRESENT', credit.enrollment_id, credit.id,
      'Buổi bù đã chốt nhưng chưa có điểm danh có mặt. Quyền vẫn là đã đặt, không tự thu và không tự xóa.',
      jsonb_build_object('occurrence_id', new.id)
    from public.makeup_credits credit
    where credit.reserved_occurrence_id = new.id and credit.status = 'RESERVED'
      and not exists (
        select 1 from public.academic_operation_exceptions existing
        where existing.kind = 'MAKEUP_COMPLETED_WITHOUT_PRESENT' and existing.source_id = credit.id
      );
    return new;
  end if;

  if new.occurrence_type = 'MAKEUP' and new.status = 'CANCELLED' then
    update public.session_occurrence_participants set booking_status='RELEASED',booking_closed_at=clock_timestamp(),booking_close_reason='SESSION_CANCELLED'
    where session_occurrence_id=new.id and booking_status='ACTIVE';
    update public.makeup_credits
    set status = 'AVAILABLE', reserved_occurrence_id = null, reserved_at = null, used_at = null, cancelled_at = null
    where reserved_occurrence_id = new.id and status = 'RESERVED';
    return new;
  end if;

  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.reserve_makeup_credit_for_participant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_occurrence_type text;
  v_occurrence_status text;
  v_makeup_class_id uuid;
  v_credit_id uuid;
begin
  if new.booking_status <> 'ACTIVE' then raise exception 'New makeup booking must be active'; end if;
  select occurrence.occurrence_type, occurrence.status, schedule.class_id
  into v_occurrence_type, v_occurrence_status, v_makeup_class_id
  from public.session_occurrences occurrence
  join public.schedules schedule on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id for update of occurrence;

  if v_occurrence_type is distinct from 'MAKEUP' then
    raise exception 'Makeup credit can only be reserved for a makeup session' using errcode = 'P0001';
  end if;
  if v_occurrence_status is distinct from 'SCHEDULED' then
    raise exception 'Students can only be added to a scheduled makeup session' using errcode = 'P0001';
  end if;

  if new.makeup_credit_id is not null then
    select credit.id into v_credit_id
    from public.makeup_credits credit
    where credit.id = new.makeup_credit_id
      and credit.enrollment_id = new.enrollment_id
      and credit.status = 'AVAILABLE'
    for update;
    if v_credit_id is null then
      raise exception 'Quyền học bù không còn dùng được.' using errcode = 'P0001';
    end if;
    update public.makeup_credits
    set status = 'RESERVED', reserved_occurrence_id = new.session_occurrence_id, reserved_at = now(), used_at = null, cancelled_at = null
    where id = v_credit_id and status = 'AVAILABLE';
    if not found then
      raise exception 'Quyền học bù không còn dùng được.' using errcode = 'P0001';
    end if;
    return new;
  end if;

  select credit.id into v_credit_id
  from public.makeup_credits credit
  join public.session_occurrences source_occurrence on source_occurrence.id = credit.source_occurrence_id
  join public.schedules source_schedule on source_schedule.id = source_occurrence.schedule_id
  where credit.enrollment_id = new.enrollment_id
    and credit.status = 'AVAILABLE'
    and source_schedule.class_id = v_makeup_class_id
  order by source_occurrence.occurrence_date, credit.created_at, credit.id
  for update of credit skip locked
  limit 1;
  if v_credit_id is null then
    raise exception 'Selected student does not have an available makeup credit for this class' using errcode = 'P0001';
  end if;
  update public.makeup_credits
  set status = 'RESERVED', reserved_occurrence_id = new.session_occurrence_id, reserved_at = now(), used_at = null, cancelled_at = null
  where id = v_credit_id and status = 'AVAILABLE';
  if not found then
    raise exception 'Makeup credit is no longer available' using errcode = 'P0001';
  end if;
  new.makeup_credit_id := v_credit_id;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.book_makeup_seat(p_credit_id uuid, p_occurrence_id uuid, p_acceptance_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_credit public.makeup_credits%rowtype;
  v_occurrence public.session_occurrences%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_class_id uuid;
  v_capacity integer;
  v_taken integer;
  v_policy public.academic_operation_policies%rowtype;
  v_code text;
  v_source_class uuid;
begin
  v_actor := public.academic_operation_actor();
  if p_acceptance_note is null or char_length(btrim(p_acceptance_note)) < 8 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Giáo vụ cần ghi bài học tương đương được chấp nhận, ít nhất 8 ký tự. Hệ thống không tự coi hai bài là tương đương.'));
  end if;
  perform 1 from public.session_occurrences where id=p_occurrence_id for update;
  select * into v_credit from public.makeup_credits where id = p_credit_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Không tìm thấy quyền học bù.'));
  end if;
  if v_credit.status <> 'AVAILABLE' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Quyền này không còn dùng được. Trạng thái hiện tại: ' || v_credit.status || '.'));
  end if;
  select * into v_policy from public.current_academic_operation_policy();
  if v_policy.makeup_use_within_days is null then
    null;
  else
    if public.vietnam_today() > (
      select occurrence.occurrence_date + v_policy.makeup_use_within_days
      from public.session_occurrences occurrence where occurrence.id = v_credit.source_occurrence_id
    ) then
      return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Quyền đã quá hạn theo chính sách phiên bản ' || v_policy.version_no || '.'));
    end if;
  end if;
  if v_policy.max_open_makeup_credits is not null and (
    select count(*) from public.makeup_credits
    where enrollment_id = v_credit.enrollment_id and status in ('AVAILABLE', 'RESERVED')
  ) > v_policy.max_open_makeup_credits then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Số quyền đang mở vượt mức chính sách đã duyệt.'));
  end if;
  select * into v_occurrence from public.session_occurrences where id = p_occurrence_id for update;
  if not found or v_occurrence.occurrence_type <> 'MAKEUP' or v_occurrence.status <> 'SCHEDULED' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Buổi đích phải là buổi học bù còn trong lịch.'));
  end if;
  select * into v_enrollment from public.enrollments where id = v_credit.enrollment_id;
  select schedule.class_id into v_class_id
  from public.schedules schedule where schedule.id = v_occurrence.schedule_id;
  select schedule.class_id into v_source_class
  from public.session_occurrences source
  join public.schedules schedule on schedule.id = source.schedule_id
  where source.id = v_credit.source_occurrence_id;
  if v_class_id is distinct from v_source_class then
    v_code := public.class_enrollment_compatibility(v_class_id, v_enrollment.student_id);
    if v_code <> 'IN_SCOPE' then
      return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Buổi bù khác ca gốc và chưa cùng chương trình, trình độ phù hợp: ' || v_code || '.'));
    end if;
  end if;
  if public.is_enrollment_paused_on(v_enrollment.id, v_occurrence.occurrence_date) then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Ngày buổi bù nằm trong thời gian bảo lưu. Không đặt lịch bù trong khoảng này.'));
  end if;
  if exists (
    select 1
    from public.session_occurrences other
    join public.schedules other_schedule on other_schedule.id = other.schedule_id
    join public.enrollments other_enrollment on other_enrollment.student_id = v_enrollment.student_id
    left join public.session_occurrence_participants participant
      on participant.session_occurrence_id = other.id and participant.enrollment_id = other_enrollment.id and participant.booking_status = 'ACTIVE'
    where other.status = 'SCHEDULED'
      and other.id <> v_occurrence.id
      and tstzrange(other.starts_at, other.ends_at, '[)') && tstzrange(v_occurrence.starts_at, v_occurrence.ends_at, '[)')
      and (
        (other.occurrence_type = 'REGULAR' and other_schedule.class_id = other_enrollment.class_id
          and other_enrollment.status = 'ACTIVE'
          and coalesce(other_enrollment.started_at, other_enrollment.enrolled_at) <= other.occurrence_date
          and (other_enrollment.ended_at is null or other_enrollment.ended_at >= other.occurrence_date)
          and not public.is_enrollment_paused_on(other_enrollment.id, other.occurrence_date))
        or participant.id is not null
      )
  ) then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Học viên đã có buổi khác trùng giờ.'));
  end if;
  select capacity into v_capacity from public.classes where id = v_class_id for update;
  select count(*) into v_taken from public.session_occurrence_participants where session_occurrence_id = v_occurrence.id and booking_status='ACTIVE';
  if v_taken >= v_capacity then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Buổi bù đã hết chỗ. Ghế cuối vừa được giữ bởi thao tác khác.'));
  end if;
  insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note, payload)
  values ('MAKEUP_LESSON_ACCEPTED', v_enrollment.id, v_credit.id, v_actor, btrim(p_acceptance_note), jsonb_build_object('occurrence_id', v_occurrence.id));
  insert into public.session_occurrence_participants (session_occurrence_id, enrollment_id, makeup_credit_id)
  values (v_occurrence.id, v_enrollment.id, v_credit.id);
  return jsonb_build_object(
    'ok', true,
    'credit_id', v_credit.id,
    'occurrence_id', v_occurrence.id,
    'expiry', case when v_policy.makeup_use_within_days is null then 'Chưa có hạn dùng được duyệt.' else 'Theo chính sách phiên bản ' || v_policy.version_no end
  );
exception
  when unique_violation or raise_exception then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array(sqlerrm));
end;
$function$;


CREATE OR REPLACE FUNCTION public.cancel_makeup_booking(p_credit_id uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_credit public.makeup_credits%rowtype;
  v_starts timestamptz;
  v_status text;
  v_policy public.academic_operation_policies%rowtype;
  v_occurrence uuid;
  v_excused boolean;
begin
  v_actor := public.academic_operation_actor();
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do hủy chỗ.'));
  end if;
  select reserved_occurrence_id into v_occurrence from public.makeup_credits where id=p_credit_id;
  perform 1 from public.session_occurrences where id=v_occurrence for update;
  select * into v_credit from public.makeup_credits where id = p_credit_id for update;
  if not found or v_credit.status <> 'RESERVED' or v_credit.reserved_occurrence_id is null then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Chỉ hủy được chỗ của quyền đang ở trạng thái đã đặt.'));
  end if;
  select occurrence.starts_at, occurrence.status into v_starts, v_status
  from public.session_occurrences occurrence where occurrence.id = v_credit.reserved_occurrence_id for update;
  if v_status <> 'SCHEDULED' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Buổi đích không còn trong lịch nên không hủy chỗ theo đường này.'));
  end if;
  select * into v_policy from public.current_academic_operation_policy();
  select exists(select 1 from public.attendance_records a where a.session_occurrence_id=v_credit.reserved_occurrence_id
    and a.enrollment_id=v_credit.enrollment_id and a.status='EXCUSED'
    and not exists(select 1 from public.absence_reports r where r.attendance_record_id=a.id and r.confirmation <> 'EXCUSED')) into v_excused;
  if not v_excused and v_policy.late_cancel_hours is not null and v_starts < now() + make_interval(hours => v_policy.late_cancel_hours) then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Đã vào cửa sổ hủy muộn của chính sách phiên bản ' || v_policy.version_no || '. Chưa có quy tắc trừ quyền được duyệt nên hệ thống không tự thu quyền và cũng không hủy chỗ.'));
  end if;
  update public.session_occurrence_participants
  set booking_status='CANCELLED',booking_closed_at=clock_timestamp(),booking_close_reason=btrim(p_note)
  where makeup_credit_id=v_credit.id and session_occurrence_id=v_credit.reserved_occurrence_id and booking_status='ACTIVE';
  if not found then return jsonb_build_object('ok',false,'blockers',jsonb_build_array('Không tìm thấy chỗ học bù còn hiệu lực.')); end if;
  update public.makeup_credits set status='AVAILABLE',reserved_occurrence_id=null,reserved_at=null,used_at=null,cancelled_at=null
  where id=v_credit.id and status='RESERVED' and reserved_occurrence_id=v_credit.reserved_occurrence_id;
  insert into public.enrollment_pause_events (enrollment_id, event_type, actor_id, note, payload)
  values (v_credit.enrollment_id, 'MAKEUP_UNBOOKED', v_actor, btrim(p_note), jsonb_build_object('credit_id', v_credit.id,'occurrence_id',v_credit.reserved_occurrence_id,'excused',v_excused));
  return jsonb_build_object('ok', true, 'credit_id', v_credit.id, 'status', 'AVAILABLE');
end;
$function$;


CREATE OR REPLACE FUNCTION public.portal_upcoming_sessions(p_student uuid, p_offset integer DEFAULT 0)
 RETURNS TABLE(session_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, class_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select distinct o.id,o.starts_at,o.ends_at,c.name
 from public.enrollments e join public.classes c on c.id=e.class_id
 join public.schedules sc on sc.class_id=c.id join public.session_occurrences o on o.schedule_id=sc.id
 where e.student_id=p_student and public.can_read_student_history(p_student,c.branch_id,'attendance')
 and e.status='ACTIVE' and o.status='SCHEDULED' and o.ends_at>=now()
 and e.started_at<=o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
 and ((o.occurrence_type='REGULAR' and not public.is_enrollment_paused_on(e.id,o.occurrence_date))
  or exists(select 1 from public.session_occurrence_participants p where p.session_occurrence_id=o.id and p.enrollment_id=e.id and p.booking_status = 'ACTIVE'))
 order by o.starts_at,o.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$function$;


CREATE OR REPLACE FUNCTION public.session_teaching_roster(p_session uuid)
 RETURNS TABLE(enrollment_id uuid, student_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select e.id,e.student_id from public.session_occurrences o
 join public.schedules sc on sc.id=o.schedule_id join public.enrollments e on e.class_id=sc.class_id
 where o.id=p_session and (
  (o.occurrence_type='MAKEUP' and exists(select 1 from public.session_occurrence_participants p where p.session_occurrence_id=o.id and p.enrollment_id=e.id and p.booking_status in ('ACTIVE','RELEASED')))
  or (o.occurrence_type='REGULAR' and e.started_at<=o.occurrence_date
      and (e.ended_at is null or e.ended_at>=o.occurrence_date)
      and not public.is_enrollment_paused_on(e.id,o.occurrence_date)))
$function$;


CREATE OR REPLACE FUNCTION public.validate_attendance_record_class()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_occurrence_class_id uuid;
  v_occurrence_status text;
  v_occurrence_type text;
  v_occurrence_date date;

  v_enrollment_class_id uuid;
  v_enrollment_started_at date;
  v_enrollment_ended_at date;
begin

  select
    schedule.class_id,
    occurrence.status,
    occurrence.occurrence_type,
    occurrence.occurrence_date
  into
    v_occurrence_class_id,
    v_occurrence_status,
    v_occurrence_type,
    v_occurrence_date
  from public.session_occurrences as occurrence

  join public.schedules as schedule
    on schedule.id = occurrence.schedule_id

  where occurrence.id =
    new.session_occurrence_id;


  if v_occurrence_status = 'CANCELLED' then
    raise exception
      'Attendance cannot be recorded for a cancelled session';
  end if;


  select
    enrollment.class_id,
    enrollment.started_at,
    enrollment.ended_at
  into
    v_enrollment_class_id,
    v_enrollment_started_at,
    v_enrollment_ended_at
  from public.enrollments as enrollment
  where enrollment.id = new.enrollment_id;


  if v_occurrence_class_id is distinct from
    v_enrollment_class_id
  then
    raise exception
      'Attendance enrollment must belong to the occurrence class';
  end if;


  -- -------------------------------------------------------
  -- REGULAR SESSION STUDY PERIOD
  -- -------------------------------------------------------

  if
    v_occurrence_type = 'REGULAR'
    and (
      v_enrollment_started_at is null
      or v_enrollment_started_at > v_occurrence_date
      or (
        v_enrollment_ended_at is not null
        and v_enrollment_ended_at < v_occurrence_date
      )
    )
  then
    raise exception
      'Attendance cannot be recorded outside the enrollment study period';
  end if;


  -- -------------------------------------------------------
  -- REGULAR SESSION PAUSE RULE
  -- -------------------------------------------------------

  if
    v_occurrence_type = 'REGULAR'
    and public.is_enrollment_paused_on(
      new.enrollment_id,
      v_occurrence_date
    )
  then
    raise exception
      'Attendance cannot be recorded while the enrollment is paused';
  end if;


  -- -------------------------------------------------------
  -- MAKEUP SESSION EXPLICIT ROSTER
  -- -------------------------------------------------------

  if
    v_occurrence_type = 'MAKEUP'
    and not exists (
      select 1
      from public.session_occurrence_participants
      where session_occurrence_id =
          new.session_occurrence_id
        and booking_status = 'ACTIVE'
        and enrollment_id =
          new.enrollment_id
    )
  then
    raise exception
      'Attendance enrollment must be a makeup participant';
  end if;


  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.validate_session_occurrence_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_class_id uuid;
  v_roster_count integer;
  v_attendance_count integer;
begin

  if new.status = old.status then
    return new;
  end if;


  if not (
    (
      old.status = 'SCHEDULED'
      and new.status in (
        'COMPLETED',
        'CANCELLED'
      )
    )
    or
    (
      old.status in (
        'COMPLETED',
        'CANCELLED'
      )
      and new.status = 'SCHEDULED'
    )
  ) then
    raise exception
      'Invalid session status transition from % to %',
      old.status,
      new.status;
  end if;


  if new.status = 'CANCELLED' then

    select count(*)::integer
    into v_attendance_count
    from public.attendance_records
    where session_occurrence_id = old.id;


    if v_attendance_count > 0 then
      raise exception
        'A session with attendance records cannot be cancelled';
    end if;

  end if;


  if new.status = 'COMPLETED' then

    -- MAKEUP: explicit participant roster.
    if old.occurrence_type = 'MAKEUP' then

      select count(*)::integer
      into v_roster_count
      from public.session_occurrence_participants
      where session_occurrence_id = old.id
        and booking_status = 'ACTIVE';


      select count(*)::integer
      into v_attendance_count
      from public.attendance_records as attendance

      join public.session_occurrence_participants
        as participant
        on participant.session_occurrence_id =
          attendance.session_occurrence_id
        and participant.enrollment_id =
          attendance.enrollment_id
        and participant.booking_status = 'ACTIVE'

      where attendance.session_occurrence_id =
        old.id;

    -- REGULAR: dated roster.
    else

      select schedule.class_id
      into v_class_id
      from public.schedules as schedule
      where schedule.id = old.schedule_id;


      select count(*)::integer
      into v_roster_count
      from public.enrollments as enrollment

      where enrollment.class_id = v_class_id

        and enrollment.started_at is not null

        and enrollment.started_at <=
          old.occurrence_date

        and (
          enrollment.ended_at is null
          or enrollment.ended_at >=
            old.occurrence_date
        )

        and not public.is_enrollment_paused_on(
          enrollment.id,
          old.occurrence_date
        );


      select count(*)::integer
      into v_attendance_count
      from public.attendance_records as attendance

      join public.enrollments as enrollment
        on enrollment.id =
          attendance.enrollment_id

      where attendance.session_occurrence_id =
          old.id

        and enrollment.class_id =
          v_class_id

        and enrollment.started_at is not null

        and enrollment.started_at <=
          old.occurrence_date

        and (
          enrollment.ended_at is null
          or enrollment.ended_at >=
            old.occurrence_date
        )

        and not public.is_enrollment_paused_on(
          enrollment.id,
          old.occurrence_date
        );

    end if;


    if v_attendance_count <>
      v_roster_count
    then
      raise exception
        'All students in the session roster must be marked before completion';
    end if;

  end if;


  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.confirm_absence(p_report_id uuid, p_excused boolean, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor uuid;
  v_report public.absence_reports%rowtype;
  v_status text;
  v_confirmation text;
begin
  v_actor := public.academic_operation_actor();
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập ghi chú xác nhận.'));
  end if;
  perform 1 from public.session_occurrences where id=(select session_occurrence_id from public.absence_reports where id=p_report_id) for update;
  select * into v_report from public.absence_reports where id = p_report_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Không tìm thấy báo vắng.'));
  end if;
  v_confirmation := case when p_excused then 'EXCUSED' else 'UNEXCUSED' end;
  if v_report.confirmation = v_confirmation then
    return jsonb_build_object('ok', true, 'report_id', v_report.id, 'repeated', true);
  end if;
  select status into v_status from public.session_occurrences where id = v_report.session_occurrence_id;
  if v_status <> 'SCHEDULED' and not p_excused then
    insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note, payload)
    values ('ATTENDANCE_CORRECTION_BLOCKED', v_report.enrollment_id, v_report.id, v_actor, btrim(p_note), jsonb_build_object('requested', v_confirmation));
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Buổi đã chốt nên không đổi kết quả sang không phép từ báo vắng. Đã ghi ngoại lệ.'), 'exception_recorded', true);
  end if;
  update public.absence_reports
  set confirmation = v_confirmation, confirmed_at = now(), confirmed_by = v_actor
  where id = v_report.id;
  update public.attendance_records
  set status = case when p_excused then 'EXCUSED' else 'ABSENT' end
  where id = v_report.attendance_record_id;
  if p_excused and v_status = 'COMPLETED' then
    if (select occurrence_type from public.session_occurrences where id = v_report.session_occurrence_id) = 'REGULAR' then
      insert into public.makeup_credits (enrollment_id, source_occurrence_id, source_attendance_record_id, source_reason, status)
      select attendance.enrollment_id, attendance.session_occurrence_id, attendance.id, 'EXCUSED', 'AVAILABLE'
      from public.attendance_records attendance
      join public.session_occurrences occurrence on occurrence.id = attendance.session_occurrence_id
      where attendance.id = v_report.attendance_record_id
        and attendance.status = 'EXCUSED'
        and occurrence.occurrence_type = 'REGULAR'
        and occurrence.status = 'COMPLETED'
        and not exists(select 1 from public.absence_reports r where r.attendance_record_id=attendance.id and r.confirmation <> 'EXCUSED')
        and exists(select 1 from public.enrollments e join public.schedules sc on sc.class_id=e.class_id
          where e.id=attendance.enrollment_id and sc.id=occurrence.schedule_id
            and coalesce(e.started_at,e.enrolled_at)<=occurrence.occurrence_date
            and (e.ended_at is null or e.ended_at>=occurrence.occurrence_date))
        and not public.is_enrollment_paused_on(attendance.enrollment_id, occurrence.occurrence_date)
      on conflict (source_occurrence_id, enrollment_id) do update
      set source_attendance_record_id = excluded.source_attendance_record_id,
        source_reason = 'EXCUSED', status = 'AVAILABLE',
        reserved_occurrence_id = null, reserved_at = null, used_at = null, cancelled_at = null
      where public.makeup_credits.status in ('AVAILABLE', 'CANCELLED');
    else
      perform public.release_excused_makeup_credit(v_report.session_occurrence_id, v_report.enrollment_id);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'report_id', v_report.id, 'confirmation', v_confirmation, 'credit', 'Buổi thường đã chốt và nghỉ có phép được xác nhận cấp đúng một quyền. Buổi học bù nghỉ có phép trả lại chính quyền đã đặt khi hủy chỗ được phép hoặc chốt buổi; không tạo quyền mới.');
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_attendance_mutation_for_finalized_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_occurrence_id uuid;
  v_occurrence_status text;
begin
  if tg_op = 'UPDATE' then
    if new.session_occurrence_id is distinct from old.session_occurrence_id
      or new.enrollment_id is distinct from old.enrollment_id then
      raise exception 'Attendance record identity cannot be changed';
    end if;
  end if;
  if tg_op = 'DELETE' then
    v_occurrence_id := old.session_occurrence_id;
  else
    v_occurrence_id := new.session_occurrence_id;
  end if;
  select status into v_occurrence_status from public.session_occurrences where id = v_occurrence_id;
  if v_occurrence_status is null then
    raise exception 'Session occurrence not found';
  end if;
  if v_occurrence_status <> 'SCHEDULED' then
    if tg_op = 'UPDATE'
      and new.status = 'EXCUSED'
      and old.status in ('ABSENT', 'LATE', 'EXCUSED')
      and exists (
        select 1 from public.absence_reports report
        where report.attendance_record_id = new.id
          and report.confirmation = 'EXCUSED'
      )
    then
      return new;
    end if;
    raise exception 'Attendance can only be changed while the session is scheduled';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;


notify pgrst, 'reload schema';
