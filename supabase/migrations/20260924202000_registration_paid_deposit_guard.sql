-- A paid partial deposit is already money received. Staff may not cancel the
-- application through the older transition RPC while that receipt is unresolved.
create function public.guard_registration_paid_deposit_cancellation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status in ('CANCELLED', 'REJECTED', 'EXPIRED')
     and old.status is distinct from new.status
     and exists (select 1 from public.registration_momo_orders ord
                 where ord.application_id = old.id and ord.state = 'PAID') then
    raise exception 'REGISTRATION_PAID_DEPOSIT_REQUIRES_REFUND_REVIEW';
  end if;
  return new;
end $$;

create trigger registration_paid_deposit_cancellation
before update of status on public.registration_applications
for each row execute function public.guard_registration_paid_deposit_cancellation();

revoke all on function public.guard_registration_paid_deposit_cancellation()
from public, anon, authenticated;
