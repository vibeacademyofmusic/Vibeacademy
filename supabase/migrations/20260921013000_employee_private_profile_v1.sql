-- VIBE Academy
-- Employee Private Profile V1
--
-- Private HR identity/contact data:
--   email
--   phone
--   address
--   citizen_id (CCCD)
--
-- Design:
--   - Never added to employee_directory.
--   - No direct authenticated table access.
--   - CCCD is never returned in full by read RPCs.
--   - Payslip delivery RPC exposes email + phone only.
--   - New Staff creation stays atomic through one RPC.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception
      'VIBE_EMPLOYEE_PRIVATE_PROFILE_REQUIRES_POSTGRES';
  end if;

  if to_regnamespace('hr_private') is null
     or to_regclass('public.employees') is null
     or to_regclass('public.employee_audit') is null
     or to_regclass('public.teacher_payrolls') is null
     or to_regclass('public.payroll_periods') is null
     or to_regprocedure(
          'public.create_employee(text,date,text,text,text,uuid,uuid,uuid,text)'
        ) is null
     or to_regprocedure(
          'public.account_is_active()'
        ) is null
     or to_regprocedure(
          'public.has_role(text)'
        ) is null
  then
    raise exception
      'VIBE_EMPLOYEE_PRIVATE_PROFILE_PREREQUISITE_MISSING';
  end if;

  if to_regclass(
       'hr_private.employee_private_profiles'
     ) is not null
  then
    raise exception
      'VIBE_EMPLOYEE_PRIVATE_PROFILE_ALREADY_EXISTS';
  end if;
end;
$preflight$;

-- =====================================================
-- PRIVATE DATA
-- =====================================================

create table hr_private.employee_private_profiles (
  employee_id uuid primary key
    references public.employees(id)
    on delete cascade,

  email text not null,

  phone text not null,

  address text not null,

  citizen_id text not null,

  created_at timestamptz
    not null
    default clock_timestamp(),

  created_by uuid
    not null
    references auth.users(id),

  updated_at timestamptz
    not null
    default clock_timestamp(),

  updated_by uuid
    not null
    references auth.users(id),

  constraint employee_private_email_shape
    check (
      email = lower(btrim(email))
      and email ~
        '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and char_length(email) <= 254
    ),

  constraint employee_private_phone_shape
    check (
      phone ~ '^\+84[35789][0-9]{8}$'
    ),

  constraint employee_private_address_shape
    check (
      char_length(btrim(address))
      between 5 and 500
    ),

  constraint employee_private_citizen_id_shape
    check (
      citizen_id ~ '^[0-9]{12}$'
    )
);

create unique index employee_private_email_unique
  on hr_private.employee_private_profiles(email);

create unique index employee_private_phone_unique
  on hr_private.employee_private_profiles(phone);

create unique index employee_private_citizen_id_unique
  on hr_private.employee_private_profiles(citizen_id);

alter table
  hr_private.employee_private_profiles
enable row level security;

revoke all
on hr_private.employee_private_profiles
from public, anon, authenticated, service_role;

-- =====================================================
-- PRIVATE NORMALIZERS
-- =====================================================

