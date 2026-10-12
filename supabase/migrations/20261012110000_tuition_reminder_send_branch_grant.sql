-- Manual tuition reminder sends follow the approved branch matrix.
-- tuition.reminder.view on the reminder's branch is enough; SUPER_ADMIN remains
-- covered because tuition_branch_granted treats that role as every branch.
-- A null branch assignment is not global. This does not change
-- finish_tuition_renewal_automation from 20261012090000.

create or replace function public.tuition_reminder_send_allowed(p_reminder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.tuition_branch_granted(source.branch_id_snapshot, 'tuition.reminder.view')
  from public.tuition_reminders reminder
  join public.enrollment_tuition source on source.id = reminder.enrollment_tuition_id
  where reminder.id = p_reminder
$$;

create or replace function public.tuition_reminder_template_gate()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(public.has_role('SUPER_ADMIN'), false) or coalesce(public.tuition_care_may_enter(), false) then (
      select jsonb_build_object('enabled', template.enabled, 'provider_template_id', template.provider_template_id)
      from public.notification_templates template
      where template.template_key = 'ZALO_TUITION_REMINDER' and template.provider = 'ZALO'
      limit 1
    )
    else null
  end
$$;

revoke all on function public.tuition_reminder_send_allowed(uuid), public.tuition_reminder_template_gate() from public, anon;
grant execute on function public.tuition_reminder_send_allowed(uuid), public.tuition_reminder_template_gate() to authenticated;

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
  if not coalesce(public.tuition_reminder_send_allowed(p_reminder), false) then
    raise exception 'TUITION_SEND_UNAUTHORIZED';
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
