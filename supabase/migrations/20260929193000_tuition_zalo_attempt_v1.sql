-- Local tuition Zalo attempt record.
-- Stores an explicit consent and the send result. Does not call Zalo
-- and does not mark the tuition reminder itself as sent.

create table public.tuition_zalo_consents (
  student_id uuid not null references public.students(id),
  parent_id uuid not null references public.parents(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (student_id, parent_id)
);

alter table public.tuition_zalo_consents enable row level security;
revoke all on public.tuition_zalo_consents from public, anon, authenticated, service_role;
grant select on public.tuition_zalo_consents to authenticated;
create policy tuition_zalo_consents_admin_read
  on public.tuition_zalo_consents
  for select to authenticated
  using (public.has_role('SUPER_ADMIN'));

create function public.record_tuition_zalo_attempt(
  p_reminder uuid,
  p_parent uuid,
  p_outcome text,
  p_error text default null,
  p_receipt text default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reminder public.tuition_reminders;
  parent_user uuid;
  job_id uuid;
  job_status text;
  key text;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  if p_outcome not in ('ERROR', 'SENT') then
    raise exception 'Invalid tuition Zalo outcome';
  end if;
  if p_outcome = 'SENT' and (p_error is not null or nullif(btrim(coalesce(p_receipt, '')), '') is null) then
    raise exception 'Sent tuition Zalo requires provider receipt';
  end if;
  if p_outcome = 'ERROR' and p_error is distinct from 'PROVIDER_NOT_CONFIGURED' then
    raise exception 'Invalid tuition Zalo error';
  end if;
  select * into reminder from public.tuition_reminders where id = p_reminder;
  if not found then
    raise exception 'Tuition reminder not found';
  end if;
  select user_id into parent_user from public.parents where id = p_parent and status = 'ACTIVE';
  if not found then
    raise exception 'Tuition recipient not found';
  end if;
  key := 'TUITION_ZALO:' || p_reminder::text || ':' || p_parent::text;
  insert into public.notification_jobs(
    recipient_id, recipient_subject_type, recipient_subject_id, student_id, branch_id,
    channel, delivery_mode, template_key, payload, entity_type, entity_id,
    idempotency_key, status, attempts, error_code, provider_receipt, sent_at, created_by
  )
  select parent_user, 'PARENT', p_parent, enrollment.student_id, tuition.branch_id_snapshot,
    'ZALO', 'MOCK', 'ZALO_TUITION_REMINDER',
    jsonb_build_object('template_key', 'ZALO_TUITION_REMINDER', 'outcome', p_outcome),
    'TUITION_REMINDER', p_reminder, key,
    case when p_outcome = 'SENT' then 'SENT' else 'FAILED' end,
    1,
    case when p_outcome = 'ERROR' then p_error else null end,
    case when p_outcome = 'SENT' then p_receipt else null end,
    case when p_outcome = 'SENT' then clock_timestamp() else null end,
    auth.uid()
  from public.enrollment_tuition tuition
  join public.enrollments enrollment on enrollment.id = tuition.enrollment_id
  where tuition.id = reminder.enrollment_tuition_id
  on conflict (idempotency_key) do nothing
  returning id into job_id;
  select status into job_status from public.notification_jobs where idempotency_key = key;
  if job_id is not null then
    insert into public.notification_events(job_id, event, actor_id, details)
    values (job_id, case when p_outcome = 'SENT' then 'CONFIRMED' else 'FAILED' end, auth.uid(),
      jsonb_build_object('mode', 'MOCK', 'error_code', p_error));
  end if;
  return case job_status when 'SENT' then 'SENT' when 'DELIVERED' then 'SENT' when 'FAILED' then 'ERROR' else 'NOT_SENT' end;
end $$;

revoke all on function public.record_tuition_zalo_attempt(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.record_tuition_zalo_attempt(uuid, uuid, text, text, text) to authenticated;
