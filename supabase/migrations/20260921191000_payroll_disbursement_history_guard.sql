begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create function payroll_disbursement_private.guard_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'PAYROLL_DISBURSEMENT_HISTORY_IMMUTABLE';
  end if;

  if old.status <> 'ACTIVE' or new.status <> 'CANCELLED' then
    raise exception 'PAYROLL_DISBURSEMENT_HISTORY_IMMUTABLE';
  end if;

  if new.id is distinct from old.id
    or new.payroll_id is distinct from old.payroll_id
    or new.period_id is distinct from old.period_id
    or new.employee_id is distinct from old.employee_id
    or new.branch_id is distinct from old.branch_id
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.paid_on is distinct from old.paid_on
    or new.payment_method is distinct from old.payment_method
    or new.reference is distinct from old.reference
    or new.note is distinct from old.note
    or new.request_key is distinct from old.request_key
    or new.request_payload is distinct from old.request_payload
    or new.request_result is distinct from old.request_result
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.cancelled_by is null
    or new.cancelled_at is null
    or new.cancel_reason is null
    or new.cancel_request_key is null
    or new.cancel_request_payload is null
    or new.cancel_request_result is null
  then
    raise exception 'PAYROLL_DISBURSEMENT_HISTORY_IMMUTABLE';
  end if;

  return new;
end;
$fn$;

create trigger payroll_disbursement_history_guard
before update or delete on public.payroll_disbursements
for each row execute function payroll_disbursement_private.guard_history();

commit;
