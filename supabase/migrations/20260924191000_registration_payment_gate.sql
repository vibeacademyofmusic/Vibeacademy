-- Registration is successful only after an issued invoice is fully settled.
-- Existing completed records are left intact for explicit reconciliation.
create or replace function public.require_paid_registration_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    if new.invoice_id is null or not public.registration_invoice_settled(new.invoice_id) then
      raise exception 'REGISTRATION_PAYMENT_REQUIRED';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists require_paid_registration_completion on public.registration_applications;
create trigger require_paid_registration_completion
before update on public.registration_applications
for each row execute function public.require_paid_registration_completion();
