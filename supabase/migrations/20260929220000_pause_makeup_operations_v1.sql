-- Operational layer for enrollment pauses and makeup credits.
-- Source of truth stays enrollment_pauses and makeup_credits.
-- No second learning-rights ledger, no refund, and no new charge.
-- Numeric policy fields stay null until an approved decision exists.
-- A null field must not create a credit, an expiry, or a money movement.

create table public.academic_operation_policies (
  id uuid primary key default gen_random_uuid(),
  version_no integer not null unique check (version_no > 0),
  effective_on date not null,
  absence_report_deadline_hours integer check (absence_report_deadline_hours is null or absence_report_deadline_hours >= 0),
  makeup_use_within_days integer check (makeup_use_within_days is null or makeup_use_within_days > 0),
  max_open_makeup_credits integer check (max_open_makeup_credits is null or max_open_makeup_credits > 0),
  late_cancel_hours integer check (late_cancel_hours is null or late_cancel_hours >= 0),
  max_pause_calendar_days integer check (max_pause_calendar_days is null or max_pause_calendar_days > 0),
  pause_money_decision text not null default 'UNDECIDED' check (pause_money_decision = 'UNDECIDED'),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_by uuid,
  created_at timestamptz not null default now()
);

insert into public.academic_operation_policies (version_no, effective_on, note)
values (
  1,
  date '2026-09-29',
  'Chưa có quyết định được duyệt cho hạn báo vắng, hạn học bù, số quyền tối đa, hủy muộn, thời lượng bảo lưu, hoặc xử lý tiền ngoài cơ chế dời ngày kết thúc quyền học đang chạy.'
);

create table public.enrollment_pause_requests (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  status text not null check (status in ('REQUESTED', 'REJECTED', 'APPROVED', 'ENDED')),
  pause_id uuid references public.enrollment_pauses(id) on delete restrict,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  ended_by uuid,
  ended_at timestamptz,
  end_note text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create unique index enrollment_pause_requests_open_dates_idx
  on public.enrollment_pause_requests (enrollment_id, starts_on, ends_on, md5(reason))
  where status in ('REQUESTED', 'APPROVED');

create table public.enrollment_pause_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.enrollment_pause_requests(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  event_type text not null check (char_length(btrim(event_type)) between 1 and 80),
  actor_id uuid,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.enrollment_shift_changes (
  id uuid primary key default gen_random_uuid(),
  from_enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  to_enrollment_id uuid references public.enrollments(id) on delete restrict,
  from_class_id uuid not null references public.classes(id) on delete restrict,
  to_class_id uuid not null references public.classes(id) on delete restrict,
  restore_on date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  actor_id uuid,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 200),
  created_at timestamptz not null default now(),
  unique (from_enrollment_id, idempotency_key)
);

create table public.absence_reports (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null unique references public.attendance_records(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  session_occurrence_id uuid not null references public.session_occurrences(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  reported_at timestamptz not null default now(),
  reported_by uuid,
  confirmed_at timestamptz,
  confirmed_by uuid,
  confirmation text not null default 'PENDING' check (confirmation in ('PENDING', 'EXCUSED', 'UNEXCUSED'))
);

create table public.academic_operation_exceptions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'PAUSE_BLOCKED',
    'ATTENDANCE_CORRECTION_BLOCKED',
    'MAKEUP_COMPLETED_WITHOUT_PRESENT',
    'MAKEUP_LESSON_ACCEPTED',
    'MAKEUP_CREDIT_RELEASED',
    'SOURCE_CREDIT_USED'
  )),
  enrollment_id uuid references public.enrollments(id) on delete restrict,
  source_id uuid,
  actor_id uuid,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.academic_operation_policies enable row level security;
alter table public.enrollment_pause_requests enable row level security;
alter table public.enrollment_pause_events enable row level security;
alter table public.enrollment_shift_changes enable row level security;
alter table public.absence_reports enable row level security;
alter table public.academic_operation_exceptions enable row level security;

create function public.vietnam_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create function public.academic_ops_may_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.has_role('SUPER_ADMIN'), false)
    or coalesce(public.has_role('ACADEMIC_MANAGER'), false)
    or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'))
$$;

create policy academic_ops_read_policies on public.academic_operation_policies for select to authenticated using (public.academic_ops_may_manage());
create policy academic_ops_read_pause_requests on public.enrollment_pause_requests for select to authenticated using (public.academic_ops_may_manage());
create policy academic_ops_read_pause_events on public.enrollment_pause_events for select to authenticated using (public.academic_ops_may_manage());
create policy academic_ops_read_shift_changes on public.enrollment_shift_changes for select to authenticated using (public.academic_ops_may_manage());
create policy academic_ops_read_absence_reports on public.absence_reports for select to authenticated using (public.academic_ops_may_manage());
create policy academic_ops_read_exceptions on public.academic_operation_exceptions for select to authenticated using (public.academic_ops_may_manage());

