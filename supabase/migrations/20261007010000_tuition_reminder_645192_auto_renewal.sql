-- Cut new tuition reminder sends over to ZBS template 645192 and automate CONTINUE -> renewal -> PayOS -> 645028.
-- Historical sends keep provider_template_id = 643118 (send snapshot is the callback authority).
-- Forward-only. Excel/report import stays an emergency path.

update public.notification_templates
set provider_template_id = '645192',
    status = 'APPROVED',
    parameter_schema = '["student_name","student_code","days_left","period","amount","due_date"]'::jsonb,
    description = 'VIBE - Xác nhận tiếp tục học V2. Mẫu ZBS 645192 (ENABLE). Nút phản hồi: Tiếp Tục Học, Liên Hệ. Tham số: student_name, student_code, days_left (số), period, amount (số), due_date (số).',
    updated_at = clock_timestamp()
where template_key = 'ZALO_TUITION_REMINDER' and provider = 'ZALO';

-- Service-role (server automation) may act on renewals; users still need the branch grant.
create or replace function public.tuition_renewal_authorized(p_branch uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.momo_service_request(), false) or public.tuition_branch_granted(p_branch, 'tuition.renewal.prepare')
$$;

-- Accept the live 645192 buttons; legacy 643118 / replacement labels keep working for late callbacks.
create or replace function public.tuition_zalo_canonical_button(p_button text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_button
    when 'Tiếp Tục Học' then 'Tiếp tục học'
    when 'Liên Hệ' then 'Yêu cầu khác'
    else p_button end
$$;

create or replace function public.apply_tuition_zalo_response(p_payload jsonb, p_oa_id text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare message jsonb; candidate public.tuition_zalo_sends; outcome text;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then return 'invalid_payload'; end if;
  if p_payload->>'event_name' is distinct from 'user_click_response_button' then return 'ignored'; end if;
  if p_oa_id is null or p_payload->>'oa_id' is distinct from p_oa_id then return 'oa_mismatch'; end if;
  if coalesce(p_payload->>'app_id','') !~ '^[0-9]{8,32}$' then return 'app_mismatch'; end if;
  if coalesce(p_payload->>'timestamp','') !~ '^[0-9]{10,16}$' then return 'invalid_time'; end if;
  message:=p_payload->'message';
  if jsonb_typeof(message) is distinct from 'object' then return 'invalid_message'; end if;
  if message->>'button_type' is distinct from 'response' then return 'invalid_button'; end if;
  select * into candidate from tuition_zalo_sends where tracking_id=message->>'tracking_id';
  if found and candidate.context_captured_at is not null then
    if candidate.app_id is distinct from p_payload->>'app_id' then return 'app_mismatch'; end if;
    if candidate.oa_id is distinct from p_oa_id then return 'oa_mismatch'; end if;
    if coalesce(message->>'template_id','') <> '' and candidate.provider_template_id is distinct from message->>'template_id' then return 'template_mismatch'; end if;
  end if;
  outcome:=public.record_tuition_zalo_reply('Zalo ZBS',message->>'tracking_id',p_payload->>'msg_id',public.tuition_zalo_canonical_button(message->>'data'),message->>'submit_time',p_oa_id);
  return case when outcome='conflict' then 'recorded' else outcome end;
end $$;

-- A new send is allowed after the template cutover when the earlier send used another template and drew no reply.
create or replace function public.begin_tuition_zalo_send(p_reminder uuid, p_parent uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  reminder public.tuition_reminders;
  student uuid;
  tuition uuid;
  tracking text;
  created uuid;
  current_template text;
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  select * into reminder from public.tuition_reminders where id = p_reminder;
  if not found or reminder.status <> 'PENDING' then
    raise exception 'Tuition reminder not found';
  end if;
  if reminder.window_start > today then
    raise exception 'Tuition Zalo window has not started';
  end if;
  select enrollment.student_id, tuition_row.id
    into student, tuition
  from public.enrollment_tuition tuition_row
  join public.enrollments enrollment on enrollment.id = tuition_row.enrollment_id
  join public.branches branch on branch.id = tuition_row.branch_id_snapshot
  where tuition_row.id = reminder.enrollment_tuition_id
    and enrollment.student_id is not null;
  if not found then
    raise exception 'Tuition reminder branch mismatch';
  end if;
  if not exists (
    select 1
    from public.student_parents link
    join public.parents parent on parent.id = link.parent_id and parent.status = 'ACTIVE'
    where link.student_id = student
      and link.parent_id = p_parent
      and link.can_view_finance
      and link.is_active
      and (link.valid_from is null or link.valid_from <= clock_timestamp())
      and (link.valid_until is null or link.valid_until > clock_timestamp())
  ) then
    raise exception 'Tuition recipient not found';
  end if;
  if not exists (
    select 1 from public.tuition_zalo_consents consent
    where consent.student_id = student
      and consent.parent_id = p_parent
      and consent.revoked_at is null
  ) then
    raise exception 'Tuition Zalo consent required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tuition-zalo-send:' || p_reminder::text, 0));
  select provider_template_id into current_template from public.notification_templates
    where template_key = 'ZALO_TUITION_REMINDER' and provider = 'ZALO';
  if exists (
    select 1 from public.tuition_zalo_sends send
    where send.reminder_id = reminder.id
      and (
        send.send_status = 'PREPARED'
        or (send.send_status in ('SENT', 'DELIVERED') and (
          send.provider_template_id is not distinct from current_template
          or exists (select 1 from public.tuition_zalo_replies reply where reply.reminder_id = reminder.id)
        ))
      )
  ) then
    raise exception 'Tuition Zalo already prepared';
  end if;
  tracking := replace(gen_random_uuid()::text, '-', '');
  insert into public.tuition_zalo_sends(
    tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, template_key, send_status
  ) values (
    tracking, reminder.id, student, p_parent, tuition, 'ZALO_TUITION_REMINDER', 'PREPARED'
  ) returning id into created;
  return jsonb_build_object(
    'send_id', created,
    'tracking_id', tracking,
    'reminder_id', reminder.id,
    'student_id', student
  );
end $$;

-- Activation boundary: only replies received after this instant, to sends created after it, drive automation.
create table if not exists public.tuition_renewal_automation_settings (
  singleton boolean primary key default true check (singleton),
  activated_at timestamptz not null
);
insert into public.tuition_renewal_automation_settings(singleton, activated_at) values (true, clock_timestamp()) on conflict do nothing;

create table if not exists public.tuition_renewal_automation (
  reminder_id uuid primary key references public.tuition_reminders(id),
  reply_id uuid references public.tuition_zalo_replies(id),
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','DONE','HELD')),
  step text,
  error_code text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.tuition_renewal_automation_settings enable row level security;
alter table public.tuition_renewal_automation enable row level security;
revoke all on public.tuition_renewal_automation_settings, public.tuition_renewal_automation from public, anon, authenticated;

create or replace function public.claim_tuition_renewal_automation(p_limit integer default 5)
returns table(reminder_id uuid, attempts integer) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'AUTOMATION_SERVER_ONLY'; end if;
  insert into public.tuition_renewal_automation(reminder_id, reply_id)
  select state.reminder_id, (
      select r.id from public.tuition_zalo_replies r
      where r.reminder_id = state.reminder_id and r.reply_choice = 'CONTINUE'
      order by r.seq desc limit 1)
  from public.tuition_zalo_reply_states state
  join public.tuition_renewal_automation_settings cfg on cfg.singleton
  where state.reply_choice = 'CONTINUE'
    and exists (
      select 1 from public.tuition_zalo_replies r
      join public.tuition_zalo_sends s on s.id = r.send_id
      where r.reminder_id = state.reminder_id and r.reply_choice = 'CONTINUE'
        and r.received_at >= cfg.activated_at and s.created_at >= cfg.activated_at)
  on conflict do nothing;
  return query
  with picked as (
    select a.reminder_id from public.tuition_renewal_automation a
    join public.tuition_zalo_reply_states state on state.reminder_id = a.reminder_id and state.reply_choice = 'CONTINUE'
    where (a.status = 'PENDING' and a.next_attempt_at <= clock_timestamp())
       or (a.status = 'PROCESSING' and a.locked_until < clock_timestamp())
    order by a.created_at limit greatest(1, least(coalesce(p_limit, 5), 20))
    for update of a skip locked
  )
  update public.tuition_renewal_automation a
  set status = 'PROCESSING', attempts = a.attempts + 1, locked_until = clock_timestamp() + interval '2 minutes', updated_at = clock_timestamp()
  from picked where a.reminder_id = picked.reminder_id
  returning a.reminder_id, a.attempts;
end $$;

create or replace function public.finish_tuition_renewal_automation(p_reminder uuid, p_status text, p_step text, p_error text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare rec public.tuition_renewal_automation;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'AUTOMATION_SERVER_ONLY'; end if;
  if p_status not in ('PENDING','DONE','HELD') then raise exception 'AUTOMATION_STATUS_REJECTED'; end if;
  select * into rec from public.tuition_renewal_automation where reminder_id = p_reminder for update;
  if not found then return 'MISSING'; end if;
  update public.tuition_renewal_automation
  set status = case when p_status = 'PENDING' and rec.attempts >= 6 then 'HELD' else p_status end,
      step = left(p_step, 40), error_code = left(p_error, 80), locked_until = null,
      next_attempt_at = clock_timestamp() + make_interval(secs => least(1800, 60 * power(2, least(rec.attempts, 5))::integer)),
      updated_at = clock_timestamp()
  where reminder_id = p_reminder;
  return p_status;
end $$;

-- Open (or reuse) the renewal case for a CONTINUE reply. Never creates a second case or invoice.
create or replace function public.auto_begin_tuition_renewal(p_reminder uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.tuition_renewal_cases;
  source public.enrollment_tuition;
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
  begun jsonb;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'AUTOMATION_SERVER_ONLY'; end if;
  if not exists (select 1 from public.tuition_zalo_reply_states where reminder_id = p_reminder and reply_choice = 'CONTINUE') then
    return jsonb_build_object('result', 'not_continue');
  end if;
  select * into existing from public.tuition_renewal_cases where reminder_id = p_reminder;
  if found then
    return jsonb_build_object('result', 'existing', 'case_id', existing.id, 'invoice_id', existing.invoice_id, 'state', existing.state);
  end if;
  select et.* into source from public.tuition_reminders r join public.enrollment_tuition et on et.id = r.enrollment_tuition_id where r.id = p_reminder;
  if not found then return jsonb_build_object('result', 'source_missing'); end if;
  begun := public.begin_tuition_renewal(p_reminder, 'VIBE_3_MONTHS', 'DEPOSIT_50', source.effective_ends_on + 1,
    greatest(source.effective_ends_on, today), 'Tự động từ phản hồi Tiếp Tục Học', null);
  return begun;
end $$;

revoke all on function public.claim_tuition_renewal_automation(integer), public.finish_tuition_renewal_automation(uuid,text,text,text), public.auto_begin_tuition_renewal(uuid) from public, anon, authenticated;
grant execute on function public.claim_tuition_renewal_automation(integer), public.finish_tuition_renewal_automation(uuid,text,text,text), public.auto_begin_tuition_renewal(uuid) to service_role;
