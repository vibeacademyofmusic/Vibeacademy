-- Restore existing main manual workflow, verified against pre-edit schema snapshot and 122 passing tests.
-- Main originally checked invoice settlement only IF an invoice existed.
-- Counter/provider registrations keep the new strict verified-receipt requirement.
-- No source secrets, data, permissions or finance posting changes.
-- Rollback: a global stricter gate requires explicit migration of legacy callers first.
begin;
create or replace function public.require_paid_registration_completion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Preserve main's pre-consolidation manual registration contract.
  -- New counter registrations carry curriculum_id; provider payments carry terms.
  if new.curriculum_id is null and new.invoice_id is null
    and not exists (select 1 from public.registration_deposit_terms where application_id=new.id) then
    return new;
  end if;
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    if not (new.invoice_id is not null and public.registration_invoice_settled(new.invoice_id))
       and not exists (
         select 1 from public.registration_deposit_terms terms
         where terms.application_id = new.id and new.deposit_confirmed_at is not null
           and (
             coalesce((select sum(ord.amount) from public.registration_momo_orders ord
                       where ord.application_id = new.id and ord.state = 'PAID'), 0)
             + coalesce((select sum(ord.attributed_amount) from public.registration_payos_orders ord
                         where ord.application_id = new.id and ord.state = 'PAID'), 0)
           ) >= terms.amount_due
       ) then
      raise exception 'REGISTRATION_PAYMENT_REQUIRED';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.require_paid_registration_completion() from public,anon,authenticated,service_role;
commit;