create policy academic_manager_read_enrollment_pauses on public.enrollment_pauses for select to authenticated using (public.has_role('ACADEMIC_MANAGER'));
create policy academic_manager_read_makeup_credits on public.makeup_credits for select to authenticated using (public.has_role('ACADEMIC_MANAGER'));

create function public.current_academic_operation_policy()
returns public.academic_operation_policies
language sql
stable
security definer
set search_path = public
as $$
  select * from public.academic_operation_policies order by version_no desc limit 1
$$;

create function public.academic_operation_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Không xác định được người thao tác' using errcode = 'P0001';
  end if;
  if not public.academic_ops_may_manage() then
    raise exception 'Không có quyền bảo lưu và học bù. Cần vai trò Quản trị hoặc Quản lý đào tạo.' using errcode = 'P0001';
  end if;
  return auth.uid();
end;
$$;

create function public.preview_enrollment_pause(
  p_enrollment_id uuid,
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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

create function public.request_enrollment_pause(
  p_enrollment_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_preview jsonb;
  v_existing uuid;
  v_id uuid;
begin
  v_actor := public.academic_operation_actor();
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do từ 1 đến 500 ký tự.'));
  end if;
  select request.id into v_existing
  from public.enrollment_pause_requests request
  where request.enrollment_id = p_enrollment_id
    and request.starts_on = p_starts_on
    and request.ends_on = p_ends_on
    and request.reason = btrim(p_reason)
    and request.status in ('REQUESTED', 'APPROVED');
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'request_id', v_existing, 'repeated', true);
  end if;
  v_preview := public.preview_enrollment_pause(p_enrollment_id, p_starts_on, p_ends_on);
  if coalesce((v_preview->>'ok')::boolean, false) is not true then
    insert into public.academic_operation_exceptions (kind, enrollment_id, actor_id, note, payload)
    values ('PAUSE_BLOCKED', p_enrollment_id, v_actor, 'Yêu cầu bảo lưu bị chặn trước khi ghi.', v_preview);
    return v_preview || jsonb_build_object('exception_recorded', true);
  end if;
  insert into public.enrollment_pause_requests (enrollment_id, starts_on, ends_on, reason, status, requested_by)
  values (p_enrollment_id, p_starts_on, p_ends_on, btrim(p_reason), 'REQUESTED', v_actor)
  returning id into v_id;
  insert into public.enrollment_pause_events (request_id, enrollment_id, event_type, actor_id, note)
  values (v_id, p_enrollment_id, 'REQUESTED', v_actor, btrim(p_reason));
  return jsonb_build_object('ok', true, 'request_id', v_id, 'preview', v_preview);
end;
$$;

create function public.decide_enrollment_pause(
  p_request_id uuid,
  p_approve boolean,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  v_preview := public.preview_enrollment_pause(v_request.enrollment_id, v_request.starts_on, v_request.ends_on);
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

create function public.replace_approved_pause_end(
  p_request_id uuid,
  p_ends_on date,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_request public.enrollment_pause_requests%rowtype;
  v_pause uuid;
begin
  v_actor := public.academic_operation_actor();
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do đổi ngày kết thúc.'));
  end if;
  select * into v_request from public.enrollment_pause_requests where id = p_request_id for update;
  if not found or v_request.status <> 'APPROVED' or v_request.pause_id is null then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Chỉ đổi được bảo lưu đã duyệt và còn hiệu lực.'));
  end if;
  if p_ends_on < v_request.starts_on then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Ngày kết thúc mới không được trước ngày bắt đầu.'));
  end if;
  if p_ends_on = v_request.ends_on then
    return jsonb_build_object('ok', true, 'request_id', v_request.id, 'repeated', true);
  end if;
  begin
    update public.enrollment_pauses
    set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = btrim(p_note)
    where id = v_request.pause_id and status = 'ACTIVE';
    if not found then
      return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Đợt bảo lưu gốc không còn hiệu lực.'));
    end if;
    insert into public.enrollment_pauses (enrollment_id, starts_on, ends_on, reason, created_by)
    values (v_request.enrollment_id, v_request.starts_on, p_ends_on, v_request.reason, v_actor)
    returning id into v_pause;
  exception
    when exclusion_violation or raise_exception then
      insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note, payload)
      values ('PAUSE_BLOCKED', v_request.enrollment_id, v_request.id, v_actor, sqlerrm, jsonb_build_object('requested_end', p_ends_on));
      return jsonb_build_object('ok', false, 'blockers', jsonb_build_array(sqlerrm), 'exception_recorded', true);
  end;
  update public.enrollment_pause_requests
  set pause_id = v_pause, ends_on = p_ends_on, end_note = btrim(p_note), ended_by = v_actor, ended_at = now()
  where id = v_request.id;
  insert into public.enrollment_pause_events (request_id, enrollment_id, event_type, actor_id, note, payload)
  values (v_request.id, v_request.enrollment_id, 'END_REPLACED', v_actor, btrim(p_note), jsonb_build_object('pause_id', v_pause, 'ends_on', p_ends_on));
  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'pause_id', v_pause);
end;
$$;

create function public.cancel_active_pause(p_pause_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_pause public.enrollment_pauses%rowtype;
begin
  v_actor := public.academic_operation_actor();
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do kết thúc bảo lưu.'));
  end if;
  select * into v_pause from public.enrollment_pauses where id = p_pause_id for update;
  if not found or v_pause.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Đợt bảo lưu không còn hiệu lực.'));
  end if;
  begin
    update public.enrollment_pauses
    set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = btrim(p_note)
    where id = v_pause.id and status = 'ACTIVE';
  exception
    when raise_exception then
      insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note)
      values ('PAUSE_BLOCKED', v_pause.enrollment_id, v_pause.id, v_actor, sqlerrm);
      return jsonb_build_object('ok', false, 'blockers', jsonb_build_array(sqlerrm), 'exception_recorded', true);
  end;
  update public.enrollment_pause_requests
  set status = 'ENDED', ended_by = v_actor, ended_at = now(), end_note = btrim(p_note)
  where pause_id = v_pause.id and status = 'APPROVED';
  insert into public.enrollment_pause_events (request_id, enrollment_id, event_type, actor_id, note)
  select request.id, v_pause.enrollment_id, 'ENDED', v_actor, btrim(p_note)
  from public.enrollment_pause_requests request
  where request.pause_id = v_pause.id
  union all
  select null, v_pause.enrollment_id, 'ENDED', v_actor, btrim(p_note)
  where not exists (select 1 from public.enrollment_pause_requests request where request.pause_id = v_pause.id);
  return jsonb_build_object('ok', true, 'pause_id', v_pause.id);
end;
$$;

create function public.restore_enrollment_shift(
  p_enrollment_id uuid,
  p_class_id uuid,
  p_restore_on date,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_enrollment public.enrollments%rowtype;
  v_existing public.enrollment_shift_changes%rowtype;
  v_code text;
  v_count integer;
  v_capacity integer;
  v_new uuid;
  v_progress integer;
begin
  v_actor := public.academic_operation_actor();
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do chuyển ca.'));
  end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) < 8 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Thiếu mã chống ghi trùng.'));
  end if;
  select * into v_existing
  from public.enrollment_shift_changes
  where from_enrollment_id = p_enrollment_id and idempotency_key = btrim(p_idempotency_key);
  if found then
    return jsonb_build_object('ok', true, 'repeated', true, 'to_enrollment_id', v_existing.to_enrollment_id);
  end if;
  select * into v_enrollment from public.enrollments where id = p_enrollment_id for update;
  if not found or v_enrollment.status <> 'ACTIVE' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Ghi danh cũ không còn đang học.'));
  end if;
  if p_class_id = v_enrollment.class_id then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Đây đúng ca hiện tại. Để quay lại ca này, chỉ cần kết thúc bảo lưu. Lịch sử ca vẫn giữ nguyên.'));
  end if;
  if p_restore_on <= coalesce(v_enrollment.started_at, v_enrollment.enrolled_at) then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Ngày hiệu lực phải sau ngày ca cũ bắt đầu.'));
  end if;
  v_code := public.class_enrollment_compatibility(p_class_id, v_enrollment.student_id);
  if v_code <> 'IN_SCOPE' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array(case v_code
      when 'CLASS_SCOPE_UNCONFIGURED' then 'Ca đích chưa cấu hình khoảng trình độ.'
      when 'WRONG_PROGRAM' then 'Ca đích thuộc chương trình học khác.'
      when 'ACADEMIC_PROGRAM_MISSING' then 'Học viên chưa có chương trình đang học.'
      when 'CURRENT_LEVEL_MISSING' then 'Học viên chưa có trình độ hiện tại.'
      when 'OUTSIDE_SCOPE' then 'Trình độ hiện tại nằm ngoài khoảng của ca đích.'
      else 'Ca đích không phù hợp: ' || v_code
    end));
  end if;
  select capacity into v_capacity from public.classes where id = p_class_id and status = 'ACTIVE' for update;
  if not found then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Ca đích không ở trạng thái đang mở.'));
  end if;
  select count(*) into v_count
  from public.enrollments
  where class_id = p_class_id and status in ('ACTIVE', 'PAUSED')
    and (ended_at is null or ended_at >= p_restore_on);
  if v_count >= v_capacity then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Ca đích đã đủ chỗ tại ngày hiệu lực.'));
  end if;
  select count(*) into v_progress
  from public.learning_lesson_progress
  where student_id = v_enrollment.student_id;
  begin
    update public.enrollment_pauses
    set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = btrim(p_reason)
    where enrollment_id = v_enrollment.id and status = 'ACTIVE' and starts_on >= p_restore_on;
    update public.enrollment_pauses
    set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor, cancel_reason = btrim(p_reason)
    where enrollment_id = v_enrollment.id and status = 'ACTIVE' and ends_on >= p_restore_on and starts_on < p_restore_on;
    insert into public.enrollment_pauses (enrollment_id, starts_on, ends_on, reason, created_by)
    select v_enrollment.id, pause.starts_on, p_restore_on - 1, pause.reason, v_actor
    from public.enrollment_pauses pause
    where pause.enrollment_id = v_enrollment.id and pause.status = 'CANCELLED' and pause.cancel_reason = btrim(p_reason)
      and pause.starts_on < p_restore_on and pause.ends_on >= p_restore_on
      and not exists (
        select 1 from public.enrollment_pauses active_pause
        where active_pause.enrollment_id = v_enrollment.id and active_pause.status = 'ACTIVE'
      );
    update public.enrollments
    set ended_at = p_restore_on - 1, status = 'COMPLETED'
    where id = v_enrollment.id;
    insert into public.enrollments (student_id, class_id, student_curriculum_enrollment_id, enrolled_at, started_at, status, notes)
    values (v_enrollment.student_id, p_class_id, v_enrollment.student_curriculum_enrollment_id, public.vietnam_today(), p_restore_on, 'ACTIVE', 'Chuyển ca từ ' || v_enrollment.id)
    returning id into v_new;
  exception
    when exclusion_violation or raise_exception or check_violation then
      return jsonb_build_object('ok', false, 'blockers', jsonb_build_array(sqlerrm));
  end;
  insert into public.enrollment_shift_changes (from_enrollment_id, to_enrollment_id, from_class_id, to_class_id, restore_on, reason, actor_id, idempotency_key)
  values (v_enrollment.id, v_new, v_enrollment.class_id, p_class_id, p_restore_on, btrim(p_reason), v_actor, btrim(p_idempotency_key));
  insert into public.enrollment_pause_events (enrollment_id, event_type, actor_id, note, payload)
  values (v_enrollment.id, 'SHIFT_RESTORED', v_actor, btrim(p_reason), jsonb_build_object('to_enrollment_id', v_new, 'to_class_id', p_class_id, 'lesson_progress_rows', v_progress));
  return jsonb_build_object('ok', true, 'to_enrollment_id', v_new, 'lesson_progress_rows', v_progress, 'money', 'Không hoàn tiền và không tạo khoản thu.');
