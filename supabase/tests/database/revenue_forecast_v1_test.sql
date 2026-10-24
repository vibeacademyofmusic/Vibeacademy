begin;

-- Fixture prerequisite for the current enrollment guard. Does not change production rules.
create or replace function pg_temp.prepare_enrollment_fixture(p_class uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.classes%rowtype; course public.courses%rowtype; level_id uuid; t uuid; r uuid; slot int;
begin
 select * into c from public.classes where id=p_class;
 if not found or c.course_id is null or c.xmin::text is distinct from txid_current()::text then return; end if;
 select * into course from public.courses where id=c.course_id;
 if not found then return; end if;
 level_id := course.level_id;
 if level_id is null then
   select id into level_id from public.curriculum_levels where curriculum_id=course.curriculum_id order by sequence_no limit 1;
   if level_id is null then return; end if;
   update public.courses set level_id=level_id where id=course.id and xmin::text=txid_current()::text;
 end if;
 update public.classes set accepted_from_level_id=coalesce(accepted_from_level_id,level_id),
   accepted_to_level_id=coalesce(accepted_to_level_id,level_id) where id=c.id;
 update public.students set default_branch_id=c.branch_id
  where default_branch_id is null and status='ACTIVE' and xmin::text=txid_current()::text;
 insert into public.student_curriculum_enrollments(student_id,curriculum_id,current_level_id,started_at,status,is_primary)
 select s.id,course.curriculum_id,level_id,date '2000-01-01','ACTIVE',true
 from public.students s
 where s.default_branch_id=c.branch_id and s.xmin::text=txid_current()::text
   and not exists(select 1 from public.student_curriculum_enrollments a where a.student_id=s.id and a.status='ACTIVE' and (a.curriculum_id=course.curriculum_id or a.is_primary));
 if not exists(select 1 from public.class_teachers where class_id=c.id and teacher_role='PRIMARY' and (is_active or ended_at is not null)) then
   select id into t from public.teachers where teacher_code='FIX-'||c.id;
   if t is null then
     insert into public.teachers(teacher_code,full_name) values('FIX-'||c.id,'TEST prerequisite teacher') returning id into t;
     insert into public.teacher_branches(teacher_id,branch_id,is_primary) values(t,c.branch_id,true);
   end if;
   insert into public.class_teachers(class_id,teacher_id,teacher_role,assigned_at) values(c.id,t,'PRIMARY',date '2000-01-01');
 end if;
 if not exists(select 1 from public.rooms where branch_id=c.branch_id and code='FIX-'||c.id) then
   insert into public.rooms(branch_id,code,name,capacity) values(c.branch_id,'FIX-'||c.id,'TEST prerequisite room',30) returning id into r;
 else
   select id into r from public.rooms where branch_id=c.branch_id and code='FIX-'||c.id limit 1;
 end if;
 if exists(select 1 from public.schedules where class_id=c.id and status='ACTIVE') then
   update public.schedules set room_id=coalesce(room_id,r) where class_id=c.id and status='ACTIVE' and room_id is null;
 else
   slot := abs(hashtext(c.id::text));
   insert into public.schedules(class_id,room_id,day_of_week,start_time,end_time,effective_from,timezone,status)
   values(c.id,r,1+(slot%7),time '06:00'+(slot%10)*interval '1 hour',time '06:50'+(slot%10)*interval '1 hour',date '2000-01-01','Asia/Ho_Chi_Minh','ACTIVE');
 end if;
end $$;


create extension if not exists pgtap;

select plan(8);

-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  'ab100000-0000-0000-0000-000000000001',
  'FORECAST-TEST-BRANCH',
  'Forecast Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  'ab200000-0000-0000-0000-000000000001',
  'FORECAST-TEST-CURRICULUM',
  'Forecast Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  'ab300000-0000-0000-0000-000000000001',
  'ab200000-0000-0000-0000-000000000001',
  'FORECAST-G1',
  'Forecast Grade 1',
  1
);

