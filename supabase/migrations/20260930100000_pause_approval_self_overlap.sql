-- Exclude only the locked request being decided. Ordinary preview still checks every pending request.
-- Preserve actor authorization, attendance history, overlap and numeric policy checks.
begin;
create schema if not exists academic_private;
revoke all on schema academic_private from public, anon, authenticated, service_role;
create function academic_private.preview_enrollment_pause_for_request(
  p_enrollment_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_excluded_request uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_policy public.academic_operation_policies%rowtype;
  v_sessions jsonb := '[]'::jsonb;
  v_blockers text[] := array[]::text[];
  v_decisions text[] := array[]::text[];
  v_tuition jsonb := '[]'::jsonb;
  v_credits integer := 0;
begin
  perform public.academic_operation_actor();
  select * into v_policy from public.current_academic_operation_policy();
  select * into v_enrollment from public.enrollments where id = p_enrollment_id;
  if not found then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Không tìm thấy ghi danh.'));
  end if;
  if p_ends_on < p_starts_on then
    v_blockers := array_append(v_blockers, 'Ngày kết thúc phải cùng ngày hoặc sau ngày bắt đầu.');
  end if;
  if v_enrollment.status <> 'ACTIVE' then
    v_blockers := array_append(v_blockers, 'Chỉ ghi danh đang học mới bảo lưu được. Trạng thái hiện tại không phải đang học.');
  end if;
  if v_enrollment.started_at is null then
    v_blockers := array_append(v_blockers, 'Học viên chưa có ngày bắt đầu học.');
  elsif p_starts_on < coalesce(v_enrollment.started_at, v_enrollment.enrolled_at)
    or (v_enrollment.ended_at is not null and p_ends_on > v_enrollment.ended_at) then
    v_blockers := array_append(v_blockers, 'Khoảng bảo lưu phải nằm trong thời gian học của ghi danh.');
  end if;
  if exists (
    select 1 from public.enrollment_pauses pause
    where pause.enrollment_id = p_enrollment_id and pause.status = 'ACTIVE'
      and daterange(pause.starts_on, pause.ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]')
  ) or exists (
    select 1 from public.enrollment_pause_requests request
    where request.enrollment_id = p_enrollment_id and request.status = 'REQUESTED'
      and request.id is distinct from p_excluded_request
      and daterange(request.starts_on, request.ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]')
  ) then
    v_blockers := array_append(v_blockers, 'Khoảng này chồng lên một bảo lưu đang hiệu lực hoặc một yêu cầu đang chờ duyệt.');
  end if;
  if v_policy.max_pause_calendar_days is not null
    and (p_ends_on - p_starts_on + 1) > v_policy.max_pause_calendar_days then
    v_blockers := array_append(v_blockers, 'Khoảng bảo lưu dài hơn số ngày tối đa của chính sách phiên bản ' || v_policy.version_no || '.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', occurrence.id,
    'date', occurrence.occurrence_date,
    'session_status', occurrence.status,
    'attendance_status', attendance.status
  ) order by occurrence.occurrence_date), '[]'::jsonb)
  into v_sessions
  from public.session_occurrences occurrence
  join public.schedules schedule on schedule.id = occurrence.schedule_id
  left join public.attendance_records attendance
    on attendance.session_occurrence_id = occurrence.id
   and attendance.enrollment_id = p_enrollment_id
  where schedule.class_id = v_enrollment.class_id
    and occurrence.occurrence_type = 'REGULAR'
    and occurrence.occurrence_date between p_starts_on and p_ends_on;

  if exists (
    select 1 from jsonb_array_elements(v_sessions) item
    where item->>'session_status' <> 'SCHEDULED' or item->>'attendance_status' is not null
  ) then
    v_blockers := array_append(v_blockers, 'Khoảng này đụng buổi đã điểm danh hoặc buổi thường đã chốt. Hệ thống không ghi đè lịch sử. Cần một ngoại lệ có người chịu trách nhiệm, không tự sửa điểm danh hay chứng từ.');
  end if;

  select count(*) into v_credits
  from public.makeup_credits
  where enrollment_id = p_enrollment_id and status in ('AVAILABLE', 'RESERVED');

  select coalesce(jsonb_agg(jsonb_build_object(
    'tuition_id', tuition.id,
    'status', tuition.status,
    'base_ends_on', tuition.base_ends_on,
    'effective_ends_on', tuition.effective_ends_on,
    'overlap_days', greatest(0, least(p_ends_on, tuition.effective_ends_on) - greatest(p_starts_on, tuition.starts_on) + 1)
  )), '[]'::jsonb)
  into v_tuition
  from public.enrollment_tuition tuition
  where tuition.enrollment_id = p_enrollment_id
    and tuition.status <> 'CANCELLED'
    and daterange(tuition.starts_on, tuition.effective_ends_on, '[]') && daterange(p_starts_on, p_ends_on, '[]');

  if v_policy.absence_report_deadline_hours is null then
    v_decisions := array_append(v_decisions, 'Chưa có hạn báo vắng được duyệt.');
  end if;
  if v_policy.makeup_use_within_days is null then
    v_decisions := array_append(v_decisions, 'Chưa có hạn dùng quyền học bù được duyệt. Quyền hiện có không tự hết hạn.');
  end if;
  if v_policy.max_open_makeup_credits is null then
    v_decisions := array_append(v_decisions, 'Chưa có số quyền học bù tối đa được duyệt.');
  end if;
  if v_policy.late_cancel_hours is null then
    v_decisions := array_append(v_decisions, 'Chưa có quy định hủy muộn được duyệt. Hủy buổi bù còn lịch trả quyền theo sổ hiện tại.');
  end if;
  if v_policy.max_pause_calendar_days is null then
    v_decisions := array_append(v_decisions, 'Chưa có thời lượng bảo lưu tối đa được duyệt.');
  end if;
  v_decisions := array_append(v_decisions, 'Tiền: chưa có quyết định hoàn hoặc thu thêm. Cơ chế đang chạy chỉ dời ngày kết thúc quyền học theo ngày bảo lưu giao với kỳ học phí. Xem trước không ghi sổ học phí.');

  return jsonb_build_object(
    'ok', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'decisions', to_jsonb(v_decisions),
    'sessions', v_sessions,
    'open_makeup_credits', v_credits,
    'tuition_preview', v_tuition,
    'money', 'Không hoàn tiền và không tạo khoản thu. effective_ends_on chỉ đổi sau khi bảo lưu được duyệt, theo hàm đang chạy.',
    'policy_version', v_policy.version_no
  );