end;
$$;

create or replace function public.reserve_makeup_credit_for_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence_type text;
  v_occurrence_status text;
  v_makeup_class_id uuid;
  v_credit_id uuid;
begin
  select occurrence.occurrence_type, occurrence.status, schedule.class_id
  into v_occurrence_type, v_occurrence_status, v_makeup_class_id
  from public.session_occurrences occurrence
  join public.schedules schedule on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id;

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
$$;

create function public.book_makeup_seat(
  p_credit_id uuid,
  p_occurrence_id uuid,
  p_acceptance_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
      on participant.session_occurrence_id = other.id and participant.enrollment_id = other_enrollment.id
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
  select count(*) into v_taken from public.session_occurrence_participants where session_occurrence_id = v_occurrence.id;
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
$$;

create function public.cancel_makeup_booking(p_credit_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_credit public.makeup_credits%rowtype;
  v_starts timestamptz;
  v_status text;
  v_policy public.academic_operation_policies%rowtype;
begin
  v_actor := public.academic_operation_actor();
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do hủy chỗ.'));
  end if;
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
  if v_policy.late_cancel_hours is not null and v_starts < now() + make_interval(hours => v_policy.late_cancel_hours) then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Đã vào cửa sổ hủy muộn của chính sách phiên bản ' || v_policy.version_no || '. Chưa có quy tắc trừ quyền được duyệt nên hệ thống không tự thu quyền và cũng không hủy chỗ.'));
  end if;
  delete from public.session_occurrence_participants
  where makeup_credit_id = v_credit.id and session_occurrence_id = v_credit.reserved_occurrence_id;
  insert into public.enrollment_pause_events (enrollment_id, event_type, actor_id, note, payload)
  values (v_credit.enrollment_id, 'MAKEUP_UNBOOKED', v_actor, btrim(p_note), jsonb_build_object('credit_id', v_credit.id));
  return jsonb_build_object('ok', true, 'credit_id', v_credit.id, 'status', 'AVAILABLE');
end;
$$;

create function public.release_completed_makeup_without_present(p_credit_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_credit public.makeup_credits%rowtype;
  v_status text;
begin
  v_actor := public.academic_operation_actor();
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do trả quyền.'));
  end if;
  select * into v_credit from public.makeup_credits where id = p_credit_id for update;
  if not found or v_credit.status <> 'RESERVED' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Chỉ trả quyền đang kẹt ở trạng thái đã đặt.'));
  end if;
  select status into v_status from public.session_occurrences where id = v_credit.reserved_occurrence_id;
  if v_status is distinct from 'COMPLETED' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Buổi đích chưa chốt. Hãy hủy chỗ nếu buổi còn trong lịch.'));
  end if;
  if exists (
    select 1 from public.attendance_records attendance
    where attendance.session_occurrence_id = v_credit.reserved_occurrence_id
      and attendance.enrollment_id = v_credit.enrollment_id
      and attendance.status = 'PRESENT'
  ) then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Đã có điểm danh có mặt. Quyền phải được tính đã học, không trả lại.'));
  end if;
  update public.makeup_credits
  set status = 'AVAILABLE', reserved_occurrence_id = null, reserved_at = null, used_at = null, cancelled_at = null
  where id = v_credit.id and status = 'RESERVED';
  insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note)
  values ('MAKEUP_CREDIT_RELEASED', v_credit.enrollment_id, v_credit.id, v_actor, btrim(p_note));
  return jsonb_build_object('ok', true, 'credit_id', v_credit.id, 'status', 'AVAILABLE');
end;
$$;

create function public.correct_source_attendance(
  p_attendance_id uuid,
  p_status text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_attendance public.attendance_records%rowtype;
  v_occurrence_status text;
  v_credit public.makeup_credits%rowtype;
begin
  v_actor := public.academic_operation_actor();
  if p_status not in ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED') then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Trạng thái điểm danh không hợp lệ.'));
  end if;
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do sửa điểm danh.'));
  end if;
  select * into v_attendance from public.attendance_records where id = p_attendance_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Không tìm thấy điểm danh.'));
  end if;
  select status into v_occurrence_status from public.session_occurrences where id = v_attendance.session_occurrence_id;
  select * into v_credit from public.makeup_credits
  where source_attendance_record_id = v_attendance.id or (source_occurrence_id = v_attendance.session_occurrence_id and enrollment_id = v_attendance.enrollment_id)
  order by created_at desc limit 1
  for update;
  if v_occurrence_status <> 'SCHEDULED' or (v_credit.id is not null and v_credit.status in ('RESERVED', 'USED')) then
    insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note, payload)
    values (
      case when v_credit.status = 'USED' then 'SOURCE_CREDIT_USED' else 'ATTENDANCE_CORRECTION_BLOCKED' end,
      v_attendance.enrollment_id, v_attendance.id, v_actor, btrim(p_note),
      jsonb_build_object('requested_status', p_status, 'credit_status', v_credit.status, 'session_status', v_occurrence_status)
    );
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Điểm danh đã khóa hoặc quyền đã đặt/đã học. Không ghi đè. Đã lưu ngoại lệ để đối soát.'), 'exception_recorded', true);
  end if;
  update public.attendance_records set status = p_status where id = v_attendance.id;
  if v_credit.id is not null and v_credit.status = 'AVAILABLE' and p_status <> 'EXCUSED' then
    update public.makeup_credits
    set status = 'CANCELLED', cancelled_at = now(), reserved_occurrence_id = null, reserved_at = null, used_at = null
    where id = v_credit.id and status = 'AVAILABLE';
  end if;
  return jsonb_build_object('ok', true, 'attendance_id', v_attendance.id, 'status', p_status);
