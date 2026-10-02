-- Accept the new button "Yêu cầu khác" as CONTACT.
-- Keep historical "Dừng học" as STOP. Do not rewrite stored button text.
-- The approved Zalo template 643118 is unchanged.

do $$
declare
  item record;
begin
  for item in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.tuition_zalo_replies'::regclass, 'public.tuition_zalo_reply_states'::regclass)
      and pg_get_constraintdef(oid) ~ 'reply_choice|button_data'
  loop
    execute format('alter table %s drop constraint %I', item.table_name, item.conname);
  end loop;
end $$;

alter table public.tuition_zalo_replies
  add constraint tuition_zalo_replies_reply_choice_check
    check (reply_choice in ('CONTINUE', 'STOP', 'CONTACT')),
  add constraint tuition_zalo_replies_button_data_check
    check (button_data in ('Tiếp tục học', 'Dừng học', 'Yêu cầu khác')),
  add constraint tuition_zalo_replies_choice_label_check
    check (
      (reply_choice = 'CONTINUE' and button_data = 'Tiếp tục học')
      or (reply_choice = 'STOP' and button_data = 'Dừng học')
      or (reply_choice = 'CONTACT' and button_data = 'Yêu cầu khác')
    );

alter table public.tuition_zalo_reply_states
  add constraint tuition_zalo_reply_states_reply_choice_check
    check (reply_choice in ('CONTINUE', 'STOP', 'CONTACT')),
  add column contact_note text,
  add column contact_noted_at timestamptz,
  add column contact_noted_by uuid references auth.users(id),
  add constraint tuition_zalo_reply_states_contact_note_check
    check (
      (contact_note is null and contact_noted_at is null and contact_noted_by is null)
      or (
        nullif(btrim(contact_note), '') is not null
        and char_length(contact_note) <= 2000
        and contact_noted_at is not null
        and contact_noted_by is not null
      )
    );

create or replace function public.record_tuition_zalo_reply(
  p_source text,
  p_tracking text,
  p_message_id text,
  p_button text,
  p_submit_ms text,
  p_oa_id text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  choice text;
  submit_at timestamptz;
  reply_event_key text;
  send public.tuition_zalo_sends;
  inserted uuid;
  different boolean;
begin
  if p_source is null or p_source not in ('Zalo ZBS', 'Zalo response report import', 'Zalo response API') then
    return 'invalid_source';
  end if;
  if p_oa_id is null or p_oa_id !~ '^[0-9]{8,32}$' then
    return 'oa_mismatch';
  end if;
  if p_message_id is null or p_message_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    return 'invalid_message';
  end if;
  if p_button = 'Tiếp tục học' then
    choice := 'CONTINUE';
  elsif p_button = 'Dừng học' then
    choice := 'STOP';
  elsif p_button = 'Yêu cầu khác' then
    choice := 'CONTACT';
  else
    return 'invalid_button';
  end if;
  if p_tracking is null or p_tracking !~ '^[A-Za-z0-9]{1,48}$' then
    return 'invalid_tracking';
  end if;
  if p_submit_ms is null or p_submit_ms !~ '^[0-9]{13}$' then
    return 'invalid_time';
  end if;
  submit_at := to_timestamp(p_submit_ms::numeric / 1000.0);
  select * into send from public.tuition_zalo_sends where tracking_id = p_tracking for update;
  if not found then
    return 'unknown_tracking';
  end if;
  if send.send_status not in ('SENT', 'DELIVERED') or send.provider_message_id is null then
    return 'send_not_accepted';
  end if;
  if send.provider_message_id is distinct from p_message_id then
    return 'message_mismatch';
  end if;
  if send.oa_id is not null and send.oa_id is distinct from p_oa_id then
    return 'oa_mismatch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tuition-zalo-reply:' || send.reminder_id::text, 0));
  if exists (
    select 1 from public.tuition_zalo_replies reply
    where reply.tracking_id = p_tracking
      and reply.provider_message_id = p_message_id
      and reply.button_data = p_button
      and floor(extract(epoch from reply.submit_time)) = floor(extract(epoch from submit_at))
  ) then
    return 'duplicate';
  end if;
  different := exists (
    select 1 from public.tuition_zalo_replies reply
    where reply.provider_message_id = p_message_id
      and reply.tracking_id = p_tracking
      and reply.button_data <> p_button
  );
  reply_event_key := p_tracking || ':' || p_submit_ms || ':' || p_button || ':' || p_message_id;
  insert into public.tuition_zalo_replies(
    send_id, reminder_id, student_id, tracking_id, reply_choice, button_data,
    submit_time, provider_message_id, oa_id, source, event_key
  ) values (
    send.id, send.reminder_id, send.student_id, p_tracking, choice, p_button,
    submit_at, p_message_id, p_oa_id, p_source, reply_event_key
  )
  on conflict (event_key) do nothing
  returning id into inserted;
  if inserted is null then
    return 'duplicate';
  end if;
  if exists (
    select 1 from public.tuition_zalo_reply_states state
    where state.reminder_id = send.reminder_id
      and state.student_id <> send.student_id
  ) then
    raise exception 'Tuition reply student mismatch';
  end if;
  insert into public.tuition_zalo_reply_states(
    reminder_id, student_id, reply_choice, submit_time, needs_review, updated_at
  )
  select send.reminder_id, send.student_id, picked.reply_choice, picked.submit_time,
    (
      select count(distinct prior.reply_choice) > 1
      from public.tuition_zalo_replies prior
      where prior.reminder_id = send.reminder_id
    ),
    clock_timestamp()
  from (
    select reply.reply_choice, reply.submit_time
    from public.tuition_zalo_replies reply
    where reply.reminder_id = send.reminder_id
    order by reply.submit_time desc, reply.received_at desc, reply.seq desc
    limit 1
  ) picked
  on conflict (reminder_id) do update
  set reply_choice = excluded.reply_choice,
      submit_time = excluded.submit_time,
      needs_review = excluded.needs_review,
      updated_at = excluded.updated_at
  where public.tuition_zalo_reply_states.student_id = excluded.student_id;
  if different then
    return 'conflict';
  end if;
  return 'recorded';
