-- Consolidation batch 2: additive provider evidence and authoritative finance receipts.
-- Reviewed against main schema, not a transplant of the preview migration ledger.
-- Main placement RPCs, Academic/HR and core payment/allocation functions remain authoritative.
-- No preview business rows are imported. New tables are empty; historical main records are unchanged.
-- Rollback: disable provider configuration first; retain receipts/orders for audit. Never delete payments.
-- Use migration ledger exactly once; callbacks and allocation RPCs remain idempotent.

-- Reviewed source: 20260924191000_registration_payment_gate.sql
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

-- Reviewed source: 20260924200000_registration_momo_deposits.sql
-- A registration deposit exists before a student or class enrollment exists.
-- These receipts must not be inserted into the post-enrollment payments ledger a second time.
alter table public.registration_applications add column deposit_confirmed_at timestamptz;
create table public.registration_deposit_terms (
  application_id uuid primary key references public.registration_applications(id),
  branch_id uuid not null references public.branches(id),
  tuition_plan_id uuid not null references public.tuition_plans(id),
  price_id uuid not null references public.tuition_plan_branch_prices(id),
  tuition_amount bigint not null check (tuition_amount > 0),
  deposit_due bigint generated always as ((tuition_amount + 1) / 2) stored,
  currency text not null default 'VND' check (currency = 'VND'),
  quoted_by uuid not null references auth.users(id),
  quoted_at timestamptz not null default clock_timestamp(),
  check (tuition_amount <= 100000000)
);

create table public.registration_momo_orders (
  id uuid primary key,
  application_id uuid not null references public.registration_applications(id),
  order_id text not null unique,
  request_id text not null unique,
  amount bigint not null check (amount > 0),
  partner_code text,
  state text not null default 'RESERVED' check (state in ('RESERVED', 'READY', 'PAID', 'FAILED', 'EXPIRED')),
  pay_url text,
  provider_transaction_id text unique,
  finance_payment_id uuid unique references public.payments(id),
  created_at timestamptz not null default clock_timestamp(),
  paid_at timestamptz,
  check (state <> 'PAID' or (provider_transaction_id is not null and paid_at is not null))
);
create unique index registration_one_open_momo_order
on public.registration_momo_orders(application_id)
where state in ('RESERVED', 'READY');

create table public.registration_momo_ipn_events (
  id bigint generated always as identity primary key,
  order_id text not null references public.registration_momo_orders(order_id),
  provider_transaction_id text not null,
  result_code integer not null,
  amount bigint not null,
  received_at timestamptz not null default clock_timestamp(),
  unique (order_id, provider_transaction_id)
);

-- System events have no human actor. Do not attribute a provider callback to the registrar.
alter table public.registration_application_events alter column actor_id drop not null;
alter table public.student_placement_events alter column actor_id drop not null;

alter table public.registration_deposit_terms enable row level security;
alter table public.registration_momo_orders enable row level security;
alter table public.registration_momo_ipn_events enable row level security;
revoke all on public.registration_deposit_terms, public.registration_momo_orders,
  public.registration_momo_ipn_events from public, anon, authenticated;
grant select on public.registration_deposit_terms, public.registration_momo_orders to authenticated;
grant select on public.registration_momo_orders to service_role;
create policy registration_deposit_terms_read on public.registration_deposit_terms
for select to authenticated using (public.registration_can('registration.view', branch_id));
create policy registration_momo_orders_read on public.registration_momo_orders
for select to authenticated using (exists (
  select 1 from public.registration_applications app
  where app.id = application_id and public.registration_can('registration.view', app.branch_id)
));

create function public.momo_service_request() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(auth.jwt()->>'role', nullif(current_setting('request.jwt.claim.role', true), '')) = 'service_role'
$$;