insert into public.courses (
  id,
  curriculum_id,
  level_id,
  code,
  name
)
values (
  'ab400000-0000-0000-0000-000000000001',
  'ab200000-0000-0000-0000-000000000001',
  'ab300000-0000-0000-0000-000000000001',
  'FORECAST-COURSE',
  'Forecast Test Course'
);

insert into public.classes (
  id,
  branch_id,
  course_id,
  code,
  name,
  class_type,
  capacity,
  status
)
values (
  'ab500000-0000-0000-0000-000000000001',
  'ab100000-0000-0000-0000-000000000001',
  'ab400000-0000-0000-0000-000000000001',
  'FORECAST-CLASS',
  'Forecast Test Class',
  'GROUP',
  10,
  'ACTIVE'
);

insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values
(
  'ab600000-0000-0000-0000-000000000001',
  'FORECAST-STUDENT-A',
  'ab100000-0000-0000-0000-000000000001',
  'Forecast Student A'
),
(
  'ab600000-0000-0000-0000-000000000002',
  'FORECAST-STUDENT-B',
  'ab100000-0000-0000-0000-000000000001',
  'Forecast Student B'
);

select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
insert into public.enrollments (
  id,
  student_id,
  class_id,
  enrolled_at,
  started_at,
  status
)
values
(
  'ab700000-0000-0000-0000-000000000001',
  'ab600000-0000-0000-0000-000000000001',
  'ab500000-0000-0000-0000-000000000001',
  '2026-06-01',
  '2026-06-01',
  'ACTIVE'
),
(
  'ab700000-0000-0000-0000-000000000002',
  'ab600000-0000-0000-0000-000000000002',
  'ab500000-0000-0000-0000-000000000001',
  '2026-07-01',
  '2026-07-01',
  'ACTIVE'
);

insert into public.enrollment_tuition (
  id,
  enrollment_id,
  tuition_plan_id,
  starts_on,
  amount
)
values
(
  'ab800000-0000-0000-0000-000000000001',
  'ab700000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-06-01',
  3000000
),
(
  'ab800000-0000-0000-0000-000000000002',
  'ab700000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  '2026-07-01',
  3000000
);

-- Fix typo-safe second enrollment id if needed
update public.enrollment_tuition
set enrollment_id =
  'ab700000-0000-0000-0000-000000000002'
where id =
  'ab800000-0000-0000-0000-000000000002';

insert into auth.users (
  id
)
values (
  'abf00000-0000-0000-0000-000000000001'
);

insert into public.roles (
  code,
  name
)
values (
  'SUPER_ADMIN',
  'Super Admin'
)
on conflict (code) do nothing;

-- Authorization requires an active account as well as the role assignment.
insert into public.profiles(id, status) values ('abf00000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (
  user_id,
  role_id
)
select
  'abf00000-0000-0000-0000-000000000001',
  role.id
from public.roles
as role
where role.code = 'SUPER_ADMIN'
on conflict do nothing;

select set_config(
  'request.jwt.claim.sub',
  'abf00000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;

-- Force first term to end this month and second next month.
reset role;

update public.enrollment_tuition
set effective_ends_on =
  (
    date_trunc(
      'month',
      timezone(
        'Asia/Ho_Chi_Minh',
        now()
      )
    )
    + interval '1 month'
    - interval '1 day'
  )::date
where id =
  'ab800000-0000-0000-0000-000000000001';

update public.enrollment_tuition
set effective_ends_on =
  (
    date_trunc(
      'month',
      timezone(
        'Asia/Ho_Chi_Minh',
        now()
      )
    )
    + interval '2 month'
    - interval '1 day'
  )::date
where id =
  'ab800000-0000-0000-0000-000000000002';

set local role authenticated;

-- =========================================================
-- CREATE + ISSUE CURRENT-MONTH INVOICE
-- =========================================================

select public.create_tuition_invoice(
  'ab800000-0000-0000-0000-000000000001',
  null
);

select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'ab800000-0000-0000-0000-000000000001'
  ),
  (
    timezone(
      'Asia/Ho_Chi_Minh',
      now()
    )
  )::date,
  (
    date_trunc(
      'month',
      timezone(
        'Asia/Ho_Chi_Minh',
        now()
      )
    )
    + interval '1 month'
    - interval '1 day'
  )::date
);

