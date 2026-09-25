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

-- Waiting list displays the selected level before a class is assigned.
create or replace function public.list_waiting_placements(
  p_branch uuid,
  p_filter text,
  p_search text,
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  placement_id uuid, placement_version integer, student_id uuid, student_name text, parent_name text,
  branch_id uuid, branch_name text, program_name text, level_name text, desired_start date,
  preferred_schedule text, placement_status text, class_name text, teacher_name text,
  scheduled_start date, owner_name text, completed_on date, days_waiting integer, opened_on date,
  enrollment_id uuid, class_id uuid
)
language sql stable security definer set search_path = public, pg_temp as $$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(course.name, app.program_interest),
    (select level.name from public.curriculum_levels level where level.id = coalesce(course.level_id, placement.level_id)),
    placement.desired_start_date, placement.preferred_schedule,
    case
      when placement.status = 'SCHEDULED' then 'SCHEDULED_FUTURE'
      else placement.status
    end,
    class_row.name,
    (select teacher.full_name from public.teachers teacher where teacher.id = placement.assigned_teacher_id),
    placement.scheduled_start_date,
    (select profile.full_name from public.profiles profile where profile.id = placement.owner_user_id),
    coalesce(app.deposit_confirmed_at, app.payment_confirmed_at, app.completed_at)::date,
    public.registration_vietnam_today() - placement.opened_at::date,
    placement.opened_at::date,
    placement.enrollment_id,
    placement.assigned_class_id
  from public.student_placement_cases placement
  join public.students student on student.id = placement.student_id
  join public.registration_applications app on app.id = placement.registration_application_id
  join public.branches branch on branch.id = placement.branch_id
  left join public.classes class_row on class_row.id = placement.assigned_class_id
  left join public.courses course on course.id = class_row.course_id
  where public.registration_can('student_placement.view', placement.branch_id)
    and (p_branch is null or placement.branch_id = p_branch)
    and (
      placement.status in ('UNASSIGNED', 'MATCHING')
      or (placement.status = 'SCHEDULED' and placement.scheduled_start_date > public.registration_vietnam_today())
    )
    and (
      coalesce(p_filter, 'ALL') = 'ALL'
      or (p_filter = 'UNASSIGNED' and placement.status = 'UNASSIGNED')
      or (p_filter = 'MATCHING' and placement.status = 'MATCHING')
      or (p_filter = 'SCHEDULED_FUTURE' and placement.status = 'SCHEDULED' and placement.scheduled_start_date > public.registration_vietnam_today())
    )
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or student.full_name ilike '%' || replace(btrim(p_search), '%', '') || '%'
      or student.student_code ilike '%' || replace(btrim(p_search), '%', '') || '%'
    )
  order by placement.opened_at, student.full_name
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
$$;