end;
$$;

create function public.report_absence(p_attendance_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_attendance public.attendance_records%rowtype;
  v_existing uuid;
  v_type text;
  v_date date;
  v_id uuid;
begin
  v_actor := public.academic_operation_actor();
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Nhập lý do báo vắng.'));
  end if;
  select * into v_attendance from public.attendance_records where id = p_attendance_id;
  if not found then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Chưa có dòng điểm danh để gắn báo vắng.'));
  end if;
  if v_attendance.status = 'PRESENT' then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Buổi này đang là có mặt, không ghi báo vắng.'));
  end if;
  select occurrence.occurrence_type, occurrence.occurrence_date into v_type, v_date
  from public.session_occurrences occurrence where occurrence.id = v_attendance.session_occurrence_id;
  if v_type = 'REGULAR' and public.is_enrollment_paused_on(v_attendance.enrollment_id, v_date) then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Học viên đang bảo lưu ngày này. Không đánh vắng và không cấp học bù.'));
  end if;
  if v_type is null then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Không tìm thấy buổi học.'));
  end if;
  select id into v_existing from public.absence_reports where attendance_record_id = v_attendance.id;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'report_id', v_existing, 'repeated', true);
  end if;
  insert into public.absence_reports (attendance_record_id, enrollment_id, session_occurrence_id, reason, reported_by)
  values (v_attendance.id, v_attendance.enrollment_id, v_attendance.session_occurrence_id, btrim(p_reason), v_actor)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'report_id', v_id, 'confirmation', 'PENDING');
