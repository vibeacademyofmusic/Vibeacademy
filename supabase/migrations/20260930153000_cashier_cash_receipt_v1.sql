-- Branch cashier may record physically received cash only.
-- Recording cash does not grant reconciliation, reversal, refund,
-- manual transfer verification, or permission management.

begin;

insert into public.permissions(code, name, module)
select code, name, 'finance'
from (values
  ('finance.cash.record', 'Record physically received cash and issue the receipt'),
  ('finance.payment.record', 'Record a non-cash payment inside an assigned branch'),
  ('finance.payment.reconcile', 'Reconcile a posted payment inside an assigned branch')
) as permission(code, name)
on conflict (code) do nothing;

insert into public.roles(code, name, is_system)
values ('CASHIER', 'Thu ngân', true)
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on (
  (role.code = 'CASHIER' and permission.code = 'finance.cash.record')
  or (role.code = 'FINANCE' and permission.code in ('finance.cash.record', 'finance.payment.record', 'finance.payment.reconcile'))
)
on conflict do nothing;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'students.view'
where role.code = 'CASHIER'
on conflict do nothing;

create or replace function public.cashier_may_enter()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.account_is_active(), false)
    and exists (
      select 1
      from public.user_roles assignment
      join public.roles role on role.id = assignment.role_id
      join public.role_permissions grant_row on grant_row.role_id = role.id
      join public.permissions permission on permission.id = grant_row.permission_id
      where assignment.user_id = auth.uid()
        and assignment.is_active
        and assignment.branch_id is not null
        and (assignment.valid_from is null or assignment.valid_from <= now())
        and (assignment.valid_until is null or assignment.valid_until > now())
        and permission.code in ('finance.cash.record', 'finance.payment.record')
    )
$$;

revoke all on function public.cashier_may_enter() from public, anon, authenticated;
grant execute on function public.cashier_may_enter() to authenticated;

drop function public.create_payment_once(uuid, uuid, uuid, numeric, text, text, timestamptz, text, text);

create function public.create_payment_once(
  p_idempotency_key uuid,
  p_student_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_paid_at timestamptz,
  p_reference text default null,
  p_notes text default null,
  p_cash_acknowledged boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request public.payment_entry_requests;
  payload jsonb;
  payment uuid;
  method text := upper(trim(p_payment_method));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null then
    raise exception 'Payment request key required' using errcode = 'P0001';
  end if;
  if method in ('PAYOS', 'MOMO') then
    raise exception 'Manual transfer verification is not allowed' using errcode = 'P0001';
  elsif method = 'CASH' then
    if p_cash_acknowledged is not true then
      raise exception 'Cash receipt requires physical receipt acknowledgement' using errcode = 'P0001';
    end if;
    if not coalesce(public.has_permission('finance.cash.record', p_branch_id), false) then
      raise exception 'Cash receipt permission required' using errcode = 'P0001';
    end if;
  elsif not coalesce(public.has_permission('finance.payment.record', p_branch_id), false) then
    raise exception 'Payment recording permission required' using errcode = 'P0001';
  end if;
  payload := jsonb_build_object(
    'student', p_student_id,
    'branch', p_branch_id,
    'amount', p_amount,
    'currency', upper(trim(p_currency)),
    'method', method,
    'paid_at', extract(epoch from p_paid_at),
    'reference', nullif(trim(p_reference), ''),
    'notes', nullif(trim(p_notes), ''),
    'cash_acknowledged', p_cash_acknowledged
  );
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));
  select * into request from public.payment_entry_requests where request_id = p_idempotency_key;
  if found then
    if request.created_by is distinct from auth.uid() or request.payload is distinct from payload then
      raise exception 'Payment request key reused with different input' using errcode = 'P0001';
    end if;
    return request.payment_id;
  end if;
  if method = 'CASH' then
    perform set_config('vibe.cash_acknowledged', 'yes', true);
  end if;
  payment := public.create_payment(p_student_id, p_branch_id, p_amount, p_currency, method, p_paid_at, p_reference, p_notes);
  insert into public.payment_entry_requests(request_id, created_by, payload, payment_id)
  values (p_idempotency_key, auth.uid(), payload, payment);
  return payment;
end
$$;

revoke all on function public.create_payment_once(uuid, uuid, uuid, numeric, text, text, timestamptz, text, text, boolean) from public, anon;
grant execute on function public.create_payment_once(uuid, uuid, uuid, numeric, text, text, timestamptz, text, text, boolean) to authenticated;

create or replace function public.create_payment(
  p_student_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_paid_at timestamptz default now(),
  p_reference text default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch public.branches%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_payment_number text;
  v_currency text;
  v_method text;
begin
  v_method := upper(btrim(coalesce(p_payment_method, '')));
  if not (
    (v_method = 'CASH' and coalesce(public.has_permission('finance.cash.record', p_branch_id), false))
    or (v_method <> 'CASH' and coalesce(public.has_permission('finance.payment.record', p_branch_id), false))
  ) then
    raise exception 'SUPER_ADMIN role required' using errcode = 'P0001';
  end if;
  if v_method = 'CASH'
    and coalesce(current_setting('vibe.cash_acknowledged', true), '') is distinct from 'yes'
    and not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'Cash receipt requires physical receipt acknowledgement' using errcode = 'P0001';
  end if;
  if p_student_id is null then raise exception 'Student id is required' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'Student not found' using errcode = 'P0001';
  end if;
  if p_branch_id is null then raise exception 'Branch id is required' using errcode = 'P0001'; end if;
  select * into v_branch from public.branches where id = p_branch_id;
  if not found then raise exception 'Branch not found' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = 'P0001';
  end if;
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Payment currency must be a three-letter ISO code' using errcode = 'P0001';
  end if;
  if v_method not in ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER') then
    raise exception 'Invalid payment method' using errcode = 'P0001';
  end if;
  if p_paid_at is null then raise exception 'Payment date is required' using errcode = 'P0001'; end if;
  v_payment_number := 'PAY-' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY') || '-' || lpad(nextval('public.payment_number_seq')::text, 6, '0');
  insert into public.payments (
    id, payment_number, student_id_snapshot, branch_id_snapshot, branch_code_snapshot, branch_name_snapshot,
    amount, currency, payment_method, paid_at, reference, notes, status
  ) values (
    v_payment_id, v_payment_number, p_student_id, p_branch_id, v_branch.code, v_branch.name,
    p_amount, v_currency, v_method, p_paid_at,
    nullif(btrim(coalesce(p_reference, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    'POSTED'
  );
  return v_payment_id;
end
$$;

create policy cashier_payment_read on public.payments
for select to authenticated
using (
  public.has_permission('finance.cash.record', branch_id_snapshot)
  or public.has_permission('finance.payment.record', branch_id_snapshot)
);

commit;
