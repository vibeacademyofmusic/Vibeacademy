-- First ZBS template mapping for staging.
-- Stores catalogue readiness only. Does not enable sending.
-- provider_template_id stays null until set through the admin RPC.

do $$
declare
  status_check name;
begin
  select constraint_row.conname
  into status_check
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.notification_templates'::regclass
    and constraint_row.contype = 'c'
    and pg_get_constraintdef(constraint_row.oid) like '%DRAFT%APPROVED%DISABLED%';
  if status_check is not null then
    execute format('alter table public.notification_templates drop constraint %I', status_check);
  end if;
end $$;

alter table public.notification_templates
  add constraint notification_templates_status_check
  check (status in ('DRAFT', 'PENDING', 'APPROVED', 'DISABLED'));

update public.notification_templates
set
  status = 'PENDING',
  enabled = false,
  description = 'Xác nhận đăng ký'
where template_key = 'ZALO_REGISTRATION_CONFIRMED'
  and provider = 'ZALO';

create or replace function public.set_notification_template_mapping(
  p_template_key text,
  p_provider_template_id text,
  p_status text default 'PENDING'
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  if p_template_key is distinct from 'ZALO_REGISTRATION_CONFIRMED' then
    raise exception 'Unsupported notification template';
  end if;
  if p_status is null or p_status not in ('PENDING', 'APPROVED') then
    raise exception 'Invalid template status';
  end if;
  if p_provider_template_id is null or p_provider_template_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'Provider template id required';
  end if;
  if p_status = 'APPROVED' and nullif(btrim(p_provider_template_id), '') is null then
    raise exception 'Approved template requires a provider template id';
  end if;
  update public.notification_templates
  set
    provider_template_id = p_provider_template_id,
    status = p_status,
    enabled = false
  where template_key = p_template_key
    and provider = 'ZALO';
  if not found then
    raise exception 'Notification template not found';
  end if;
end $$;

revoke all on function public.set_notification_template_mapping(text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.set_notification_template_mapping(text, text, text) to authenticated;