end;
$$;

create or replace function public.preview_enrollment_pause(p_enrollment_id uuid, p_starts_on date, p_ends_on date)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$ select academic_private.preview_enrollment_pause_for_request(p_enrollment_id, p_starts_on, p_ends_on, null); $$;
revoke all on function academic_private.preview_enrollment_pause_for_request(uuid,date,date,uuid) from public, anon, authenticated, service_role;

create or replace function public.decide_enrollment_pause(
  p_request_id uuid,
  p_approve boolean,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_request public.enrollment_pause_requests%rowtype;
  v_preview jsonb;
  v_pause uuid;
begin
  v_actor := public.academic_operation_actor();
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập ghi chú duyệt hoặc từ chối từ 1 đến 500 ký tự.'));
  end if;
  select * into v_request from public.enrollment_pause_requests where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Không tìm thấy yêu cầu.'));
  end if;
  -- A retry may return the existing decision, after the same authorization check.
  if p_approve is true and v_request.status = 'APPROVED' and v_request.pause_id is not null then
    return jsonb_build_object('ok', true, 'request_id', v_request.id, 'pause_id', v_request.pause_id, 'repeated', true);
  end if;
  if v_request.status <> 'REQUESTED' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Yêu cầu không còn ở trạng thái chờ duyệt.'), 'request_id', v_request.id);
  end if;
  if p_approve is not true then
    update public.enrollment_pause_requests
    set status = 'REJECTED', decided_by = v_actor, decided_at = now(), decision_note = btrim(p_note)
    where id = v_request.id;
    insert into public.enrollment_pause_events (request_id, enrollment_id, event_type, actor_id, note)
    values (v_request.id, v_request.enrollment_id, 'REJECTED', v_actor, btrim(p_note));
    return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'REJECTED');
  end if;
  v_preview := academic_private.preview_enrollment_pause_for_request(v_request.enrollment_id, v_request.starts_on, v_request.ends_on, v_request.id);
  if coalesce((v_preview->>'ok')::boolean, false) is not true then
    insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note, payload)
    values ('PAUSE_BLOCKED', v_request.enrollment_id, v_request.id, v_actor, 'Duyệt bị chặn. Điểm danh và chứng từ không bị sửa.', v_preview);
    return v_preview || jsonb_build_object('exception_recorded', true, 'request_id', v_request.id);
  end if;
  begin
    insert into public.enrollment_pauses (enrollment_id, starts_on, ends_on, reason, created_by)
    values (v_request.enrollment_id, v_request.starts_on, v_request.ends_on, v_request.reason, v_actor)
    returning id into v_pause;
  exception
    when exclusion_violation or raise_exception then
      insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note, payload)
      values ('PAUSE_BLOCKED', v_request.enrollment_id, v_request.id, v_actor, sqlerrm, coalesce(v_preview, '{}'::jsonb));
      return jsonb_build_object('ok', false, 'blockers', jsonb_build_array(sqlerrm), 'exception_recorded', true, 'request_id', v_request.id);
  end;
  update public.enrollment_pause_requests
  set status = 'APPROVED', pause_id = v_pause, decided_by = v_actor, decided_at = now(), decision_note = btrim(p_note)
  where id = v_request.id;
  insert into public.enrollment_pause_events (request_id, enrollment_id, event_type, actor_id, note, payload)
  values (v_request.id, v_request.enrollment_id, 'APPROVED', v_actor, btrim(p_note), jsonb_build_object('pause_id', v_pause));
  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'pause_id', v_pause, 'preview', v_preview);
end;
$$;
notify pgrst, 'reload schema';
commit;