-- =========================================================
-- 1. CURRENT MONTH ROW EXISTS
-- =========================================================

select is(
  (
    select forecast_period
    from public.branch_monthly_revenue_forecast
    where branch_id =
      'ab100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and forecast_period = 'CURRENT_MONTH'
  ),
  'CURRENT_MONTH',
  'current month forecast row exists'
);

-- =========================================================
-- 2. NEXT MONTH ROW EXISTS
-- =========================================================

select is(
  (
    select forecast_period
    from public.branch_monthly_revenue_forecast
    where branch_id =
      'ab100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and forecast_period = 'NEXT_MONTH'
  ),
  'NEXT_MONTH',
  'next month forecast row exists'
);

-- =========================================================
-- 3. CURRENT MONTH EXPIRING STUDENT COUNT
-- =========================================================

select is(
  (
    select expiring_student_count
    from public.branch_monthly_revenue_forecast
    where branch_id =
      'ab100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and forecast_period = 'CURRENT_MONTH'
  ),
  1::bigint,
  'current month has one expiring student'
);

-- =========================================================
-- 4. NEXT MONTH EXPIRING STUDENT COUNT
-- =========================================================

select is(
  (
    select expiring_student_count
    from public.branch_monthly_revenue_forecast
    where branch_id =
      'ab100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and forecast_period = 'NEXT_MONTH'
  ),
  1::bigint,
  'next month has one expiring student'
);

-- =========================================================
-- 5. CURRENT MONTH PROJECTED RENEWAL
-- =========================================================

select is(
  (
    select projected_renewal_amount
    from public.branch_monthly_revenue_forecast
    where branch_id =
      'ab100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and forecast_period = 'CURRENT_MONTH'
  ),
  (
    select amount
    from public.enrollment_tuition
    where id =
      'ab800000-0000-0000-0000-000000000001'
  ),
  'current month renewal forecast uses current tuition amount'
);

-- =========================================================
-- 6. EXPECTED CASH DUE MATCHES OUTSTANDING
-- =========================================================

select is(
  (
    select expected_cash_due
    from public.branch_monthly_revenue_forecast
    where branch_id =
      'ab100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and forecast_period = 'CURRENT_MONTH'
  ),
  (
    select outstanding_balance
    from public.invoice_receivables
    where enrollment_tuition_id =
      'ab800000-0000-0000-0000-000000000001'
  ),
  'expected cash due matches current outstanding invoice balance'
);

-- =========================================================
-- 7. GROSS OPPORTUNITY = RENEWAL + CASH DUE
-- =========================================================

select is(
  (
    select gross_forecast_opportunity
    from public.branch_monthly_revenue_forecast
    where branch_id =
      'ab100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and forecast_period = 'CURRENT_MONTH'
  ),
  (
    select
      projected_renewal_amount
      + expected_cash_due
    from public.branch_monthly_revenue_forecast
    where branch_id =
      'ab100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and forecast_period = 'CURRENT_MONTH'
  ),
  'gross opportunity combines renewal and expected cash due'
);

-- =========================================================
-- 8. SYSTEM TOTAL MATCHES BRANCH TOTAL
-- =========================================================

select is(
  (
    select gross_forecast_opportunity
    from public.system_monthly_revenue_forecast
    where currency = 'VND'
      and forecast_period = 'CURRENT_MONTH'
  ),
  (
    select sum(
      gross_forecast_opportunity
    )::numeric(14,2)
    from public.branch_monthly_revenue_forecast
    where currency = 'VND'
      and forecast_period = 'CURRENT_MONTH'
  ),
  'system forecast equals sum of branch forecasts'
);

select * from finish();

rollback;