end $$;

create or replace function public.import_tuition_zalo_response_report(
  p_filename text,
  p_sha256 text,
  p_sheet text,
  p_row integer,
  p_template_id text,
  p_app_id text,
  p_oa_id text,
  p_student_code text,
  p_tracking_id text,
  p_message_id text,
  p_submit_time_raw text,
  p_method text,
  p_response text,
  p_actor uuid
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  send public.tuition_zalo_sends;
  matches integer;
  submit_at timestamptz;
  submit_ms text;
  outcome text;
  inserted uuid;
begin
  if p_actor is null or not exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    join public.profiles profile on profile.id = assignment.user_id
    where assignment.user_id = p_actor
      and role.code = 'SUPER_ADMIN'
      and assignment.branch_id is null
      and assignment.is_active
      and profile.status = 'ACTIVE'
      and (assignment.valid_from is null or assignment.valid_from <= clock_timestamp())
      and (assignment.valid_until is null or assignment.valid_until > clock_timestamp())
  ) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  if p_filename is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_sheet is null or p_row is null or p_row < 2 then
    return 'invalid_report';
  end if;
  if p_submit_time_raw is null or p_submit_time_raw !~ '^[0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{2}/[0-9]{2}/[0-9]{4}$' then
    return 'invalid_time';
  end if;
  if p_method is distinct from 'phone' then
    return 'method_rejected';
  end if;
  if p_response not in ('Tiếp tục học', 'Dừng học', 'Yêu cầu khác') then
    return 'invalid_button';
  end if;
  if p_tracking_id !~ '^[A-Za-z0-9]{1,48}$' or p_message_id !~ '^[A-Za-z0-9_-]{1,80}$' or p_oa_id !~ '^[0-9]{8,32}$' or p_app_id !~ '^[0-9]{8,32}$' or p_template_id !~ '^[0-9]{1,20}$' then
    return 'invalid_report';
  end if;
  if exists (
    select 1 from public.tuition_zalo_reply_imports prior
    where prior.sha256 = p_sha256 and prior.sheet = p_sheet and prior.sheet_row = p_row
  ) then
    return 'duplicate';
  end if;
  if not exists (
    select 1 from public.notification_templates template
    where template.template_key = 'ZALO_TUITION_REMINDER'
      and template.provider_template_id = p_template_id
  ) then
    return 'template_mismatch';
  end if;
  if p_app_id is distinct from (
    select credential.app_id from notification_private.zalo_credentials credential
    where credential.oa_id = p_oa_id
    limit 1
  ) then
    return 'app_mismatch';
  end if;
  select count(*) into matches
  from public.tuition_zalo_sends candidate
  where candidate.tracking_id = p_tracking_id
     or candidate.provider_message_id = p_message_id;
  if matches <> 1 then
    return 'ambiguous';
  end if;
  select * into send
  from public.tuition_zalo_sends candidate
  where candidate.tracking_id = p_tracking_id
    and candidate.provider_message_id = p_message_id
  for update;
  if not found or send.send_status not in ('SENT', 'DELIVERED') or send.template_key <> 'ZALO_TUITION_REMINDER' or send.oa_id is distinct from p_oa_id then
    return 'mismatch';
  end if;
  if not exists (
    select 1 from public.students student
    where student.id = send.student_id and student.student_code = p_student_code
  ) then
    return 'student_mismatch';
  end if;
  submit_at := (to_timestamp(p_submit_time_raw, 'HH24:MI:SS DD/MM/YYYY') at time zone 'UTC') at time zone 'Asia/Ho_Chi_Minh';
  if to_char(submit_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI:SS DD/MM/YYYY') is distinct from p_submit_time_raw then
    return 'invalid_time';
  end if;
  if submit_at < send.sent_at then
    return 'invalid_time';
  end if;
  submit_ms := (floor(extract(epoch from submit_at) * 1000))::bigint::text;
  outcome := public.record_tuition_zalo_reply('Zalo response report import', p_tracking_id, p_message_id, p_response, submit_ms, p_oa_id);
  if outcome = 'duplicate' then
    return 'duplicate';
  end if;
  if outcome not in ('recorded', 'conflict') then
    return outcome;
  end if;
  select id into inserted from public.tuition_zalo_replies where event_key = p_tracking_id || ':' || submit_ms || ':' || p_response || ':' || p_message_id;
  insert into public.tuition_zalo_reply_imports(
    reply_id, filename, sha256, sheet, sheet_row, template_id, app_id, oa_id, student_code,
    tracking_id, message_id, method, response_text, submit_time_raw, submit_timezone, submit_time, actor_id, result
  ) values (
    inserted, p_filename, p_sha256, p_sheet, p_row, p_template_id, p_app_id, p_oa_id, p_student_code,
    p_tracking_id, p_message_id, p_method, p_response, p_submit_time_raw, 'Asia/Ho_Chi_Minh', submit_at, p_actor, outcome
  );
  return outcome;
end $$;

create or replace function public.record_tuition_zalo_api_reply(
  p_template_id text,
  p_app_id text,
  p_oa_id text,
  p_row_oa_id text,
  p_tracking_id text,
  p_message_id text,
  p_button text,
  p_submit_ms text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  outcome text;
  reply uuid;
  submit_at timestamptz;
begin
  if p_template_id is null or p_template_id !~ '^[0-9]{1,20}$' or p_app_id is null or p_app_id !~ '^[0-9]{8,32}$' then
    return 'invalid_report';
  end if;
  if p_oa_id is null or p_row_oa_id is distinct from p_oa_id then
    outcome := 'oa_mismatch';
  elsif not exists (
    select 1 from public.notification_templates template
    where template.template_key = 'ZALO_TUITION_REMINDER'
      and template.provider_template_id = p_template_id
  ) then
    outcome := 'template_mismatch';
  elsif p_app_id is distinct from (
    select credential.app_id from notification_private.zalo_credentials credential
    where credential.oa_id = p_oa_id
    limit 1
  ) then
    outcome := 'app_mismatch';
  elsif p_submit_ms is null or p_submit_ms !~ '^[0-9]{13}$' then
    outcome := 'invalid_time';
  elsif exists (
    select 1 from public.tuition_zalo_sends candidate
    where candidate.tracking_id = p_tracking_id
      and candidate.sent_at is not null
      and candidate.sent_at > to_timestamp(p_submit_ms::numeric / 1000.0)
  ) then
    outcome := 'invalid_time';
  else
    outcome := public.record_tuition_zalo_reply('Zalo response API', p_tracking_id, p_message_id, p_button, p_submit_ms, p_oa_id);
  end if;
  if p_submit_ms ~ '^[0-9]{13}$' and p_tracking_id ~ '^[A-Za-z0-9]{1,48}$' and p_message_id ~ '^[A-Za-z0-9_-]{1,80}$' and p_button in ('Tiếp tục học', 'Dừng học', 'Yêu cầu khác') and p_oa_id ~ '^[0-9]{8,32}$' then
    submit_at := to_timestamp(p_submit_ms::numeric / 1000.0);
    if exists (
      select 1 from public.tuition_zalo_reply_api_events prior
      where prior.tracking_id = p_tracking_id
        and prior.message_id = p_message_id
        and prior.response_text = p_button
        and prior.submit_time = submit_at
        and prior.result = outcome
    ) then
      return outcome;
    end if;
    select id into reply
    from public.tuition_zalo_replies
    where event_key = p_tracking_id || ':' || p_submit_ms || ':' || p_button || ':' || p_message_id;
    insert into public.tuition_zalo_reply_api_events(
      reply_id, template_id, app_id, oa_id, tracking_id, message_id, response_text, submit_time, result
    ) values (
      reply, p_template_id, p_app_id, p_oa_id, p_tracking_id, p_message_id, p_button, submit_at, outcome
    );
  end if;
  return outcome;
end $$;

create or replace function public.record_tuition_zalo_contact_note(p_reminder uuid, p_note text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  state public.tuition_zalo_reply_states;
begin
  if auth.uid() is null or not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  if p_note is null or nullif(btrim(p_note), '') is null or char_length(btrim(p_note)) > 2000 then
    raise exception 'Invalid tuition contact note';
  end if;
  select * into state from public.tuition_zalo_reply_states where reminder_id = p_reminder for update;
  if not found or state.reply_choice is distinct from 'CONTACT' then
    raise exception 'Tuition contact note requires the current other-request reply';
  end if;
  update public.tuition_zalo_reply_states
  set contact_note = btrim(p_note),
      contact_noted_at = clock_timestamp(),
      contact_noted_by = auth.uid()
  where reminder_id = p_reminder
    and reply_choice = 'CONTACT';
  return 'noted';
end $$;

revoke all on function public.record_tuition_zalo_contact_note(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.record_tuition_zalo_contact_note(uuid, text) to authenticated;

create or replace view public.tuition_reminder_operations with (security_invoker = true) as
select r.id, r.enrollment_tuition_id, r.window_start, r.window_end, r.status, r.marked_at, r.reason,
  et.enrollment_id, et.tuition_plan_id, et.starts_on, et.effective_ends_on, et.plan_name_snapshot,
  et.branch_id_snapshot, et.branch_name_snapshot, et.amount, et.currency, e.student_id, s.full_name, s.student_code,
  r.event_code, et.duration_months_snapshot,
  case
    when r.event_code = 'BALANCE_50_V1' and et.duration_months_snapshot = 12 then r.window_start
    when r.event_code = 'RENEWAL_V1' and et.duration_months_snapshot = 3 then r.window_start + 14
    else null
  end as red_on,
  state.reply_choice,
  state.submit_time as reply_submit_time,
  state.needs_review as reply_needs_review,
  state.contact_note,
  state.contact_noted_at,
  note_author.full_name as contact_noted_by_name
from tuition_reminders r
join enrollment_tuition et on et.id = r.enrollment_tuition_id
join enrollments e on e.id = et.enrollment_id
join students s on s.id = e.student_id
left join public.tuition_zalo_reply_states state on state.reminder_id = r.id
left join public.profiles note_author on note_author.id = state.contact_noted_by;
