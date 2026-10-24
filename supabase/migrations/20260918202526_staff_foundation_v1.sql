-- VIBE Academy — Staff Foundation V1
-- Additive foundation only.
-- Existing employees/teachers/payroll tables and Payroll RPCs are preserved.
-- employee_versions.pay_type and operational_role_id remain legacy compatibility
-- fields until Payroll V2 is completed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_STAFF_FOUNDATION_REQUIRES_POSTGRES_MIGRATION_ROLE';
  end if;

  if to_regclass('public.employees') is null
     or to_regclass('public.employee_versions') is null
     or to_regclass('public.employee_audit') is null
     or to_regclass('public.teachers') is null
     or to_regclass('public.teacher_branches') is null
     or to_regclass('public.branches') is null
     or to_regclass('public.organization_units') is null
     or to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.has_role(text)') is null
     or to_regprocedure('public.has_role_permission(text,text,uuid)') is null
     or to_regprocedure('public.set_employee_version(uuid,integer,date,text,text,text,text,text,uuid,text)') is null
  then
    raise exception 'VIBE_STAFF_FOUNDATION_PREREQUISITE_MISSING';
  end if;

  if to_regclass('public.staff_role_catalog') is not null
     or to_regclass('public.staff_role_assignments') is not null
     or to_regclass('public.payroll_component_catalog') is not null
     or to_regclass('public.staff_compensation_components') is not null
     or to_regprocedure('public.adopt_teacher_as_staff(uuid,text,date,text,text)') is not null
  then
    raise exception 'VIBE_STAFF_FOUNDATION_ALREADY_EXISTS';
  end if;
end;
$preflight$;

create table public.staff_role_catalog (
  code text primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(btrim(description)) between 1 and 1000),
  requires_teacher_profile boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default clock_timestamp()
);

insert into public.staff_role_catalog(code,name,description,requires_teacher_profile) values
  ('TEACHER','Giáo viên','Vai trò giảng dạy; Staff có thể đồng thời giữ vai trò quản lý hoặc vai trò khác.',true),
  ('BRANCH_MANAGER','Quản lý chi nhánh','Vai trò quản lý vận hành một chi nhánh.',false),
  ('ACADEMIC_MANAGER','Quản lý đào tạo','Vai trò quản lý học thuật/đào tạo.',false),
  ('ACCOUNTANT','Kế toán','Vai trò nghiệp vụ kế toán.',false),
  ('ACADEMIC_STAFF','Nhân sự đào tạo','Nhân sự thực hiện nghiệp vụ học thuật/đào tạo.',false),
  ('ADMIN_STAFF','Nhân sự hành chính','Nhân sự hành chính/vận hành.',false),
  ('FINANCE_STAFF','Nhân sự tài chính','Nhân sự thực hiện nghiệp vụ tài chính.',false),
  ('OTHER_STAFF','Nhân sự khác','Vai trò nghề nghiệp khác chưa có mã chuyên biệt.',false);

create table public.staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  role_code text not null references public.staff_role_catalog(code),
  branch_id uuid references public.branches(id),
  effective_from date not null check (isfinite(effective_from)),
  effective_to date check (effective_to is null or (isfinite(effective_to) and effective_to >= effective_from)),
  is_primary boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp()
);

create index staff_role_assignments_employee_dates
  on public.staff_role_assignments(employee_id,effective_from,effective_to);

create index staff_role_assignments_branch_role
  on public.staff_role_assignments(branch_id,role_code,status,effective_from);

create unique index staff_role_assignment_same_start
  on public.staff_role_assignments(
    employee_id,
    role_code,
    coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),
    effective_from
  );