end;
$$;

create function public.confirm_absence(p_report_id uuid, p_excused boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  select * into v_report from public.absence_reports where id = p_report_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Không tìm thấy báo vắng.'));
  end if;
  v_confirmation := case when p_excused then 'EXCUSED' else 'UNEXCUSED' end;
  if v_report.confirmation = v_confirmation then
    return jsonb_build_object('ok', true, 'report_id', v_report.id, 'repeated', true);
  end if;
  select status into v_status from public.session_occurrences where id = v_report.session_occurrence_id;
  if v_status <> 'SCHEDULED' then
    insert into public.academic_operation_exceptions (kind, enrollment_id, source_id, actor_id, note, payload)
    values ('ATTENDANCE_CORRECTION_BLOCKED', v_report.enrollment_id, v_report.id, v_actor, btrim(p_note), jsonb_build_object('requested', v_confirmation));
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Buổi đã chốt nên không sửa điểm danh. Đã ghi ngoại lệ. Quyền học bù không được cấp thêm từ thao tác này.'), 'exception_recorded', true);
  end if;
  update public.attendance_records
  set status = case when p_excused then 'EXCUSED' else 'ABSENT' end
  where id = v_report.attendance_record_id;
  update public.absence_reports
  set confirmation = v_confirmation, confirmed_at = now(), confirmed_by = v_actor
  where id = v_report.id;
  return jsonb_build_object('ok', true, 'report_id', v_report.id, 'confirmation', v_confirmation, 'credit', 'Quyền học bù chỉ phát sinh một lần khi buổi thường chuyển sang đã hoàn thành và điểm danh là vắng có phép, theo sổ hiện có.');
end;
$$;

create function public.mark_makeup_credit_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  select occurrence_type into v_type from public.session_occurrences where id = new.session_occurrence_id;
  if v_type is distinct from 'MAKEUP' then
    return new;
  end if;
  if new.status = 'PRESENT' then
    update public.makeup_credits
    set status = 'USED', used_at = now()
    where enrollment_id = new.enrollment_id
      and reserved_occurrence_id = new.session_occurrence_id
      and status = 'RESERVED';
  elsif tg_op = 'UPDATE' and old.status = 'PRESENT' then
    update public.makeup_credits
    set status = 'RESERVED', used_at = null
    where enrollment_id = new.enrollment_id
      and reserved_occurrence_id = new.session_occurrence_id
      and status = 'USED';
  end if;
  return new;
end;
$$;

create trigger trg_mark_makeup_credit_from_attendance
after insert or update of status on public.attendance_records
for each row execute function public.mark_makeup_credit_from_attendance();

create or replace function public.sync_makeup_credits_from_session_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    update public.makeup_credits
    set status = 'AVAILABLE', reserved_occurrence_id = null, reserved_at = null, used_at = null, cancelled_at = null
    where reserved_occurrence_id = new.id and status = 'RESERVED';
    return new;
  end if;

  return new;
end;
$$;

create function public.pause_makeup_reconcile_report()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active_pause_overlap_pairs', (
      select count(*) from public.enrollment_pauses left_pause
      join public.enrollment_pauses right_pause
        on right_pause.enrollment_id = left_pause.enrollment_id
       and right_pause.id > left_pause.id
       and left_pause.status = 'ACTIVE' and right_pause.status = 'ACTIVE'
       and daterange(left_pause.starts_on, left_pause.ends_on, '[]') && daterange(right_pause.starts_on, right_pause.ends_on, '[]')
    ),
    'duplicate_credit_groups', (
      select count(*) from (
        select source_occurrence_id, enrollment_id
        from public.makeup_credits
        group by source_occurrence_id, enrollment_id
        having count(*) > 1
      ) duplicate_credit
    ),
    'excused_credits_without_excused_attendance', (
      select count(*) from public.makeup_credits credit
      left join public.attendance_records attendance on attendance.id = credit.source_attendance_record_id
      where credit.source_reason = 'EXCUSED'
        and (attendance.id is null or attendance.status is distinct from 'EXCUSED')
        and credit.status <> 'CANCELLED'
    ),
    'active_pauses_without_request', (
      select count(*) from public.enrollment_pauses pause
      where pause.status = 'ACTIVE'
        and not exists (select 1 from public.enrollment_pause_requests request where request.pause_id = pause.id)
    ),
    'inferred_credits_created', 0
  )