create function hr_private.normalize_employee_email(
  p_email text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  value text;
begin
  value := lower(btrim(coalesce(p_email, '')));

  if char_length(value) not between 3 and 254
     or value !~
        '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception
      'EMPLOYEE_PRIVATE_INVALID_EMAIL';
  end if;

  return value;
end;
$fn$;

create function hr_private.normalize_employee_phone(
  p_phone text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  value text;
begin
  value := regexp_replace(
    btrim(coalesce(p_phone, '')),
    '[[:space:]().-]',
    '',
    'g'
  );

  if value ~ '^0[35789][0-9]{8}$' then
    return '+84' || substr(value, 2);
  end if;

  if value ~ '^\+84[35789][0-9]{8}$' then
    return value;
  end if;

  raise exception
    'EMPLOYEE_PRIVATE_INVALID_PHONE';
end;
$fn$;

create function hr_private.normalize_employee_address(
  p_address text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  value text;
begin
  value := btrim(coalesce(p_address, ''));

  if char_length(value) not between 5 and 500 then
    raise exception
      'EMPLOYEE_PRIVATE_INVALID_ADDRESS';
  end if;

  return value;
end;
$fn$;

create function hr_private.normalize_employee_citizen_id(
  p_citizen_id text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  value text;
begin
  value := btrim(coalesce(p_citizen_id, ''));

  if value !~ '^[0-9]{12}$' then
    raise exception
      'EMPLOYEE_PRIVATE_INVALID_CITIZEN_ID';
  end if;

  return value;
end;
$fn$;

-- =====================================================
-- ATOMIC CREATE
-- =====================================================

create function public.create_employee_with_private_profile(
  p_home text,
  p_hire_date date,
  p_full_name text,
  p_group text,
  p_pay_type text,
  p_role uuid,
  p_profile uuid,
  p_teacher uuid,
  p_reason text,
  p_email text,
  p_phone text,
  p_address text,
  p_citizen_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  eid uuid;
  email_value text;
  phone_value text;
  address_value text;
  citizen_value text;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
     or not coalesce(
       public.has_role('SUPER_ADMIN'),
       false
     )
  then
    raise exception
      'EMPLOYEE_PRIVATE_UNAUTHORIZED';
  end if;

  email_value :=
    hr_private.normalize_employee_email(
      p_email
    );

  phone_value :=
    hr_private.normalize_employee_phone(
      p_phone
    );

  address_value :=
    hr_private.normalize_employee_address(
      p_address
    );

  citizen_value :=
    hr_private.normalize_employee_citizen_id(
      p_citizen_id
    );

  eid := public.create_employee(
    p_home,
    p_hire_date,
    p_full_name,
    p_group,
    p_pay_type,
    p_role,
    p_profile,
    p_teacher,
    p_reason
  );

  insert into
    hr_private.employee_private_profiles (
      employee_id,
      email,
      phone,
      address,
      citizen_id,
      created_by,
      updated_by
    )
  values (
    eid,
    email_value,
    phone_value,
    address_value,
    citizen_value,
    auth.uid(),
    auth.uid()
  );

  insert into public.employee_audit (
    employee_id,
    action,
    after_data,
    reason,
    actor
  )
  values (
    eid,
    'PRIVATE_PROFILE_CREATED',
    jsonb_build_object(
      'email_present', true,
      'phone_last4',
        right(phone_value, 4),
      'address_present', true,
      'citizen_id_masked',
        '********' ||
        right(citizen_value, 4)
    ),
    btrim(p_reason),
    auth.uid()
  );

  return eid;
end;
$fn$;

-- =====================================================
-- UPDATE / BACKFILL EXISTING STAFF
-- =====================================================

create function public.update_employee_private_profile(
  p_employee uuid,
  p_email text,
  p_phone text,
  p_address text,
  p_citizen_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  before_row
    hr_private.employee_private_profiles%rowtype;

  after_row
    hr_private.employee_private_profiles%rowtype;

  has_before boolean := false;

  email_value text;
  phone_value text;
  address_value text;
  citizen_value text;

  before_snapshot jsonb;
  after_snapshot jsonb;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
     or not coalesce(
       public.has_role('SUPER_ADMIN'),
       false
     )
  then
    raise exception
      'EMPLOYEE_PRIVATE_UNAUTHORIZED';
  end if;

  if p_employee is null
     or not exists (
       select 1
       from public.employees e
       where e.id = p_employee
     )
  then
    raise exception
      'EMPLOYEE_PRIVATE_EMPLOYEE_NOT_FOUND';
  end if;

  if p_reason is null
     or char_length(
       btrim(p_reason)
     ) not between 1 and 2000
  then
    raise exception
      'EMPLOYEE_PRIVATE_REASON_REQUIRED';
  end if;

  email_value :=
    hr_private.normalize_employee_email(
      p_email
    );

  phone_value :=
    hr_private.normalize_employee_phone(
      p_phone
    );

  address_value :=
    hr_private.normalize_employee_address(
      p_address
    );

  select *
    into before_row
  from hr_private.employee_private_profiles
  where employee_id = p_employee
  for update;

  has_before := found;

  if has_before then
    citizen_value :=
      case
        when nullif(
          btrim(
            coalesce(p_citizen_id, '')
          ),
          ''
        ) is null
        then before_row.citizen_id
        else
          hr_private.normalize_employee_citizen_id(
            p_citizen_id
          )
      end;

    before_snapshot :=
      jsonb_build_object(
        'email_present', true,
        'phone_last4',
          right(before_row.phone, 4),
        'address_present', true,
        'citizen_id_masked',
          '********' ||
          right(before_row.citizen_id, 4)
      );

    update
      hr_private.employee_private_profiles
    set
      email = email_value,
      phone = phone_value,
      address = address_value,
      citizen_id = citizen_value,
      updated_at = clock_timestamp(),
      updated_by = auth.uid()
    where employee_id = p_employee
    returning *
      into after_row;
  else
    citizen_value :=
      hr_private.normalize_employee_citizen_id(
        p_citizen_id
      );

    insert into
      hr_private.employee_private_profiles (
        employee_id,
        email,
        phone,
        address,
        citizen_id,
        created_by,
        updated_by
      )
    values (
      p_employee,
      email_value,
      phone_value,
      address_value,
      citizen_value,
      auth.uid(),
      auth.uid()
    )
    returning *
      into after_row;

    before_snapshot := null;
  end if;

  after_snapshot :=
    jsonb_build_object(
      'email_present', true,
      'phone_last4',
        right(after_row.phone, 4),
      'address_present', true,
      'citizen_id_masked',
        '********' ||
        right(after_row.citizen_id, 4)
    );

  insert into public.employee_audit (
    employee_id,
    action,
    before_data,
    after_data,
    reason,
    actor
  )
  values (
    p_employee,
    case
      when has_before
        then 'PRIVATE_PROFILE_UPDATED'
      else 'PRIVATE_PROFILE_CREATED'
    end,
    before_snapshot,
    after_snapshot,
    btrim(p_reason),
    auth.uid()
  );

  return jsonb_build_object(
    'status',
      case
        when has_before
          then 'UPDATED'
        else 'CREATED'
      end,
    'employee_id',
      after_row.employee_id,
    'email',
      after_row.email,
    'phone',
      after_row.phone,
    'address',
      after_row.address,
    'citizen_id_masked',
      '********' ||
      right(after_row.citizen_id, 4),
    'updated_at',
      after_row.updated_at
  );
end;
$fn$;

-- =====================================================
-- SUPER_ADMIN HR READ
-- Full contact + masked CCCD only.
-- =====================================================

create function public.employee_private_profile_summary(
  p_employee uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  row_value
    hr_private.employee_private_profiles%rowtype;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
     or not coalesce(
       public.has_role('SUPER_ADMIN'),
       false
     )
  then
    raise exception
      'EMPLOYEE_PRIVATE_UNAUTHORIZED';
  end if;

  select *
    into row_value
  from hr_private.employee_private_profiles
  where employee_id = p_employee;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'employee_id',
      row_value.employee_id,
    'email',
      row_value.email,
    'phone',
      row_value.phone,
    'address',
      row_value.address,
    'citizen_id_masked',
      '********' ||
      right(row_value.citizen_id, 4),
    'has_citizen_id',
      true,
    'updated_at',
      row_value.updated_at
  );
end;
$fn$;

-- =====================================================
-- PAYSLIP DELIVERY CONTACT
--
-- Only email + phone.
-- No address.
-- No CCCD.
-- Uses same visibility rule as payslip.
-- =====================================================

create function public.payroll_delivery_contact(
  p_payroll uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  pay public.teacher_payrolls%rowtype;
  period_row public.payroll_periods%rowtype;
  contact
    hr_private.employee_private_profiles%rowtype;
begin
  if auth.uid() is null
     or not coalesce(
       public.account_is_active(),
       false
     )
  then
    raise exception
      'PAYROLL_DELIVERY_UNAUTHORIZED';
  end if;

  select *
    into pay
  from public.teacher_payrolls
  where id = p_payroll;

  if not found then
    return null;
  end if;

  select *
    into period_row
  from public.payroll_periods
  where id = pay.period_id;

  if period_row.status
     not in ('APPROVED', 'FINALIZED')
  then
    return null;
  end if;

  if not (
    coalesce(
      public.has_role('SUPER_ADMIN'),
      false
    )
    or coalesce(
      public.has_role_permission(
        'FINANCE',
        'payroll.view',
        pay.branch_id
      ),
      false
    )
    or coalesce(
      public.can_read_employee_payroll(
        pay.employee_id,
        pay.branch_id
      ),
      false
    )
    or coalesce(
      public.can_read_own_payroll(
        pay.teacher_id,
        pay.branch_id
      ),
      false
    )
  )
  then
    return null;
  end if;

  if pay.employee_id is null then
    return jsonb_build_object(
      'employee_id', null,
      'email', null,
      'phone', null
    );
  end if;

  select *
    into contact
  from hr_private.employee_private_profiles
  where employee_id = pay.employee_id;

  if not found then
    return jsonb_build_object(
      'employee_id',
        pay.employee_id,
      'email', null,
      'phone', null
    );
  end if;

  return jsonb_build_object(
    'employee_id',
      contact.employee_id,
    'email',
      contact.email,
    'phone',
      contact.phone
  );
end;
$fn$;

-- =====================================================
-- SECURITY
-- =====================================================

revoke all
on function public.create_employee_with_private_profile(
  text,date,text,text,text,uuid,uuid,uuid,text,text,text,text,text
)
from public, anon, service_role;

revoke all
on function public.update_employee_private_profile(
  uuid,text,text,text,text,text
)
from public, anon, service_role;

revoke all
on function public.employee_private_profile_summary(uuid)
from public, anon, service_role;

revoke all
on function public.payroll_delivery_contact(uuid)
from public, anon, service_role;

grant execute
on function public.create_employee_with_private_profile(
  text,date,text,text,text,uuid,uuid,uuid,text,text,text,text,text
)
to authenticated;

grant execute
on function public.update_employee_private_profile(
  uuid,text,text,text,text,text
)
to authenticated;

grant execute
on function public.employee_private_profile_summary(uuid)
to authenticated;

grant execute
on function public.payroll_delivery_contact(uuid)
to authenticated;

-- =====================================================
-- VERIFY BEFORE COMMIT
-- =====================================================

do $verify$
begin
  if to_regclass(
       'hr_private.employee_private_profiles'
     ) is null
  then
    raise exception
      'EMPLOYEE_PRIVATE_TABLE_VERIFY_FAILED';
  end if;

  if to_regprocedure(
       'public.create_employee_with_private_profile(text,date,text,text,text,uuid,uuid,uuid,text,text,text,text,text)'
     ) is null
  then
    raise exception
      'EMPLOYEE_PRIVATE_CREATE_RPC_VERIFY_FAILED';
  end if;

  if to_regprocedure(
       'public.update_employee_private_profile(uuid,text,text,text,text,text)'
     ) is null
  then
    raise exception
      'EMPLOYEE_PRIVATE_UPDATE_RPC_VERIFY_FAILED';
  end if;

  if to_regprocedure(
       'public.payroll_delivery_contact(uuid)'
     ) is null
  then
    raise exception
      'PAYROLL_DELIVERY_CONTACT_VERIFY_FAILED';
  end if;

  if has_table_privilege(
       'authenticated',
       'hr_private.employee_private_profiles',
       'SELECT'
     )
     or has_table_privilege(
       'authenticated',
       'hr_private.employee_private_profiles',
       'INSERT'
     )
     or has_table_privilege(
       'authenticated',
       'hr_private.employee_private_profiles',
       'UPDATE'
     )
  then
    raise exception
      'EMPLOYEE_PRIVATE_DIRECT_TABLE_ACCESS_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.payroll_delivery_contact(uuid)',
       'EXECUTE'
     )
  then
    raise exception
      'EMPLOYEE_PRIVATE_ANON_EXECUTE_VERIFY_FAILED';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
