-- Sprint 6 customer care beside instrument SALE events. Serial, price, and warranty stay on the sale.

insert into public.permissions(code, name, module)
values
  ('instrument_customer.view', 'View instrument customers in an authorized branch', 'crm'),
  ('instrument_customer.manage', 'Link instrument customers and record care in an authorized branch', 'crm')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('instrument_customer.view', 'instrument_customer.manage')
where r.code = 'BRANCH_ADMIN'
on conflict do nothing;

create table public.instrument_sale_customer_links (
  id uuid primary key,
  sale_event_id uuid not null unique references public.instrument_events(movement_id),
  student_id uuid references public.students(id),
  parent_id uuid references public.parents(id),
  contact_name text check (contact_name is null or char_length(contact_name) between 1 and 200),
  contact_phone text check (contact_phone is null or char_length(contact_phone) between 1 and 40),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  check (student_id is not null or parent_id is not null or contact_name is not null)
);

create table public.instrument_warranty_cases (
  id uuid primary key default gen_random_uuid(),
  sale_event_id uuid not null references public.instrument_events(movement_id),
  issue text not null check (char_length(issue) between 1 and 2000),
  diagnosis text,
  resolution text,
  status text not null default 'OPEN' check (status in (
    'OPEN', 'INSPECTING', 'WAITING_PART', 'IN_REPAIR', 'COMPLETED', 'REJECTED', 'CANCELLED'
  )),
  handled_by uuid references auth.users(id),
  opened_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index instrument_warranty_one_open_idx
  on public.instrument_warranty_cases(sale_event_id)
  where status not in ('COMPLETED', 'REJECTED', 'CANCELLED');

create table public.instrument_warranty_events (
  id uuid primary key,
  case_id uuid not null references public.instrument_warranty_cases(id),
  event_type text not null,
  from_status text,
  to_status text,
  actor_id uuid references auth.users(id),
  note text,
  created_at timestamptz not null default clock_timestamp()
);

create table public.instrument_customer_followups (
  id uuid primary key,
  sale_event_id uuid not null references public.instrument_events(movement_id),
  contacted_at timestamptz not null default clock_timestamp(),
  channel text check (channel is null or char_length(channel) between 1 and 40),
  owner_user_id uuid references auth.users(id),
  outcome text not null check (outcome in (
    'KEEP_IN_TOUCH', 'INTERESTED_IN_ACCESSORY', 'UPGRADE_OPPORTUNITY', 'SERVICE_REQUIRED',
    'REPURCHASE_INTEREST', 'REPURCHASED', 'NOT_INTERESTED'
  )),
  note text,
  next_follow_up_on date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp()
);

create index instrument_followups_sale_idx on public.instrument_customer_followups(sale_event_id, created_at desc);

create function public.guard_instrument_customer_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('instrument.customer_write', true), '') <> 'on' then
    raise exception 'INSTRUMENT_CUSTOMER_DIRECT_WRITE_DENIED';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger instrument_sale_customer_links_write_guard
before insert or update or delete on public.instrument_sale_customer_links
for each row execute function public.guard_instrument_customer_write();

create trigger instrument_warranty_cases_write_guard
before insert or update or delete on public.instrument_warranty_cases
for each row execute function public.guard_instrument_customer_write();

create trigger instrument_followups_write_guard
before insert or update or delete on public.instrument_customer_followups
for each row execute function public.guard_instrument_customer_write();

create function public.guard_instrument_warranty_event() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then raise exception 'INSTRUMENT_WARRANTY_EVENT_IMMUTABLE'; end if;
  return new;
end $$;

create trigger instrument_warranty_events_write_guard
before insert or update or delete on public.instrument_warranty_events
for each row execute function public.guard_instrument_customer_write();

create trigger instrument_warranty_events_immutable
before update or delete on public.instrument_warranty_events
for each row execute function public.guard_instrument_warranty_event();

create function public.guard_instrument_followup_history() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then raise exception 'INSTRUMENT_FOLLOWUP_IMMUTABLE'; end if;
  return new;
end $$;

create trigger instrument_followups_immutable
before update or delete on public.instrument_customer_followups
for each row execute function public.guard_instrument_followup_history();

alter table public.instrument_sale_customer_links enable row level security;
alter table public.instrument_warranty_cases enable row level security;
alter table public.instrument_warranty_events enable row level security;
alter table public.instrument_customer_followups enable row level security;