$$;

create function public.pause_makeup_desk(p_section text, p_query text, p_status text, p_page integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text := left(replace(replace(coalesce(p_query, ''), '%', ''), '_', ''), 80);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_today date := public.vietnam_today();
  v_policy public.academic_operation_policies%rowtype;
begin
  perform public.academic_operation_actor();
  select * into v_policy from public.current_academic_operation_policy();
  if p_section = 'student' then
    return jsonb_build_object(
      'pauses', coalesce((select jsonb_agg(jsonb_build_object('starts_on', pause.starts_on, 'ends_on', pause.ends_on, 'status', pause.status) order by pause.starts_on desc) from public.enrollment_pauses pause join public.enrollments enrollment on enrollment.id = pause.enrollment_id where enrollment.student_id = p_query::uuid and pause.status = 'ACTIVE'), '[]'::jsonb),
      'credits', coalesce((select jsonb_agg(jsonb_build_object('status', credit.status, 'label', case credit.status when 'AVAILABLE' then 'Còn dùng được' when 'RESERVED' then 'Đã đặt' when 'USED' then 'Đã học' when 'CANCELLED' then 'Bị thu hồi' else credit.status end)) from public.makeup_credits credit join public.enrollments enrollment on enrollment.id = credit.enrollment_id where enrollment.student_id = p_query::uuid and credit.status <> 'CANCELLED'), '[]'::jsonb),
      'absences', (select count(*) from public.absence_reports report join public.enrollments enrollment on enrollment.id = report.enrollment_id where enrollment.student_id = p_query::uuid)
    );
  end if;
  return jsonb_build_object(
    'policy_version', v_policy.version_no,
    'decisions', jsonb_build_array(
      case when v_policy.absence_report_deadline_hours is null then 'Chưa có hạn báo vắng được duyệt.' else null end,
      case when v_policy.makeup_use_within_days is null then 'Chưa có hạn học bù được duyệt. Không có quyền nào được đánh dấu hết hạn.' else null end,
      case when v_policy.max_open_makeup_credits is null then 'Chưa có số lần học bù tối đa được duyệt.' else null end,
      case when v_policy.late_cancel_hours is null then 'Chưa có quy định hủy muộn được duyệt.' else null end,
      case when v_policy.max_pause_calendar_days is null then 'Chưa có thời lượng bảo lưu tối đa được duyệt.' else null end,
      'Chưa có quyết định hoàn tiền hoặc tạo khoản thu. Không gửi Zalo từ màn này.'
    ),
    'overview', jsonb_build_object(
      'pending', (select count(*) from public.enrollment_pause_requests where status = 'REQUESTED'),
      'active', (select count(*) from public.enrollment_pauses where status = 'ACTIVE' and starts_on <= v_today and ends_on >= v_today),
      'ending_soon', (select count(*) from public.enrollment_pauses where status = 'ACTIVE' and ends_on between v_today and v_today + 7),
      'expiring_credits', case when v_policy.makeup_use_within_days is null then null else 0 end,
      'upcoming_makeups', (select count(*) from public.session_occurrences where occurrence_type = 'MAKEUP' and status = 'SCHEDULED' and occurrence_date >= v_today),
      'exceptions', (select count(*) from public.academic_operation_exceptions where created_at > now() - interval '30 days')
    ),
    'rows', case p_section
      when 'makeup' then coalesce((
        select jsonb_agg(row_data) from (
          select jsonb_build_object(
            'credit_id', credit.id,
            'student_code', student.student_code,
            'student_name', student.full_name,
            'label', case credit.status when 'AVAILABLE' then 'Còn dùng được' when 'RESERVED' then 'Đã đặt' when 'USED' then 'Đã học' when 'CANCELLED' then 'Bị thu hồi' else credit.status end,
            'status', credit.status,
            'source_date', source.occurrence_date,
            'source_reason', credit.source_reason,
            'destination_id', credit.reserved_occurrence_id,
            'destination_date', destination.occurrence_date,
            'destination_status', destination.status,
            'capacity', class_row.capacity,
            'taken', (select count(*) from public.session_occurrence_participants participant where participant.session_occurrence_id = destination.id)
          ) as row_data
          from public.makeup_credits credit
          join public.enrollments enrollment on enrollment.id = credit.enrollment_id
          join public.students student on student.id = enrollment.student_id
          join public.session_occurrences source on source.id = credit.source_occurrence_id
          left join public.session_occurrences destination on destination.id = credit.reserved_occurrence_id
          left join public.schedules schedule on schedule.id = destination.schedule_id
          left join public.classes class_row on class_row.id = schedule.class_id
          where (v_query = '' or student.student_code ilike '%' || v_query || '%' or student.full_name ilike '%' || v_query || '%')
            and (coalesce(p_status, '') = '' or credit.status = p_status)
          order by source.occurrence_date desc, credit.id
          offset (v_page - 1) * 20 limit 20
        ) page
      ), '[]'::jsonb)
      when 'history' then coalesce((
        select jsonb_agg(row_data) from (
          select jsonb_build_object('at', event.created_at, 'event', event.event_type, 'note', event.note, 'actor_id', event.actor_id, 'enrollment_id', event.enrollment_id) as row_data
          from public.enrollment_pause_events event
          order by event.created_at desc
          offset (v_page - 1) * 20 limit 20
        ) page
      ), '[]'::jsonb)
      else coalesce((
        select jsonb_agg(row_data) from (
          select jsonb_build_object(
            'request_id', request.id,
            'student_code', student.student_code,
            'student_name', student.full_name,
            'class_code', class_row.code,
            'starts_on', request.starts_on,
            'ends_on', request.ends_on,
            'status', request.status,
            'reason', request.reason,
            'pause_id', request.pause_id
          ) as row_data
          from public.enrollment_pause_requests request
          join public.enrollments enrollment on enrollment.id = request.enrollment_id
          join public.students student on student.id = enrollment.student_id
          join public.classes class_row on class_row.id = enrollment.class_id
          where (v_query = '' or student.student_code ilike '%' || v_query || '%' or student.full_name ilike '%' || v_query || '%')
            and (coalesce(p_status, '') = '' or request.status = p_status)
          order by request.requested_at desc
          offset (v_page - 1) * 20 limit 20
        ) page
      ), '[]'::jsonb)
    end,
    'choices', coalesce((
      select jsonb_agg(jsonb_build_object('enrollment_id', enrollment.id, 'student_code', student.student_code, 'student_name', student.full_name, 'class_code', class_row.code, 'class_id', class_row.id))
      from (
        select enrollment.id, enrollment.student_id, enrollment.class_id
        from public.enrollments enrollment
        where enrollment.status = 'ACTIVE'
        order by enrollment.started_at desc nulls last
        limit 50
      ) enrollment
      join public.students student on student.id = enrollment.student_id
      join public.classes class_row on class_row.id = enrollment.class_id
      where v_query = '' or student.student_code ilike '%' || v_query || '%' or student.full_name ilike '%' || v_query || '%' or class_row.code ilike '%' || v_query || '%'
    ), '[]'::jsonb)
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'blockers', jsonb_build_array('Mã học viên hoặc bản ghi không đúng định dạng.'));
end;
$$;

revoke all on function public.vietnam_today() from public;
revoke all on function public.academic_ops_may_manage() from public;
revoke all on function public.current_academic_operation_policy() from public;
revoke all on function public.academic_operation_actor() from public;
revoke all on function public.preview_enrollment_pause(uuid, date, date) from public;
revoke all on function public.request_enrollment_pause(uuid, date, date, text) from public;
revoke all on function public.decide_enrollment_pause(uuid, boolean, text) from public;
revoke all on function public.replace_approved_pause_end(uuid, date, text) from public;
revoke all on function public.cancel_active_pause(uuid, text) from public;
revoke all on function public.restore_enrollment_shift(uuid, uuid, date, text, text) from public;
revoke all on function public.book_makeup_seat(uuid, uuid, text) from public;
revoke all on function public.cancel_makeup_booking(uuid, text) from public;
revoke all on function public.release_completed_makeup_without_present(uuid, text) from public;
revoke all on function public.correct_source_attendance(uuid, text, text) from public;
revoke all on function public.report_absence(uuid, text) from public;
revoke all on function public.confirm_absence(uuid, boolean, text) from public;
revoke all on function public.pause_makeup_reconcile_report() from public;
revoke all on function public.pause_makeup_desk(text, text, text, integer) from public;
grant execute on function public.vietnam_today() to authenticated;
grant execute on function public.academic_ops_may_manage() to authenticated;
grant execute on function public.preview_enrollment_pause(uuid, date, date) to authenticated;
grant execute on function public.request_enrollment_pause(uuid, date, date, text) to authenticated;
grant execute on function public.decide_enrollment_pause(uuid, boolean, text) to authenticated;
grant execute on function public.replace_approved_pause_end(uuid, date, text) to authenticated;
grant execute on function public.cancel_active_pause(uuid, text) to authenticated;
grant execute on function public.restore_enrollment_shift(uuid, uuid, date, text, text) to authenticated;
grant execute on function public.book_makeup_seat(uuid, uuid, text) to authenticated;
grant execute on function public.cancel_makeup_booking(uuid, text) to authenticated;
grant execute on function public.release_completed_makeup_without_present(uuid, text) to authenticated;
grant execute on function public.correct_source_attendance(uuid, text, text) to authenticated;
grant execute on function public.report_absence(uuid, text) to authenticated;
grant execute on function public.confirm_absence(uuid, boolean, text) to authenticated;
grant execute on function public.pause_makeup_reconcile_report() to authenticated;
grant execute on function public.pause_makeup_desk(text, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
