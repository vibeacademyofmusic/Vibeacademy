-- The approved matrix grants tuition.reminder.view for reading a branch and
-- tuition.renewal.prepare for preparing a renewal. Neither permission sends a
-- reminder. Sending requires tuition.reminder.send on the reminder branch.
-- This migration does not grant that permission to TUITION_CARE, OPERATIONS_LEAD,
-- or FINANCE. SUPER_ADMIN still passes through tuition_branch_granted.

insert into public.permissions(code, name, module, description)
values (
  'tuition.reminder.send',
  'Gửi nhắc học phí qua Zalo trong chi nhánh được giao',
  'tuition',
  'Send a tuition reminder for one assigned branch'
)
on conflict (code) do nothing;

create or replace function public.tuition_reminder_send_allowed(p_reminder uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.tuition_branch_granted(source.branch_id_snapshot, 'tuition.reminder.send')
  from public.tuition_reminders reminder
  join public.enrollment_tuition source on source.id = reminder.enrollment_tuition_id
  where reminder.id = p_reminder
$$;

revoke all on function public.tuition_reminder_send_allowed(uuid) from public, anon;
grant execute on function public.tuition_reminder_send_allowed(uuid) to authenticated;