create table public.payroll_component_catalog (
  code text primary key,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null check (category in ('EARNING','REIMBURSEMENT','DEDUCTION')),
  default_calculation_method text not null
    check (default_calculation_method in ('FIXED_AMOUNT','PER_SESSION','PER_HOUR','PERCENTAGE','EVENT')),
  recurring_configurable boolean not null default true,
  description text check (description is null or char_length(btrim(description)) between 1 and 1000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default clock_timestamp()
);

insert into public.payroll_component_catalog(
  code,name,category,default_calculation_method,recurring_configurable,description
) values
  ('BASE_SALARY','Lương tháng','EARNING','FIXED_AMOUNT',true,'Lương tháng theo kỳ hiệu lực của Staff.'),
  ('FIXED_PAY','Lương cố định','EARNING','FIXED_AMOUNT',true,'Khoản lương cố định tách riêng khỏi lương tháng khi chính sách áp dụng.'),
  ('POSITION_PAY','Lương vị trí','EARNING','FIXED_AMOUNT',true,'Khoản lương/phụ cấp gắn với vị trí hoặc trách nhiệm.'),
  ('TEACHING_PER_SESSION','Lương theo buổi','EARNING','PER_SESSION',true,'Đơn giá theo buổi dạy thực tế đủ điều kiện tính lương.'),
  ('BUSINESS_TRIP_ALLOWANCE','Trợ cấp công tác','EARNING','FIXED_AMOUNT',true,'Khoản trợ cấp công tác theo chính sách; khác công tác phí.'),
  ('BONUS','Thưởng','EARNING','EVENT',false,'Khoản thưởng phát sinh theo quyết định; không mặc định lặp lại.'),
  ('TRAVEL_EXPENSE','Công tác phí','REIMBURSEMENT','EVENT',false,'Khoản công tác phí đã được lập bảng kê và phê duyệt.'),
  ('LABOR_INSURANCE','Bảo hiểm lao động','DEDUCTION','FIXED_AMOUNT',true,'Khoản khấu trừ nếu chính sách áp dụng.'),
  ('SOCIAL_INSURANCE','Bảo hiểm xã hội','DEDUCTION','FIXED_AMOUNT',true,'Khoản khấu trừ nếu chính sách áp dụng.');

create table public.staff_compensation_components (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  component_code text not null references public.payroll_component_catalog(code),
  branch_id uuid references public.branches(id),
  calculation_method text not null
    check (calculation_method in ('FIXED_AMOUNT','PER_SESSION','PER_HOUR','PERCENTAGE')),
  amount numeric(16,2),
  rate numeric(16,2),
  percentage numeric(9,4),
  basis_component_code text references public.payroll_component_catalog(code),
  currency text,
  class_type text check (class_type is null or class_type in ('ONE_ON_ONE','GROUP')),
  effective_from date not null check (isfinite(effective_from)),
  effective_to date check (effective_to is null or (isfinite(effective_to) and effective_to >= effective_from)),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  constraint staff_compensation_value_shape check (
    (
      calculation_method = 'FIXED_AMOUNT'
      and amount is not null and amount > 0 and amount <> 'NaN'::numeric
      and rate is null and percentage is null
      and currency ~ '^[A-Z]{3}$'
      and basis_component_code is null
    )
    or
    (
      calculation_method in ('PER_SESSION','PER_HOUR')
      and rate is not null and rate > 0 and rate <> 'NaN'::numeric
      and amount is null and percentage is null
      and currency ~ '^[A-Z]{3}$'
      and basis_component_code is null
    )
    or
    (
      calculation_method = 'PERCENTAGE'
      and percentage is not null and percentage > 0 and percentage <= 100
      and percentage <> 'NaN'::numeric
      and amount is null and rate is null
      and currency is null
      and basis_component_code is not null
    )
  ),
  constraint staff_compensation_class_type_shape check (
    class_type is null or calculation_method = 'PER_SESSION'
  )
);

create index staff_compensation_employee_dates
  on public.staff_compensation_components(employee_id,component_code,effective_from,effective_to);

create index staff_compensation_branch_component
  on public.staff_compensation_components(branch_id,component_code,status,effective_from);

create unique index staff_compensation_same_start
  on public.staff_compensation_components(
    employee_id,
    component_code,
    coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(class_type,''),
    effective_from
  );

alter table public.staff_role_catalog enable row level security;
alter table public.staff_role_assignments enable row level security;
alter table public.payroll_component_catalog enable row level security;
alter table public.staff_compensation_components enable row level security;

create policy staff_role_catalog_read
  on public.staff_role_catalog
  for select to authenticated
  using (coalesce(public.account_is_active(),false));

create policy payroll_component_catalog_read
  on public.payroll_component_catalog
  for select to authenticated
  using (coalesce(public.account_is_active(),false));

create policy staff_role_assignments_admin_read
  on public.staff_role_assignments
  for select to authenticated
  using (coalesce(public.has_role('SUPER_ADMIN'),false));

create policy staff_compensation_admin_finance_read
  on public.staff_compensation_components
  for select to authenticated
  using (
    coalesce(public.has_role('SUPER_ADMIN'),false)
    or (
      branch_id is not null
      and coalesce(public.has_role_permission('FINANCE','payroll.view',branch_id),false)
    )
  );

revoke all on
  public.staff_role_catalog,
  public.staff_role_assignments,
  public.payroll_component_catalog,
  public.staff_compensation_components
from public, anon, authenticated, service_role;

grant select on
  public.staff_role_catalog,
  public.staff_role_assignments,
  public.payroll_component_catalog,
  public.staff_compensation_components
to authenticated;

create function public.adopt_teacher_as_staff(
  p_teacher uuid,
  p_home text,
  p_hire_date date,
  p_legacy_pay_type text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  t public.teachers%rowtype;
  existing_employee public.employees%rowtype;
  eid uuid;
  bid uuid;
  n bigint;
  employee_code_value text;
  full_name_value text;
  primary_branch boolean;
begin
  if auth.uid() is null
     or not coalesce(public.account_is_active(),false)
     or not coalesce(public.has_role('SUPER_ADMIN'),false)
  then
    raise exception 'STAFF_ADOPT_UNAUTHORIZED';
  end if;

  if p_teacher is null then raise exception 'STAFF_ADOPT_TEACHER_REQUIRED'; end if;
  if p_home is null or char_length(btrim(p_home)) not between 1 and 50 then
    raise exception 'STAFF_ADOPT_HOME_REQUIRED';
  end if;
  if p_hire_date is null or not isfinite(p_hire_date) then
    raise exception 'STAFF_ADOPT_INVALID_HIRE_DATE';
  end if;
  if p_legacy_pay_type not in ('MONTHLY','PER_SESSION','HOURLY') then
    raise exception 'STAFF_ADOPT_INVALID_LEGACY_PAY_TYPE';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then
    raise exception 'STAFF_ADOPT_REASON_REQUIRED';
  end if;

  select * into t
  from public.teachers
  where id = p_teacher
  for update;

  if not found then raise exception 'STAFF_ADOPT_TEACHER_NOT_FOUND'; end if;
  if t.status <> 'ACTIVE' then raise exception 'STAFF_ADOPT_ACTIVE_TEACHER_REQUIRED'; end if;

  select * into existing_employee
  from public.employees
  where teacher_id = t.id;

  if found then
    return jsonb_build_object(
      'status','ALREADY_STAFF',
      'employee_id',existing_employee.id,
      'employee_code',existing_employee.employee_code,
      'teacher_id',t.id
    );
  end if;

  select u.branch_id into bid
  from public.organization_units u
  join public.branches b on b.id = u.branch_id and b.status = 'ACTIVE'
  where u.code = btrim(p_home);

  if bid is null then
    raise exception 'STAFF_ADOPT_ACTIVE_HOME_BRANCH_REQUIRED';
  end if;

  perform hr_private.check_links(t.user_id,t.id);

  insert into hr_private.employee_counters(unit_code,last_number)
  values(btrim(p_home),1)
  on conflict(unit_code)
  do update set last_number = hr_private.employee_counters.last_number + 1
  returning last_number into n;

  employee_code_value :=
    'VIBE-' || btrim(p_home) || '-' ||
    lpad(n::text,greatest(4,length(n::text)),'0');

  full_name_value := coalesce(nullif(btrim(t.full_name),''), t.teacher_code);

  insert into public.employees(
    employee_code,home_unit,hire_date,profile_id,teacher_id,created_by
  )
  values(
    employee_code_value,btrim(p_home),p_hire_date,t.user_id,t.id,auth.uid()
  )
  returning id into eid;

  insert into public.employee_audit(
    employee_id,action,after_data,reason,actor
  )
  select eid,'IDENTITY_CREATED',to_jsonb(e),btrim(p_reason),auth.uid()
  from public.employees e
  where e.id = eid;

  perform public.set_employee_version(
    eid,0,p_hire_date,full_name_value,btrim(p_home),
    'STAFF','ACTIVE',p_legacy_pay_type,null,btrim(p_reason)
  );

  insert into public.staff_role_assignments(
    employee_id,role_code,branch_id,effective_from,is_primary,status,reason,created_by
  )
  values(
    eid,'TEACHER',bid,p_hire_date,true,'ACTIVE',btrim(p_reason),auth.uid()
  );

  primary_branch := not exists(
    select 1 from public.teacher_branches tb
    where tb.teacher_id = t.id and tb.is_primary
  );

  insert into public.teacher_branches(teacher_id,branch_id,is_primary)
  values(t.id,bid,primary_branch)
  on conflict(teacher_id,branch_id) do nothing;

  return jsonb_build_object(
    'status','ADOPTED',
    'employee_id',eid,
    'employee_code',employee_code_value,
    'teacher_id',t.id,
    'role_code','TEACHER',
    'branch_id',bid,
    'home_unit',btrim(p_home),
    'hire_date',p_hire_date,
    'legacy_pay_type',p_legacy_pay_type,
    'payroll_v2_integration','NOT_ENABLED_IN_STAFF_FOUNDATION_V1'
  );
end;
$fn$;

revoke all on function public.adopt_teacher_as_staff(uuid,text,date,text,text)
from public, anon, authenticated, service_role;

grant execute on function public.adopt_teacher_as_staff(uuid,text,date,text,text)
to authenticated;

comment on table public.staff_role_catalog is
  'Occupational/business Staff roles. Separate from public.roles/user_roles, which control application access.';
comment on table public.staff_role_assignments is
  'Effective-dated many-to-many Staff occupational role assignments.';
comment on table public.payroll_component_catalog is
  'Payroll V2 component catalog; does not itself post Payroll.';
comment on table public.staff_compensation_components is
  'Recurring Staff compensation configuration. Event components such as BONUS/TRAVEL_EXPENSE use approval workflows.';

do $verify$
declare actual integer;
begin
  select count(*) into actual from public.staff_role_catalog where status='ACTIVE';
  if actual <> 8 then raise exception 'STAFF_FOUNDATION_ROLE_CATALOG_VERIFY_FAILED'; end if;

  select count(*) into actual from public.payroll_component_catalog where status='ACTIVE';
  if actual <> 9 then raise exception 'STAFF_FOUNDATION_COMPONENT_CATALOG_VERIFY_FAILED'; end if;

  if not exists(
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.adopt_teacher_as_staff(uuid,text,date,text,text)')
      and p.prosecdef
      and 'search_path=pg_catalog, pg_temp'=any(p.proconfig)
  ) then
    raise exception 'STAFF_FOUNDATION_ADOPT_RPC_SECURITY_VERIFY_FAILED';
  end if;
end;
$verify$;

commit;