create function public.set_registration_deposit_quote(p_application uuid, p_version integer, p_plan uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
  price public.tuition_plan_branch_prices%rowtype;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  if app.status <> 'VERIFIED' or p_plan is null
     or exists(select 1 from public.registration_momo_orders where application_id = p_application)
     or not exists(select 1 from public.tuition_plans where id = p_plan and status = 'ACTIVE') then
    raise exception 'REGISTRATION_QUOTE_DENIED';
  end if;
  select * into price from public.tuition_plan_branch_prices
  where tuition_plan_id = p_plan and status = 'ACTIVE' and currency = 'VND'
    and (branch_id = app.branch_id or branch_id is null)
  order by (branch_id = app.branch_id) desc, created_at desc limit 1;
  if not found or price.list_price <= 0 or price.list_price > 100000000
     or price.list_price <> trunc(price.list_price) then
    raise exception 'REGISTRATION_PRICE_UNAVAILABLE';
  end if;
  insert into public.registration_deposit_terms(application_id, branch_id,
    tuition_plan_id, price_id, tuition_amount, quoted_by)
  values (app.id, app.branch_id, p_plan, price.id, price.list_price::bigint, auth.uid())
  on conflict(application_id) do update set tuition_plan_id = excluded.tuition_plan_id,
    price_id = excluded.price_id, tuition_amount = excluded.tuition_amount,
    quoted_by = excluded.quoted_by, quoted_at = clock_timestamp();
  return app.id;
end $$;

create function public.reserve_registration_momo_order(p_application uuid, p_request uuid, p_version integer, p_amount bigint)
returns public.registration_momo_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype; terms public.registration_deposit_terms%rowtype;
  existing public.registration_momo_orders%rowtype; result public.registration_momo_orders%rowtype;
  paid_total bigint;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  if p_request is null then raise exception 'MOMO_REQUEST_INVALID'; end if;
  select * into existing from public.registration_momo_orders where id = p_request;
  if found then
    if existing.application_id <> app.id then raise exception 'MOMO_REQUEST_CONFLICT'; end if;
    return existing;
  end if;
  if app.status not in ('VERIFIED', 'PAYMENT_PENDING') then raise exception 'MOMO_ORDER_DENIED'; end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  if not found then raise exception 'REGISTRATION_QUOTE_REQUIRED'; end if;
  select coalesce(sum(amount), 0)::bigint into paid_total from public.registration_momo_orders
    where application_id = app.id and state = 'PAID';
  select * into existing from public.registration_momo_orders
    where application_id = app.id and state in ('RESERVED', 'READY') limit 1;
  if found then return existing; end if;
  if p_amount is null or p_amount < 1000 or p_amount > 50000000
     or p_amount > terms.tuition_amount - paid_total then
    raise exception 'MOMO_AMOUNT_INVALID';
  end if;
  insert into public.registration_momo_orders(id, application_id, order_id, request_id, amount)
  values(p_request, app.id, 'VIBE' || upper(replace(p_request::text, '-', '')),
    'REQ' || upper(replace(p_request::text, '-', '')), p_amount)
  returning * into result;
  return result;
end $$;

create function public.activate_registration_momo_order(
  p_order_id text, p_partner_code text, p_amount bigint, p_pay_url text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare ord public.registration_momo_orders%rowtype;
  app public.registration_applications%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then
    raise exception 'MOMO_SERVER_ONLY';
  end if;
  select * into ord from public.registration_momo_orders where order_id = p_order_id;
  if not found then raise exception 'MOMO_CHECKOUT_MISMATCH'; end if;
  select * into app from public.registration_applications where id = ord.application_id for update;
  select * into ord from public.registration_momo_orders where order_id = p_order_id for update;
  if not found or ord.amount is distinct from p_amount or nullif(p_partner_code, '') is null
     or p_pay_url is null or p_pay_url !~ '^https://(test-payment|payment)[.]momo[.]vn/' then
    raise exception 'MOMO_CHECKOUT_MISMATCH';
  end if;
  if ord.state = 'READY' and ord.partner_code = p_partner_code and ord.pay_url = p_pay_url then
    return ord.id;
  end if;
  if ord.state <> 'RESERVED' then raise exception 'MOMO_ORDER_STATE_CONFLICT'; end if;
  update public.registration_momo_orders set partner_code = p_partner_code,
    pay_url = p_pay_url, state = 'READY' where id = ord.id;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set status = 'PAYMENT_PENDING', version = version + 1,
    updated_at = clock_timestamp() where id = ord.application_id and status = 'VERIFIED';
  perform set_config('registration.write', 'off', true);
  return ord.id;
end $$;

create function public.complete_momo_deposit_registration(p_application uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
  student_id uuid; parent_id uuid; placement_id uuid; finance_id uuid;
  ord public.registration_momo_orders%rowtype; branch public.branches%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then
    raise exception 'MOMO_SERVER_ONLY';
  end if;
  select * into app from public.registration_applications where id = p_application for update;
  if app.status = 'COMPLETED' then return 'ALREADY_COMPLETED'; end if;
  if app.status <> 'PAID' or app.deposit_confirmed_at is null then
    raise exception 'REGISTRATION_PAYMENT_REQUIRED';
  end if;
  if nullif(btrim(coalesce(app.student_name, '')), '') is null or app.student_date_of_birth is null
     or nullif(btrim(coalesce(app.parent_name, '')), '') is null then
    return 'REVIEW_INCOMPLETE_IDENTITY';
  end if;
  -- Serialize the duplicate check across distinct applications for the same identity.
  perform pg_advisory_xact_lock(hashtextextended(
    lower(btrim(app.student_name)) || ':' || app.student_date_of_birth::text, 0));
  if exists(select 1 from public.students s where s.date_of_birth = app.student_date_of_birth
     and lower(btrim(coalesce(s.full_name, ''))) = lower(btrim(app.student_name))) then
    return 'REVIEW_POSSIBLE_DUPLICATE';
  end if;
  student_id := gen_random_uuid();
  parent_id := gen_random_uuid();
  placement_id := gen_random_uuid();
  perform set_config('registration.write', 'on', true);
  insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status)
  values(student_id, null, btrim(app.student_name), app.student_date_of_birth,
    app.branch_id, public.registration_vietnam_today(), 'ACTIVE');
  insert into public.parents(id, parent_code, status)
  values(parent_id, 'PH-' || substr(replace(parent_id::text, '-', ''), 1, 8), 'ACTIVE');
  insert into public.student_parents(student_id, parent_id, relationship, is_primary)
  values(student_id, parent_id, 'GUARDIAN', true);
  insert into public.student_placement_cases(id, student_id, registration_application_id,
    branch_id, status, desired_start_date, preferred_schedule)
  values(placement_id, student_id, app.id, app.branch_id, 'UNASSIGNED',
    app.desired_start_date, app.preferred_schedule);
  select * into branch from public.branches where id = app.branch_id;
  for ord in select * from public.registration_momo_orders
    where application_id = app.id and state = 'PAID' order by paid_at for update loop
    finance_id := gen_random_uuid();
    insert into public.payments(id, payment_number, student_id_snapshot, branch_id_snapshot,
      branch_code_snapshot, branch_name_snapshot, amount, currency, payment_method,
      paid_at, reference, notes, status)
    values(finance_id, 'PAY-' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY') || '-'
      || lpad(nextval('public.payment_number_seq')::text, 6, '0'), student_id,
      branch.id, branch.code, branch.name, ord.amount, 'VND', 'OTHER', ord.paid_at,
      'MOMO:' || ord.provider_transaction_id, 'Cọc hồ sơ ' || app.application_code, 'POSTED');
    update public.registration_momo_orders set finance_payment_id = finance_id where id = ord.id;
  end loop;
  update public.registration_applications set linked_student_id = student_id,
    linked_parent_id = parent_id, status = 'COMPLETED', completed_at = clock_timestamp(),
    version = version + 1, updated_at = clock_timestamp() where id = app.id;
  insert into public.registration_application_events(id, application_id, event_type,
    from_status, to_status, actor_id, metadata)
  values(gen_random_uuid(), app.id, 'REGISTRATION_COMPLETED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'MOMO_DEPOSIT', 'student_id', student_id, 'parent_id', parent_id)),
    (gen_random_uuid(), app.id, 'PLACEMENT_OPENED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'MOMO_DEPOSIT', 'placement_id', placement_id));
  insert into public.student_placement_events(id, placement_id, event_type, actor_id)
  values(gen_random_uuid(), placement_id, 'PLACEMENT_OPENED', null);
  perform set_config('registration.write', 'off', true);
  return 'COMPLETED';
end $$;

-- Manual identity review can complete a paid application later; post its receipts then.
create function public.post_reviewed_momo_deposit_receipts()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare ord public.registration_momo_orders%rowtype;
  branch public.branches%rowtype; finance_id uuid;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' or new.deposit_confirmed_at is null then
    return new;
  end if;
  select * into branch from public.branches where id = new.branch_id;
  for ord in select * from public.registration_momo_orders
    where application_id = new.id and state = 'PAID' and finance_payment_id is null
    order by paid_at for update loop
    finance_id := gen_random_uuid();
    insert into public.payments(id, payment_number, student_id_snapshot, branch_id_snapshot,
      branch_code_snapshot, branch_name_snapshot, amount, currency, payment_method,
      paid_at, reference, notes, status)
    values(finance_id, 'PAY-' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY') || '-'
      || lpad(nextval('public.payment_number_seq')::text, 6, '0'), new.linked_student_id,
      branch.id, branch.code, branch.name, ord.amount, 'VND', 'OTHER', ord.paid_at,
      'MOMO:' || ord.provider_transaction_id, 'Cọc hồ sơ ' || new.application_code, 'POSTED');
    update public.registration_momo_orders set finance_payment_id = finance_id where id = ord.id;
  end loop;
  return new;
end $$;

create trigger post_reviewed_momo_deposit_receipts
after update of status on public.registration_applications
for each row execute function public.post_reviewed_momo_deposit_receipts();

-- This RPC is only callable by the server's service role AFTER HMAC verification.
-- Invalid or duplicate notifications do not create receipts.
create function public.record_verified_momo_ipn(
  p_order_id text, p_partner_code text, p_transaction_id text,
  p_amount bigint, p_result_code integer
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare ord public.registration_momo_orders%rowtype;
  app public.registration_applications%rowtype;
  terms public.registration_deposit_terms%rowtype;
  paid_total bigint;
begin
  if not coalesce(public.momo_service_request(), false) then
    raise exception 'MOMO_SERVER_ONLY';
  end if;
  select * into ord from public.registration_momo_orders where order_id = p_order_id;
  if not found then raise exception 'MOMO_ORDER_MISMATCH'; end if;
  select * into app from public.registration_applications where id = ord.application_id for update;
  select * into ord from public.registration_momo_orders where order_id = p_order_id for update;
  if not found or ord.state not in ('READY', 'PAID') or ord.partner_code is distinct from p_partner_code
     or p_transaction_id is null or p_transaction_id = '' or p_amount is distinct from ord.amount then
    raise exception 'MOMO_ORDER_MISMATCH';
  end if;
  if p_result_code <> 0 then return 'IGNORED_NON_SUCCESS'; end if;
  if ord.state = 'PAID' then
    if ord.provider_transaction_id <> p_transaction_id then raise exception 'MOMO_TRANSACTION_CONFLICT'; end if;
    return 'ALREADY_PAID';
  end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  if not found or app.status not in ('VERIFIED', 'PAYMENT_PENDING') then
    raise exception 'REGISTRATION_DEPOSIT_MISMATCH';
  end if;
  insert into public.registration_momo_ipn_events(order_id, provider_transaction_id, result_code, amount)
    values(ord.order_id, p_transaction_id, p_result_code, p_amount);
  update public.registration_momo_orders set state = 'PAID', provider_transaction_id = p_transaction_id,
    paid_at = clock_timestamp() where id = ord.id;
  select coalesce(sum(amount), 0)::bigint into paid_total from public.registration_momo_orders
    where application_id = app.id and state = 'PAID';
  if paid_total < terms.deposit_due then return 'PARTIAL_DEPOSIT'; end if;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set status = 'PAID',
    deposit_confirmed_at = clock_timestamp(), version = version + 1,
    updated_at = clock_timestamp() where id = app.id;
  perform set_config('registration.write', 'off', true);
  return public.complete_momo_deposit_registration(app.id);
end $$;

-- Keep the invoice timestamp tied to an invoice; the deposit has its own timestamp.
create or replace function public.require_paid_registration_completion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    if not (new.invoice_id is not null and public.registration_invoice_settled(new.invoice_id))
       and not exists (
         select 1 from public.registration_deposit_terms terms
         where terms.application_id = new.id and new.deposit_confirmed_at is not null
           and (select coalesce(sum(ord.amount), 0) from public.registration_momo_orders ord
                where ord.application_id = new.id and ord.state = 'PAID') >= terms.deposit_due
       ) then
      raise exception 'REGISTRATION_PAYMENT_REQUIRED';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.set_registration_deposit_quote(uuid,integer,uuid),
  public.reserve_registration_momo_order(uuid,uuid,integer,bigint),
  public.activate_registration_momo_order(text,text,bigint,text),
  public.complete_momo_deposit_registration(uuid),
  public.record_verified_momo_ipn(text,text,text,bigint,integer) from public, anon;
grant execute on function public.set_registration_deposit_quote(uuid,integer,uuid),
  public.reserve_registration_momo_order(uuid,uuid,integer,bigint) to authenticated;
revoke all on function public.activate_registration_momo_order(text,text,bigint,text),
  public.complete_momo_deposit_registration(uuid),
  public.record_verified_momo_ipn(text,text,text,bigint,integer) from authenticated;
grant execute on function public.activate_registration_momo_order(text,text,bigint,text),
  public.complete_momo_deposit_registration(uuid),
  public.record_verified_momo_ipn(text,text,text,bigint,integer) to service_role;
revoke all on function public.post_reviewed_momo_deposit_receipts() from public, anon, authenticated;
revoke all on function public.momo_service_request() from public, anon, authenticated;


-- Reviewed source: 20260924202000_registration_paid_deposit_guard.sql
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

-- Reviewed source: 20260924203000_momo_system_event_actor.sql
-- MoMo completion is a provider event, not a staff action.
-- The existing actor check only allowed a null actor for Zalo link results.
alter table public.registration_application_events
  drop constraint registration_application_events_actor_check;

alter table public.registration_application_events
  add constraint registration_application_events_actor_check
  check (
    actor_id is not null
    or event_type in (
      'ZALO_LINK_CONFIRMED',
      'ZALO_LINK_FAILED',
      'REGISTRATION_COMPLETED',
      'PLACEMENT_OPENED'
    )
  );

-- Reviewed source: 20260924210000_registration_agreed_tuition_snapshot.sql
-- Snapshot the agreed tuition, not only the list price.
-- deposit_due stays ceil(agreed VND / 2) via the existing generated column.
-- A quote can be replaced only before any MoMo order exists.
-- After a class invoice exists, each deposit receipt is allocated once.

alter table public.registration_deposit_terms
  add column list_amount bigint,
  add column discount_type text not null default 'NONE',
  add column discount_value numeric(14,2) not null default 0,
  add column discount_name text,
  add column discount_amount bigint not null default 0;

update public.registration_deposit_terms
set list_amount = tuition_amount
where list_amount is null;

alter table public.registration_deposit_terms
  alter column list_amount set not null;

alter table public.registration_deposit_terms
  add constraint registration_deposit_terms_discount_check check (
    discount_type in ('NONE', 'PERCENT', 'FIXED')
    and discount_value >= 0
    and discount_amount >= 0
    and list_amount = tuition_amount + discount_amount
    and list_amount <= 100000000
    and (discount_type = 'NONE' or nullif(btrim(discount_name), '') is not null)
  );

drop function public.set_registration_deposit_quote(uuid, integer, uuid);

create function public.set_registration_deposit_quote(
  p_application uuid,
  p_version integer,
  p_plan uuid,
  p_discount_type text default 'NONE',
  p_discount_value numeric default 0,
  p_discount_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app public.registration_applications%rowtype;
  price public.tuition_plan_branch_prices%rowtype;
  discount_type text;
  discount_amount numeric;
  list_amount bigint;
  agreed bigint;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  discount_type := upper(coalesce(nullif(btrim(p_discount_type), ''), 'NONE'));
  if app.status <> 'VERIFIED' or p_plan is null
     or exists(select 1 from public.registration_momo_orders where application_id = p_application)
     or not exists(select 1 from public.tuition_plans where id = p_plan and status = 'ACTIVE') then
    raise exception 'REGISTRATION_QUOTE_DENIED';
  end if;
  if discount_type <> 'NONE' and nullif(btrim(p_discount_name), '') is null then
    raise exception 'REGISTRATION_DISCOUNT_EVIDENCE_REQUIRED';
  end if;
  select * into price from public.tuition_plan_branch_prices
  where tuition_plan_id = p_plan and status = 'ACTIVE' and currency = 'VND'
    and (branch_id = app.branch_id or branch_id is null)
  order by (branch_id = app.branch_id) desc, created_at desc limit 1;
  if not found or price.list_price <= 0 or price.list_price > 100000000
     or price.list_price <> trunc(price.list_price) then
    raise exception 'REGISTRATION_PRICE_UNAVAILABLE';
  end if;
  discount_amount := public.calculate_tuition_discount_amount(
    price.list_price, discount_type, coalesce(p_discount_value, 0));
  if discount_amount <> trunc(discount_amount) then
    raise exception 'REGISTRATION_DISCOUNT_NOT_WHOLE_VND';
  end if;
  list_amount := price.list_price::bigint;
  agreed := list_amount - discount_amount::bigint;
  if agreed <= 0 or agreed > 100000000 then
    raise exception 'REGISTRATION_PRICE_UNAVAILABLE';
  end if;
  insert into public.registration_deposit_terms(
    application_id, branch_id, tuition_plan_id, price_id, tuition_amount, quoted_by,
    list_amount, discount_type, discount_value, discount_name, discount_amount)
  values (
    app.id, app.branch_id, p_plan, price.id, agreed, auth.uid(),
    list_amount, discount_type, coalesce(p_discount_value, 0),
    nullif(btrim(p_discount_name), ''), discount_amount::bigint)
  on conflict (application_id) do update set
    tuition_plan_id = excluded.tuition_plan_id,
    price_id = excluded.price_id,
    tuition_amount = excluded.tuition_amount,
    quoted_by = excluded.quoted_by,
    quoted_at = clock_timestamp(),
    list_amount = excluded.list_amount,
    discount_type = excluded.discount_type,
    discount_value = excluded.discount_value,
    discount_name = excluded.discount_name,
    discount_amount = excluded.discount_amount;
  return app.id;
end $$;

create function public.allocate_registration_deposits_to_invoice(
  p_application uuid,
  p_invoice uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app public.registration_applications%rowtype;
  invoice public.invoices%rowtype;
  receipt record;
  outstanding numeric;
  allocated integer := 0;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  if p_application is null or p_invoice is null then
    raise exception 'REGISTRATION_INVALID';
  end if;
  select * into app from public.registration_applications where id = p_application for update;
  if not found or app.status <> 'COMPLETED' or app.linked_student_id is null then
    raise exception 'REGISTRATION_ALLOCATION_DENIED';
  end if;
  select * into invoice from public.invoices where id = p_invoice for update;
  if not found or invoice.status <> 'ISSUED'
     or invoice.student_id_snapshot <> app.linked_student_id
     or invoice.branch_id_snapshot <> app.branch_id then
    raise exception 'REGISTRATION_INVOICE_MISMATCH';
  end if;
  for receipt in
    select payment.id, payment.amount
    from public.registration_momo_orders ord
    join public.payments payment on payment.id = ord.finance_payment_id
    where ord.application_id = app.id and ord.state = 'PAID' and payment.status = 'POSTED'
    order by ord.paid_at, ord.id
    for update of payment
  loop
    if exists (
      select 1 from public.payment_allocations allocation
      where allocation.payment_id = receipt.id and allocation.invoice_id = invoice.id
    ) then
      continue;
    end if;
    select outstanding_balance into outstanding
    from public.invoice_receivables where invoice_id = invoice.id;
    if coalesce(outstanding, 0) <= 0 then
      exit;
    end if;
    perform public.allocate_payment_to_invoice(
      receipt.id, invoice.id, least(receipt.amount, outstanding));
    allocated := allocated + 1;
  end loop;
  if app.invoice_id is null then
    perform set_config('registration.write', 'on', true);
    update public.registration_applications
    set invoice_id = invoice.id, updated_at = clock_timestamp()
    where id = app.id and invoice_id is null;
    perform set_config('registration.write', 'off', true);
  end if;
  return allocated;
end $$;

revoke all on function public.set_registration_deposit_quote(uuid, integer, uuid, text, numeric, text)
  from public, anon;
grant execute on function public.set_registration_deposit_quote(uuid, integer, uuid, text, numeric, text)
  to authenticated;
revoke all on function public.allocate_registration_deposits_to_invoice(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.allocate_registration_deposits_to_invoice(uuid, uuid)
  to authenticated;


-- Reviewed source: 20260925013000_registration_branch_payment_option.sql
-- Branch prices are authoritative. A null-branch fallback must not win for Cần Thơ:
-- ORDER BY (branch_id = app.branch_id) DESC sorts NULL first, so the 4,500,000
-- default was snapshotted ahead of the 5,500,000 branch row.
-- Existing quotes are not rewritten. New quotes store the payment option and
-- the immediate amount due. Completion uses that snapshot, not a later price list.

alter table public.registration_deposit_terms
  add column payment_option text,
  add column amount_due bigint;

update public.registration_deposit_terms
set payment_option = 'DEPOSIT_50',
    amount_due = deposit_due
where payment_option is null or amount_due is null;

alter table public.registration_deposit_terms
  alter column payment_option set not null,
  alter column amount_due set not null;

alter table public.registration_deposit_terms
  add constraint registration_deposit_terms_payment_option_check check (
    payment_option in ('DEPOSIT_50', 'FULL')
    and amount_due > 0
    and (
      (payment_option = 'DEPOSIT_50' and amount_due = deposit_due)
      or (payment_option = 'FULL' and amount_due = tuition_amount)
    )
  );

alter table public.registration_application_events
  drop constraint registration_application_events_event_type_check;

alter table public.registration_application_events
  add constraint registration_application_events_event_type_check
  check (event_type in (
    'CREATED', 'SUBMITTED', 'VERIFIED', 'PAYMENT_CONFIRMED', 'IDENTITY_REVIEWED',
    'STUDENT_LINKED', 'PARENT_LINKED', 'ENROLLMENT_CREATED', 'REGISTRATION_COMPLETED',
    'PLACEMENT_OPENED', 'CANCELLED',
    'ZALO_LINK_REQUESTED', 'ZALO_LINK_CONFIRMED', 'ZALO_LINK_FAILED',
    'BRANCH_SET', 'QUOTE_CORRECTED'
  ));

create function public.registration_authoritative_list_price(p_branch uuid, p_plan uuid)
returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when plan.code = 'VIBE_3_MONTHS' and branch_is_can_tho then 5500000
    when plan.code = 'VIBE_12_MONTHS' and branch_is_can_tho then 16500000
    when plan.code = 'VIBE_3_MONTHS' then 4500000
    when plan.code = 'VIBE_12_MONTHS' then 13500000
    else null
  end
  from public.tuition_plans plan
  cross join lateral (
    select exists (
      select 1 from public.branches branch
      where branch.id = p_branch
        and (branch.code in ('V01', 'CT01') or branch.name = 'Vibe Academy Cần Thơ')
    ) as branch_is_can_tho
  ) branch
  where plan.id = p_plan;
$$;

create function public.guard_registration_branch_after_quote()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.branch_id is distinct from old.branch_id
     and exists (select 1 from public.registration_deposit_terms where application_id = new.id)
     and coalesce(current_setting('registration.quote_correction', true), '') <> 'on' then
    raise exception 'REGISTRATION_BRANCH_LOCKED';
  end if;
  return new;
end $$;

create trigger registration_branch_after_quote
before update of branch_id on public.registration_applications
for each row execute function public.guard_registration_branch_after_quote();

drop function public.set_registration_deposit_quote(uuid, integer, uuid, text, numeric, text);

create function public.set_registration_deposit_quote(
  p_application uuid,
  p_version integer,
  p_plan uuid,
  p_discount_type text default 'NONE',
  p_discount_value numeric default 0,
  p_discount_name text default null,
  p_payment_option text default 'DEPOSIT_50'
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.registration_applications%rowtype;
  plan public.tuition_plans%rowtype;
  price public.tuition_plan_branch_prices%rowtype;
  discount_type text;
  payment_option text;
  discount_amount numeric;
  list_amount bigint;
  agreed bigint;
  due bigint;
  expected bigint;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  discount_type := upper(coalesce(nullif(btrim(p_discount_type), ''), 'NONE'));
  payment_option := upper(coalesce(nullif(btrim(p_payment_option), ''), 'DEPOSIT_50'));
  if app.status <> 'VERIFIED' or p_plan is null
     or payment_option not in ('DEPOSIT_50', 'FULL')
     or exists(select 1 from public.registration_momo_orders where application_id = p_application) then
    raise exception 'REGISTRATION_QUOTE_DENIED';
  end if;
  select * into plan from public.tuition_plans where id = p_plan and status = 'ACTIVE';
  if not found then raise exception 'REGISTRATION_QUOTE_DENIED'; end if;
  if discount_type <> 'NONE' and nullif(btrim(p_discount_name), '') is null then
    raise exception 'REGISTRATION_DISCOUNT_EVIDENCE_REQUIRED';
  end if;
  expected := public.registration_authoritative_list_price(app.branch_id, p_plan);
  if plan.code in ('VIBE_3_MONTHS', 'VIBE_12_MONTHS') then
    select * into price from public.tuition_plan_branch_prices
    where tuition_plan_id = p_plan and status = 'ACTIVE' and currency = 'VND'
      and list_price = expected
      and (
        branch_id = app.branch_id
        or (
          branch_id is null
          and not exists (
            select 1 from public.tuition_plan_branch_prices specific
            where specific.tuition_plan_id = p_plan
              and specific.branch_id = app.branch_id
              and specific.status = 'ACTIVE'
          )
        )
      )
    order by (branch_id = app.branch_id) desc nulls last, created_at desc
    limit 1;
  else
    select * into price from public.tuition_plan_branch_prices
    where tuition_plan_id = p_plan and status = 'ACTIVE' and currency = 'VND'
      and branch_id = app.branch_id
    order by created_at desc limit 1;
  end if;
  if not found or price.list_price <= 0 or price.list_price > 100000000
     or price.list_price <> trunc(price.list_price)
     or (expected is not null and price.list_price <> expected) then
    raise exception 'REGISTRATION_PRICE_UNAVAILABLE';
  end if;
  discount_amount := public.calculate_tuition_discount_amount(
    price.list_price, discount_type, coalesce(p_discount_value, 0));
  if discount_amount <> trunc(discount_amount) then
    raise exception 'REGISTRATION_DISCOUNT_NOT_WHOLE_VND';
  end if;
  list_amount := price.list_price::bigint;
  agreed := list_amount - discount_amount::bigint;
  if agreed <= 0 or agreed > 100000000 then
    raise exception 'REGISTRATION_PRICE_UNAVAILABLE';
  end if;
  due := case when payment_option = 'FULL' then agreed else (agreed + 1) / 2 end;
  insert into public.registration_deposit_terms(
    application_id, branch_id, tuition_plan_id, price_id, tuition_amount, quoted_by,
    list_amount, discount_type, discount_value, discount_name, discount_amount,
    payment_option, amount_due)
  values (
    app.id, app.branch_id, p_plan, price.id, agreed, auth.uid(),
    list_amount, discount_type, coalesce(p_discount_value, 0),
    nullif(btrim(p_discount_name), ''), discount_amount::bigint,
    payment_option, due)
  on conflict (application_id) do update set
    branch_id = excluded.branch_id,
    tuition_plan_id = excluded.tuition_plan_id,
    price_id = excluded.price_id,
    tuition_amount = excluded.tuition_amount,
    quoted_by = excluded.quoted_by,
    quoted_at = clock_timestamp(),
    list_amount = excluded.list_amount,
    discount_type = excluded.discount_type,
    discount_value = excluded.discount_value,
    discount_name = excluded.discount_name,
    discount_amount = excluded.discount_amount,
    payment_option = excluded.payment_option,
    amount_due = excluded.amount_due;
  return app.id;
end $$;

create function public.set_registration_branch(
  p_application uuid, p_version integer, p_branch uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  if not public.registration_can('registration.update', p_branch) then raise exception 'REGISTRATION_UNAUTHORIZED'; end if;
  if app.status not in ('DRAFT', 'SUBMITTED', 'VERIFIED') or p_branch is null
     or exists (select 1 from public.registration_deposit_terms where application_id = app.id)
     or not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'REGISTRATION_BRANCH_LOCKED';
  end if;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications
  set branch_id = p_branch, version = version + 1, updated_at = clock_timestamp()
  where id = app.id;
  insert into public.registration_application_events(id, application_id, event_type, from_status, to_status, actor_id)
  values (gen_random_uuid(), app.id, 'BRANCH_SET', app.status, app.status, auth.uid());
  perform set_config('registration.write', 'off', true);
  return app.id;
end $$;

create function public.correct_registration_commercial_terms(
  p_application uuid,
  p_version integer,
  p_branch uuid,
  p_plan uuid,
  p_discount_type text,
  p_discount_value numeric,
  p_discount_name text,
  p_payment_option text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  if not exists (select 1 from public.registration_deposit_terms where application_id = app.id)
     or exists (select 1 from public.registration_momo_orders where application_id = app.id) then
    raise exception 'REGISTRATION_CORRECTION_DENIED';
  end if;
  if not public.registration_can('registration.update', p_branch) then raise exception 'REGISTRATION_UNAUTHORIZED'; end if;
  perform set_config('registration.quote_correction', 'on', true);
  perform set_config('registration.write', 'on', true);
  update public.registration_applications
  set branch_id = p_branch, version = version + 1, updated_at = clock_timestamp()
  where id = app.id and branch_id is distinct from p_branch;
  insert into public.registration_application_events(
    id, application_id, event_type, from_status, to_status, actor_id, metadata)
  values (
    gen_random_uuid(), app.id, 'QUOTE_CORRECTED', app.status, app.status, auth.uid(),
    jsonb_build_object('branch_id', p_branch, 'plan_id', p_plan, 'payment_option', p_payment_option));
  perform set_config('registration.write', 'off', true);
  return public.set_registration_deposit_quote(
    app.id,
    (select version from public.registration_applications where id = app.id),
    p_plan, p_discount_type, p_discount_value, p_discount_name, p_payment_option);
end $$;

create or replace function public.record_verified_momo_ipn(
  p_order_id text, p_partner_code text, p_transaction_id text,
  p_amount bigint, p_result_code integer
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare ord public.registration_momo_orders%rowtype;
  app public.registration_applications%rowtype;
  terms public.registration_deposit_terms%rowtype;
  paid_total bigint;
begin
  if not coalesce(public.momo_service_request(), false) then
    raise exception 'MOMO_SERVER_ONLY';
  end if;
  select * into ord from public.registration_momo_orders where order_id = p_order_id;
  if not found then raise exception 'MOMO_ORDER_MISMATCH'; end if;
  select * into app from public.registration_applications where id = ord.application_id for update;
  select * into ord from public.registration_momo_orders where order_id = p_order_id for update;
  if not found or ord.state not in ('READY', 'PAID') or ord.partner_code is distinct from p_partner_code
     or p_transaction_id is null or p_transaction_id = '' or p_amount is distinct from ord.amount then
    raise exception 'MOMO_ORDER_MISMATCH';
  end if;
  if p_result_code <> 0 then return 'IGNORED_NON_SUCCESS'; end if;
  if ord.state = 'PAID' then
    if ord.provider_transaction_id <> p_transaction_id then raise exception 'MOMO_TRANSACTION_CONFLICT'; end if;
    return 'ALREADY_PAID';
  end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  if not found or app.status not in ('VERIFIED', 'PAYMENT_PENDING') then
    raise exception 'REGISTRATION_DEPOSIT_MISMATCH';
  end if;
  insert into public.registration_momo_ipn_events(order_id, provider_transaction_id, result_code, amount)
    values(ord.order_id, p_transaction_id, p_result_code, p_amount);
  update public.registration_momo_orders set state = 'PAID', provider_transaction_id = p_transaction_id,
    paid_at = clock_timestamp() where id = ord.id;
  select coalesce(sum(amount), 0)::bigint into paid_total from public.registration_momo_orders
    where application_id = app.id and state = 'PAID';
  if paid_total < terms.amount_due then return 'PARTIAL_DEPOSIT'; end if;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set status = 'PAID',
    deposit_confirmed_at = clock_timestamp(), version = version + 1,
    updated_at = clock_timestamp() where id = app.id;
  perform set_config('registration.write', 'off', true);
  return public.complete_momo_deposit_registration(app.id);
end $$;

create or replace function public.require_paid_registration_completion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    if not (new.invoice_id is not null and public.registration_invoice_settled(new.invoice_id))
       and not exists (
         select 1 from public.registration_deposit_terms terms
         where terms.application_id = new.id and new.deposit_confirmed_at is not null
           and (select coalesce(sum(ord.amount), 0) from public.registration_momo_orders ord
                where ord.application_id = new.id and ord.state = 'PAID') >= terms.amount_due
       ) then
      raise exception 'REGISTRATION_PAYMENT_REQUIRED';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.registration_authoritative_list_price(uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_registration_deposit_quote(uuid, integer, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.set_registration_deposit_quote(uuid, integer, uuid, text, numeric, text, text) to authenticated;
revoke all on function public.set_registration_branch(uuid, integer, uuid) from public, anon;
grant execute on function public.set_registration_branch(uuid, integer, uuid) to authenticated;
revoke all on function public.correct_registration_commercial_terms(uuid, integer, uuid, uuid, text, numeric, text, text) from public, anon;
grant execute on function public.correct_registration_commercial_terms(uuid, integer, uuid, uuid, text, numeric, text, text) to authenticated;

-- Reviewed source: 20260925040000_registration_payos_payments.sql
-- payOS checkout for counter registration. Additive. Existing quotes and MoMo orders stay.
-- A verified webhook is the only path that posts a receipt or completes registration.

create sequence public.registration_payos_order_code_seq as bigint
  start with 260925100 increment by 1 minvalue 1 maxvalue 9007199254740991;

create table public.registration_payos_orders (
  id uuid primary key,
  application_id uuid not null references public.registration_applications(id),
  provider text not null default 'PAYOS' check (provider = 'PAYOS'),
  order_code bigint not null unique,
  amount bigint not null check (amount > 0),
  attributed_amount bigint check (attributed_amount is null or (attributed_amount > 0 and attributed_amount <= amount)),
  currency text not null default 'VND' check (currency = 'VND'),
  description text not null check (char_length(description) between 1 and 25),
  state text not null default 'RESERVED' check (state in (
    'RESERVED', 'PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'EXCEPTION'
  )),
  payment_link_id text unique,
  checkout_url text,
  qr_code text,
  provider_reference text unique,
  finance_payment_id uuid unique references public.payments(id),
  created_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  check (state <> 'PAID' or (provider_reference is not null and paid_at is not null)),
  check (state <> 'PENDING' or (payment_link_id is not null and checkout_url is not null))
);

create unique index registration_one_open_payos_order
  on public.registration_payos_orders(application_id)
  where state in ('RESERVED', 'PENDING');

create table public.registration_payos_webhook_events (
  id bigint generated always as identity primary key,
  order_code bigint not null references public.registration_payos_orders(order_code),
  provider_reference text not null,
  amount bigint not null,
  outcome text not null,
  received_at timestamptz not null default clock_timestamp(),
  unique (order_code, provider_reference)
);

alter table public.registration_payos_orders enable row level security;
alter table public.registration_payos_webhook_events enable row level security;
revoke all on public.registration_payos_orders, public.registration_payos_webhook_events
  from public, anon, authenticated;
grant select on public.registration_payos_orders to authenticated, service_role;
grant select on public.registration_payos_webhook_events to service_role;

create policy registration_payos_orders_read on public.registration_payos_orders
for select to authenticated using (exists (
  select 1 from public.registration_applications app
  where app.id = application_id and public.registration_can('registration.view', app.branch_id)
));

create function public.guard_registration_quote_after_payos()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from public.registration_payos_orders
    where application_id = new.application_id
  ) then
    raise exception 'REGISTRATION_QUOTE_DENIED';
  end if;
  return new;
end $$;

create trigger registration_quote_after_payos
before insert or update on public.registration_deposit_terms
for each row execute function public.guard_registration_quote_after_payos();

create or replace function public.correct_registration_commercial_terms(
  p_application uuid, p_version integer, p_branch uuid, p_plan uuid,
  p_discount_type text, p_discount_value numeric, p_discount_name text, p_payment_option text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  if not exists (select 1 from public.registration_deposit_terms where application_id = app.id)
     or exists (select 1 from public.registration_momo_orders where application_id = app.id)
     or exists (select 1 from public.registration_payos_orders where application_id = app.id) then
    raise exception 'REGISTRATION_CORRECTION_DENIED';
  end if;
  if not public.registration_can('registration.update', p_branch) then raise exception 'REGISTRATION_UNAUTHORIZED'; end if;
  perform set_config('registration.quote_correction', 'on', true);
  perform set_config('registration.write', 'on', true);
  update public.registration_applications
  set branch_id = p_branch, version = version + 1, updated_at = clock_timestamp()
  where id = app.id and branch_id is distinct from p_branch;
  insert into public.registration_application_events(
    id, application_id, event_type, from_status, to_status, actor_id, metadata)
  values (gen_random_uuid(), app.id, 'QUOTE_CORRECTED', app.status, app.status, auth.uid(),
    jsonb_build_object('branch_id', p_branch, 'plan_id', p_plan, 'payment_option', p_payment_option));
  perform set_config('registration.write', 'off', true);
  return public.set_registration_deposit_quote(
    app.id, (select version from public.registration_applications where id = app.id),
    p_plan, p_discount_type, p_discount_value, p_discount_name, p_payment_option);
end $$;

create function public.registration_payos_paid_total(p_application uuid)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(attributed_amount), 0)::bigint from public.registration_payos_orders
  where application_id = p_application and state = 'PAID'
$$;

create function public.reserve_registration_payos_order(p_application uuid, p_request uuid, p_version integer)
returns public.registration_payos_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.registration_applications%rowtype;
  terms public.registration_deposit_terms%rowtype;
  existing public.registration_payos_orders%rowtype;
  result public.registration_payos_orders%rowtype;
  paid_total bigint;
  due_now bigint;
  code bigint;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  if p_request is null then raise exception 'PAYOS_REQUEST_INVALID'; end if;
  select * into existing from public.registration_payos_orders where id = p_request;
  if found then
    if existing.application_id <> app.id then raise exception 'PAYOS_REQUEST_CONFLICT'; end if;
    return existing;
  end if;
  if app.status not in ('VERIFIED', 'PAYMENT_PENDING') then raise exception 'PAYOS_ORDER_DENIED'; end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  if not found then raise exception 'REGISTRATION_QUOTE_REQUIRED'; end if;
  select * into existing from public.registration_payos_orders
    where application_id = app.id and state in ('RESERVED', 'PENDING') limit 1;
  if found then return existing; end if;
  paid_total := public.registration_payos_paid_total(app.id)
    + coalesce((select sum(amount) from public.registration_momo_orders
                where application_id = app.id and state = 'PAID'), 0);
  due_now := terms.amount_due - paid_total;
  if due_now <= 0 then raise exception 'PAYOS_THRESHOLD_SATISFIED'; end if;
  if due_now > 50000000 then raise exception 'PAYOS_AMOUNT_INVALID'; end if;
  code := nextval('public.registration_payos_order_code_seq');
  insert into public.registration_payos_orders(
    id, application_id, order_code, amount, description)
  values (p_request, app.id, code, due_now, left('V' || code::text, 9))
  returning * into result;
  return result;
end $$;

create function public.activate_registration_payos_order(
  p_order_code bigint, p_amount bigint, p_payment_link_id text, p_checkout_url text, p_qr_code text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare ord public.registration_payos_orders%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'PAYOS_SERVER_ONLY'; end if;
  select * into ord from public.registration_payos_orders where order_code = p_order_code for update;
  if not found or ord.amount is distinct from p_amount or nullif(p_payment_link_id, '') is null
     or p_checkout_url is null or p_checkout_url !~ '^https://pay[.]payos[.]vn/' then
    raise exception 'PAYOS_CHECKOUT_MISMATCH';
  end if;
  if ord.state = 'PENDING' and ord.payment_link_id = p_payment_link_id and ord.checkout_url = p_checkout_url then
    return ord.id;
  end if;
  if ord.state <> 'RESERVED' then raise exception 'PAYOS_ORDER_STATE_CONFLICT'; end if;
  update public.registration_payos_orders
  set payment_link_id = p_payment_link_id, checkout_url = p_checkout_url,
      qr_code = nullif(p_qr_code, ''), state = 'PENDING', activated_at = clock_timestamp()
  where id = ord.id;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set status = 'PAYMENT_PENDING', version = version + 1,
    updated_at = clock_timestamp() where id = ord.application_id and status = 'VERIFIED';
  perform set_config('registration.write', 'off', true);
  return ord.id;
end $$;

create function public.cancel_registration_payos_order(p_application uuid, p_order_code bigint)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
  ord public.registration_payos_orders%rowtype;
begin
  select * into app from public.registration_applications where id = p_application;
  if not public.registration_can('registration.update', app.branch_id) then
    raise exception 'PAYOS_ORDER_DENIED';
  end if;
  select * into ord from public.registration_payos_orders
    where application_id = p_application and order_code = p_order_code for update;
  if not found then raise exception 'PAYOS_ORDER_UNKNOWN'; end if;
  if ord.state = 'CANCELLED' then return 'ALREADY_CANCELLED'; end if;
  if ord.state <> 'PENDING' and ord.state <> 'RESERVED' then raise exception 'PAYOS_ORDER_STATE_CONFLICT'; end if;
  update public.registration_payos_orders
  set state = 'CANCELLED', cancelled_at = clock_timestamp() where id = ord.id;
  return 'CANCELLED';
end $$;

create function public.complete_payos_registration(p_application uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare app public.registration_applications%rowtype;
  student_id uuid; parent_id uuid; placement_id uuid; finance_id uuid;
  ord public.registration_payos_orders%rowtype; branch public.branches%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'PAYOS_SERVER_ONLY'; end if;
  select * into app from public.registration_applications where id = p_application for update;
  if app.status = 'COMPLETED' then return 'ALREADY_COMPLETED'; end if;
  if app.status <> 'PAID' or app.deposit_confirmed_at is null then
    raise exception 'REGISTRATION_PAYMENT_REQUIRED';
  end if;
  if nullif(btrim(coalesce(app.student_name, '')), '') is null or app.student_date_of_birth is null
     or nullif(btrim(coalesce(app.parent_name, '')), '') is null then
    return 'REVIEW_INCOMPLETE_IDENTITY';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    lower(btrim(app.student_name)) || ':' || app.student_date_of_birth::text, 0));
  if exists(select 1 from public.students s where s.date_of_birth = app.student_date_of_birth
     and lower(btrim(coalesce(s.full_name, ''))) = lower(btrim(app.student_name))) then
    return 'REVIEW_POSSIBLE_DUPLICATE';
  end if;
  student_id := gen_random_uuid();
  parent_id := gen_random_uuid();
  placement_id := gen_random_uuid();
  perform set_config('registration.write', 'on', true);
  insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status)
  values(student_id, null, btrim(app.student_name), app.student_date_of_birth,
    app.branch_id, public.registration_vietnam_today(), 'ACTIVE');
  insert into public.parents(id, parent_code, status)
  values(parent_id, 'PH-' || substr(replace(parent_id::text, '-', ''), 1, 8), 'ACTIVE');
  insert into public.student_parents(student_id, parent_id, relationship, is_primary)
  values(student_id, parent_id, 'GUARDIAN', true);
  insert into public.student_placement_cases(id, student_id, registration_application_id,
    branch_id, status, desired_start_date, preferred_schedule)
  values(placement_id, student_id, app.id, app.branch_id, 'UNASSIGNED',
    app.desired_start_date, app.preferred_schedule);
  select * into branch from public.branches where id = app.branch_id;
  for ord in select * from public.registration_payos_orders
    where application_id = app.id and state = 'PAID' and finance_payment_id is null
    order by paid_at for update loop
    finance_id := gen_random_uuid();
    insert into public.payments(id, payment_number, student_id_snapshot, branch_id_snapshot,
      branch_code_snapshot, branch_name_snapshot, amount, currency, payment_method,
      paid_at, reference, notes, status)
    values(finance_id, 'PAY-' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY') || '-'
      || lpad(nextval('public.payment_number_seq')::text, 6, '0'), student_id,
      branch.id, branch.code, branch.name, ord.attributed_amount, 'VND', 'OTHER', ord.paid_at,
      'PAYOS:' || ord.provider_reference, 'Hoc phi ho so ' || app.application_code, 'POSTED');
    update public.registration_payos_orders set finance_payment_id = finance_id where id = ord.id;
  end loop;
  update public.registration_applications set linked_student_id = student_id,
    linked_parent_id = parent_id, status = 'COMPLETED', completed_at = clock_timestamp(),
    version = version + 1, updated_at = clock_timestamp() where id = app.id;
  insert into public.registration_application_events(id, application_id, event_type,
    from_status, to_status, actor_id, metadata)
  values(gen_random_uuid(), app.id, 'REGISTRATION_COMPLETED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'PAYOS', 'student_id', student_id, 'parent_id', parent_id)),
    (gen_random_uuid(), app.id, 'PLACEMENT_OPENED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'PAYOS', 'placement_id', placement_id));
  insert into public.student_placement_events(id, placement_id, event_type, actor_id)
  values(gen_random_uuid(), placement_id, 'PLACEMENT_OPENED', null);
  perform set_config('registration.write', 'off', true);
  return 'COMPLETED';
end $$;

create function public.record_verified_payos_webhook(
  p_order_code bigint, p_payment_link_id text, p_reference text, p_amount bigint, p_currency text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ord public.registration_payos_orders%rowtype;
  app public.registration_applications%rowtype;
  terms public.registration_deposit_terms%rowtype;
  paid_total bigint;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'PAYOS_SERVER_ONLY'; end if;
  if p_currency is distinct from 'VND' then raise exception 'PAYOS_CURRENCY_MISMATCH'; end if;
  if p_reference is null or btrim(p_reference) = '' then raise exception 'PAYOS_REFERENCE_REQUIRED'; end if;
  select * into ord from public.registration_payos_orders where order_code = p_order_code;
  if not found then raise exception 'PAYOS_ORDER_UNKNOWN'; end if;
  select * into app from public.registration_applications where id = ord.application_id for update;
  select * into ord from public.registration_payos_orders where order_code = p_order_code for update;
  if ord.payment_link_id is not null and ord.payment_link_id is distinct from p_payment_link_id then
    raise exception 'PAYOS_LINK_MISMATCH';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > ord.amount then raise exception 'PAYOS_AMOUNT_MISMATCH'; end if;
  if ord.state in ('CANCELLED', 'EXPIRED') then
    insert into public.registration_payos_webhook_events(order_code, provider_reference, amount, outcome)
    values (ord.order_code, p_reference, p_amount, 'LATE_PAYMENT_REVIEW')
    on conflict (order_code, provider_reference) do nothing;
    update public.registration_payos_orders
    set state = 'EXCEPTION', provider_reference = coalesce(ord.provider_reference, p_reference)
    where id = ord.id and state in ('CANCELLED', 'EXPIRED');
    return 'LATE_PAYMENT_REVIEW';
  end if;
  if ord.state = 'EXCEPTION' then return 'LATE_PAYMENT_REVIEW'; end if;
  if ord.state = 'PAID' then
    if ord.provider_reference <> p_reference then raise exception 'PAYOS_REFERENCE_CONFLICT'; end if;
    return 'ALREADY_PAID';
  end if;
  if ord.state <> 'PENDING' then raise exception 'PAYOS_ORDER_STATE_CONFLICT'; end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  if not found or app.status not in ('VERIFIED', 'PAYMENT_PENDING') then
    raise exception 'REGISTRATION_DEPOSIT_MISMATCH';
  end if;
  insert into public.registration_payos_webhook_events(order_code, provider_reference, amount, outcome)
  values (ord.order_code, p_reference, p_amount, 'VERIFIED');
  update public.registration_payos_orders set state = 'PAID', provider_reference = p_reference,
    attributed_amount = p_amount, paid_at = clock_timestamp() where id = ord.id;
  paid_total := public.registration_payos_paid_total(app.id)
    + coalesce((select sum(amount) from public.registration_momo_orders
                where application_id = app.id and state = 'PAID'), 0);
  if paid_total < terms.amount_due then return 'PARTIAL_DEPOSIT'; end if;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set status = 'PAID',
    deposit_confirmed_at = clock_timestamp(), version = version + 1,
    updated_at = clock_timestamp() where id = app.id;
  perform set_config('registration.write', 'off', true);
  return public.complete_payos_registration(app.id);
end $$;

create or replace function public.require_paid_registration_completion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
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

revoke all on function public.reserve_registration_payos_order(uuid, uuid, integer) from public, anon;
grant execute on function public.reserve_registration_payos_order(uuid, uuid, integer) to authenticated;
revoke all on function public.cancel_registration_payos_order(uuid, bigint) from public, anon;
grant execute on function public.cancel_registration_payos_order(uuid, bigint) to authenticated;
revoke all on function public.activate_registration_payos_order(bigint, bigint, text, text, text),
  public.complete_payos_registration(uuid),
  public.record_verified_payos_webhook(bigint, text, text, bigint, text),
  public.registration_payos_paid_total(uuid),
  public.guard_registration_quote_after_payos()
  from public, anon, authenticated;
grant execute on function public.activate_registration_payos_order(bigint, bigint, text, text, text),
  public.complete_payos_registration(uuid),
  public.record_verified_payos_webhook(bigint, text, text, bigint, text)
  to service_role;

-- Reviewed source: 20260925220000_registration_stale_checkout_v1.sql
-- A repeated checkout must return the order already created after the version
-- moved. A real version conflict still refuses a new order or a new quote.

create or replace function public.reserve_registration_payos_order(p_application uuid, p_request uuid, p_version integer)
returns public.registration_payos_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.registration_applications%rowtype;
  terms public.registration_deposit_terms%rowtype;
  existing public.registration_payos_orders%rowtype;
  result public.registration_payos_orders%rowtype;
  paid_total bigint;
  due_now bigint;
  code bigint;
begin
  if p_request is null then raise exception 'PAYOS_REQUEST_INVALID'; end if;
  select * into app from public.registration_applications where id = p_application for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if not public.registration_can('registration.update', app.branch_id) then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  select * into existing from public.registration_payos_orders where id = p_request;
  if found then
    if existing.application_id <> app.id then raise exception 'PAYOS_REQUEST_CONFLICT'; end if;
    return existing;
  end if;
  select * into existing from public.registration_payos_orders
    where application_id = app.id and state in ('RESERVED', 'PENDING')
    order by created_at desc limit 1;
  if found then return existing; end if;
  if app.status in ('PAID', 'COMPLETED') then
    select * into existing from public.registration_payos_orders
      where application_id = app.id and state = 'PAID'
      order by paid_at desc nulls last limit 1;
    if found then return existing; end if;
    raise exception 'PAYOS_ORDER_DENIED';
  end if;
  if app.version is distinct from p_version then raise exception 'REGISTRATION_STALE'; end if;
  if app.status not in ('VERIFIED', 'PAYMENT_PENDING') then raise exception 'PAYOS_ORDER_DENIED'; end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  if not found then raise exception 'REGISTRATION_QUOTE_REQUIRED'; end if;
  paid_total := public.registration_payos_paid_total(app.id)
    + coalesce((select sum(amount) from public.registration_momo_orders
                where application_id = app.id and state = 'PAID'), 0);
  due_now := terms.amount_due - paid_total;
  if due_now <= 0 then raise exception 'PAYOS_THRESHOLD_SATISFIED'; end if;
  if due_now > 50000000 then raise exception 'PAYOS_AMOUNT_INVALID'; end if;
  code := nextval('public.registration_payos_order_code_seq');
  insert into public.registration_payos_orders(
    id, application_id, order_code, amount, description)
  values (p_request, app.id, code, due_now, left('V' || code::text, 9))
  returning * into result;
  return result;
end $$;

-- Reviewed source: 20260926143000_payos_receipt_allocation_v1.sql
-- Include verified payOS receipts in the existing deposit allocation.
-- Does not create invoices, students, or a second tuition charge.

create or replace function public.allocate_registration_deposits_to_invoice(
  p_application uuid,
  p_invoice uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app public.registration_applications%rowtype;
  invoice public.invoices%rowtype;
  receipt record;
  outstanding numeric;
  allocated integer := 0;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  if p_application is null or p_invoice is null then
    raise exception 'REGISTRATION_INVALID';
  end if;
  select * into app from public.registration_applications where id = p_application for update;
  if not found or app.status <> 'COMPLETED' or app.linked_student_id is null then
    raise exception 'REGISTRATION_ALLOCATION_DENIED';
  end if;
  select * into invoice from public.invoices where id = p_invoice for update;
  if not found or invoice.status <> 'ISSUED'
     or invoice.student_id_snapshot <> app.linked_student_id
     or invoice.branch_id_snapshot <> app.branch_id then
    raise exception 'REGISTRATION_INVOICE_MISMATCH';
  end if;
  for receipt in
    select payment.id, payment.amount
    from public.payments payment
    where payment.status = 'POSTED'
      and payment.id in (
        select momo.finance_payment_id
        from public.registration_momo_orders momo
        where momo.application_id = app.id
          and momo.state = 'PAID'
          and momo.finance_payment_id is not null
        union
        select payos.finance_payment_id
        from public.registration_payos_orders payos
        where payos.application_id = app.id
          and payos.state = 'PAID'
          and payos.finance_payment_id is not null
      )
    order by payment.paid_at, payment.id
    for update of payment
  loop
    if exists (
      select 1 from public.payment_allocations allocation
      where allocation.payment_id = receipt.id and allocation.invoice_id = invoice.id
    ) then
      continue;
    end if;
    select outstanding_balance into outstanding
    from public.invoice_receivables where invoice_id = invoice.id;
    if coalesce(outstanding, 0) <= 0 then
      exit;
    end if;
    perform public.allocate_payment_to_invoice(
      receipt.id, invoice.id, least(receipt.amount, outstanding));
    allocated := allocated + 1;
  end loop;
  if app.invoice_id is null then
    perform set_config('registration.write', 'on', true);
    update public.registration_applications
    set invoice_id = invoice.id, updated_at = clock_timestamp()
    where id = app.id and invoice_id is null;
    perform set_config('registration.write', 'off', true);
  end if;
  return allocated;
end $$;

revoke all on function public.allocate_registration_deposits_to_invoice(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.allocate_registration_deposits_to_invoice(uuid, uuid)
  to authenticated;