create function public.instrument_sale_branch(p_sale uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select branch_id from public.instrument_events where movement_id = p_sale and kind = 'SALE'
$$;

create policy instrument_sale_links_select on public.instrument_sale_customer_links
for select to authenticated
using (public.crm_can('instrument_customer.view', public.instrument_sale_branch(sale_event_id)));

create policy instrument_warranty_cases_select on public.instrument_warranty_cases
for select to authenticated
using (public.crm_can('instrument_customer.view', public.instrument_sale_branch(sale_event_id)));

create policy instrument_warranty_events_select on public.instrument_warranty_events
for select to authenticated
using (
  exists (
    select 1 from public.instrument_warranty_cases item
    where item.id = case_id
      and public.crm_can('instrument_customer.view', public.instrument_sale_branch(item.sale_event_id))
  )
);

create policy instrument_followups_select on public.instrument_customer_followups
for select to authenticated
using (public.crm_can('instrument_customer.view', public.instrument_sale_branch(sale_event_id)));

revoke all on public.instrument_sale_customer_links, public.instrument_warranty_cases, public.instrument_warranty_events, public.instrument_customer_followups
from public, anon, authenticated, service_role;
grant select on public.instrument_sale_customer_links, public.instrument_warranty_cases, public.instrument_warranty_events, public.instrument_customer_followups
to authenticated;

create function public.link_instrument_sale_customer(
  p_request uuid, p_sale uuid, p_student uuid, p_parent uuid, p_contact_name text, p_contact_phone text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sale public.instrument_events%rowtype;
  existing public.instrument_sale_customer_links%rowtype;
  actor uuid := auth.uid();
  contact text := public.crm_text(p_contact_name, 200);
begin
  if actor is null or not public.account_is_active() or p_request is null then
    raise exception 'INSTRUMENT_CUSTOMER_UNAUTHORIZED';
  end if;
  select * into sale from public.instrument_events where movement_id = p_sale and kind = 'SALE';
  if not found or not coalesce(public.crm_can('instrument_customer.manage', sale.branch_id), false) then
    raise exception 'INSTRUMENT_CUSTOMER_UNAUTHORIZED';
  end if;
  if p_student is null and p_parent is null and contact is null then
    raise exception 'INSTRUMENT_CUSTOMER_INVALID';
  end if;
  if p_student is not null and not exists (select 1 from public.students where id = p_student) then
    raise exception 'INSTRUMENT_CUSTOMER_INVALID';
  end if;
  if p_parent is not null and not exists (select 1 from public.parents where id = p_parent and status = 'ACTIVE') then
    raise exception 'INSTRUMENT_CUSTOMER_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('instrument-customer:' || p_sale::text, 0));
  select * into existing from public.instrument_sale_customer_links where id = p_request or sale_event_id = p_sale;
  if found then
    if existing.sale_event_id is distinct from p_sale
      or existing.student_id is distinct from p_student
      or existing.parent_id is distinct from p_parent
      or existing.contact_name is distinct from contact
    then
      raise exception 'INSTRUMENT_CUSTOMER_ALREADY_LINKED';
    end if;
    return existing.id;
  end if;
  perform set_config('instrument.customer_write', 'on', true);
  insert into public.instrument_sale_customer_links(id, sale_event_id, student_id, parent_id, contact_name, contact_phone, created_by)
  values (p_request, p_sale, p_student, p_parent, contact, public.crm_text(p_contact_phone, 40), actor);
  perform set_config('instrument.customer_write', 'off', true);
  return p_request;
end $$;

create function public.open_instrument_warranty_case(p_request uuid, p_sale uuid, p_issue text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  sale public.instrument_events%rowtype;
  actor uuid := auth.uid();
  issue text := public.crm_text(p_issue, 2000);
  existing uuid;
begin
  if actor is null or issue is null or p_request is null then raise exception 'INSTRUMENT_CUSTOMER_INVALID'; end if;
  select * into sale from public.instrument_events where movement_id = p_sale and kind = 'SALE';
  if not found or not coalesce(public.crm_can('instrument_customer.manage', sale.branch_id), false) then
    raise exception 'INSTRUMENT_CUSTOMER_UNAUTHORIZED';
  end if;
  select id into existing from public.instrument_warranty_events where id = p_request;
  if found then return (select case_id from public.instrument_warranty_events where id = p_request); end if;
  if exists (
    select 1 from public.instrument_warranty_cases
    where sale_event_id = p_sale and status not in ('COMPLETED', 'REJECTED', 'CANCELLED')
  ) then
    raise exception 'INSTRUMENT_WARRANTY_ALREADY_OPEN';
  end if;
  perform set_config('instrument.customer_write', 'on', true);
  insert into public.instrument_warranty_cases(id, sale_event_id, issue, handled_by)
  values (p_request, p_sale, issue, actor);
  insert into public.instrument_warranty_events(id, case_id, event_type, to_status, actor_id, note)
  values (p_request, p_request, 'OPENED', 'OPEN', actor, issue);
  perform set_config('instrument.customer_write', 'off', true);
  return p_request;
end $$;

create function public.transition_instrument_warranty(
  p_request uuid, p_case uuid, p_version integer, p_status text, p_note text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.instrument_warranty_cases%rowtype;
  sale public.instrument_events%rowtype;
  target text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  actor uuid := auth.uid();
begin
  if p_request is null or target is null or target not in ('INSPECTING', 'WAITING_PART', 'IN_REPAIR', 'COMPLETED', 'REJECTED', 'CANCELLED') then
    raise exception 'INSTRUMENT_CUSTOMER_INVALID';
  end if;
  if exists (select 1 from public.instrument_warranty_events where id = p_request and case_id is distinct from p_case) then
    raise exception 'INSTRUMENT_CUSTOMER_REQUEST_MISMATCH';
  end if;
  if exists (select 1 from public.instrument_warranty_events where id = p_request) then
    return p_case;
  end if;
  select * into row from public.instrument_warranty_cases where id = p_case for update;
  if not found then raise exception 'INSTRUMENT_CUSTOMER_UNAUTHORIZED'; end if;
  select * into sale from public.instrument_events where movement_id = row.sale_event_id;
  if not coalesce(public.crm_can('instrument_customer.manage', sale.branch_id), false) then
    raise exception 'INSTRUMENT_CUSTOMER_UNAUTHORIZED';
  end if;
  if row.version is distinct from p_version then raise exception 'INSTRUMENT_WARRANTY_STALE'; end if;
  if row.status in ('COMPLETED', 'REJECTED', 'CANCELLED') then raise exception 'INSTRUMENT_WARRANTY_TERMINAL'; end if;
  perform set_config('instrument.customer_write', 'on', true);
  update public.instrument_warranty_cases set
    status = target,
    diagnosis = case when target = 'INSPECTING' then coalesce(public.crm_text(p_note, 2000), diagnosis) else diagnosis end,
    resolution = case when target in ('COMPLETED', 'REJECTED', 'CANCELLED') then public.crm_text(p_note, 2000) else resolution end,
    closed_at = case when target in ('COMPLETED', 'REJECTED', 'CANCELLED') then clock_timestamp() else closed_at end,
    handled_by = actor,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.instrument_warranty_events(id, case_id, event_type, from_status, to_status, actor_id, note)
  values (p_request, row.id, 'STATUS_CHANGED', row.status, target, actor, public.crm_text(p_note, 2000));
  perform set_config('instrument.customer_write', 'off', true);
  return row.id;
end $$;

create function public.add_instrument_customer_followup(
  p_request uuid, p_sale uuid, p_channel text, p_outcome text, p_note text, p_next_on date
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  sale public.instrument_events%rowtype;
  next_outcome text := nullif(upper(btrim(coalesce(p_outcome, ''))), '');
  actor uuid := auth.uid();
begin
  if p_request is null or next_outcome is null or next_outcome not in (
    'KEEP_IN_TOUCH', 'INTERESTED_IN_ACCESSORY', 'UPGRADE_OPPORTUNITY', 'SERVICE_REQUIRED',
    'REPURCHASE_INTEREST', 'REPURCHASED', 'NOT_INTERESTED'
  ) then
    raise exception 'INSTRUMENT_CUSTOMER_INVALID';
  end if;
  select * into sale from public.instrument_events where movement_id = p_sale and kind = 'SALE';
  if not found or not coalesce(public.crm_can('instrument_customer.manage', sale.branch_id), false) then
    raise exception 'INSTRUMENT_CUSTOMER_UNAUTHORIZED';
  end if;
  if exists (
    select 1 from public.instrument_customer_followups
    where id = p_request and (sale_event_id is distinct from p_sale or outcome is distinct from next_outcome)
  ) then
    raise exception 'INSTRUMENT_CUSTOMER_REQUEST_MISMATCH';
  end if;
  if exists (select 1 from public.instrument_customer_followups where id = p_request) then
    return p_request;
  end if;
  perform set_config('instrument.customer_write', 'on', true);
  insert into public.instrument_customer_followups(
    id, sale_event_id, channel, owner_user_id, outcome, note, next_follow_up_on, created_by
  ) values (
    p_request, p_sale, public.crm_text(p_channel, 40), actor, next_outcome, public.crm_text(p_note, 2000), p_next_on, actor
  );
  perform set_config('instrument.customer_write', 'off', true);
  return p_request;
end $$;

create function public.list_instrument_customer_care(p_branch uuid, p_filter text)
returns table (
  sale_event_id uuid,
  branch_id uuid,
  customer_name text,
  customer_phone text,
  product_name text,
  brand text,
  model text,
  serial text,
  sold_on date,
  sale_price numeric,
  currency text,
  warranty_until date,
  days_remaining integer,
  case_id uuid,
  case_status text,
  last_contact_at timestamptz,
  next_follow_up_on date,
  outcome text
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if auth.uid() is null or not public.account_is_active() then
    raise exception 'INSTRUMENT_CUSTOMER_UNAUTHORIZED';
  end if;
  return query
  select
    sale.movement_id,
    sale.branch_id,
    coalesce(student.full_name, link.contact_name),
    coalesce(student.phone, link.contact_phone),
    item.name,
    catalogue.brand,
    catalogue.model,
    unit.serial,
    (sale.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
    sale.sale_price,
    sale.currency,
    sale.warranty_until,
    case when sale.warranty_until is null then null else (sale.warranty_until - today) end,
    warranty.id,
    warranty.status,
    followup.contacted_at,
    followup.next_follow_up_on,
    followup.outcome
  from public.instrument_events sale
  join public.instrument_units unit on unit.id = sale.unit_id
  join public.instrument_catalogue catalogue on catalogue.item_id = unit.item_id
  join public.inventory_items item on item.id = unit.item_id
  left join public.instrument_sale_customer_links link on link.sale_event_id = sale.movement_id
  left join public.students student on student.id = link.student_id
  left join lateral (
    select item_case.id, item_case.status
    from public.instrument_warranty_cases item_case
    where item_case.sale_event_id = sale.movement_id
    order by item_case.opened_at desc
    limit 1
  ) warranty on true
  left join lateral (
    select item_followup.contacted_at, item_followup.next_follow_up_on, item_followup.outcome
    from public.instrument_customer_followups item_followup
    where item_followup.sale_event_id = sale.movement_id
    order by item_followup.created_at desc
    limit 1
  ) followup on true
  where sale.kind = 'SALE'
    and public.crm_can('instrument_customer.view', sale.branch_id)
    and (p_branch is null or sale.branch_id = p_branch)
    and (
      p_filter is null
      or (p_filter = 'ACTIVE' and sale.warranty_until >= today)
      or (p_filter = 'EXPIRING' and sale.warranty_until between today and today + 30)
      or (p_filter = 'EXPIRED' and sale.warranty_until < today)
      or (p_filter = 'OPEN_CASE' and warranty.status in ('OPEN', 'INSPECTING', 'WAITING_PART', 'IN_REPAIR'))
      or (p_filter = 'WAITING_PART' and warranty.status = 'WAITING_PART')
      or (p_filter = 'COMPLETED' and warranty.status = 'COMPLETED')
      or (p_filter = 'FOLLOW_UP' and followup.next_follow_up_on is not null and followup.next_follow_up_on <= today)
    );
end $$;

revoke all on function
  public.guard_instrument_customer_write(),
  public.guard_instrument_warranty_event(),
  public.guard_instrument_followup_history(),
  public.instrument_sale_branch(uuid),
  public.link_instrument_sale_customer(uuid, uuid, uuid, uuid, text, text),
  public.open_instrument_warranty_case(uuid, uuid, text),
  public.transition_instrument_warranty(uuid, uuid, integer, text, text),
  public.add_instrument_customer_followup(uuid, uuid, text, text, text, date),
  public.list_instrument_customer_care(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.link_instrument_sale_customer(uuid, uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.open_instrument_warranty_case(uuid, uuid, text) to authenticated;
grant execute on function public.transition_instrument_warranty(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.add_instrument_customer_followup(uuid, uuid, text, text, text, date) to authenticated;
grant execute on function public.list_instrument_customer_care(uuid, text) to authenticated;
grant execute on function public.instrument_sale_branch(uuid) to authenticated;
