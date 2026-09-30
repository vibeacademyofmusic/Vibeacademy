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

\ir ../helpers/approved_finance.inc
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Fixture identities are scoped; test transaction rolls back.
insert into public.branches (
  id,
  code,
  name
)
values (
  '11000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-BRANCH',
  'Attendance Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '21000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-CURRICULUM',
  'Attendance Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '31000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-LEVEL',
  'Attendance Test Level',
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
  '41000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-COURSE',
  'Attendance Test Course'
);

insert into public.classes (
  id,
  branch_id,
  course_id,
  code,
  name,
  status
)
values
  (
    '51000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-CLASS-A',
    'Attendance Test Class A',
    'ACTIVE'
  ),
  (
    '51000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-CLASS-B',
    'Attendance Test Class B',
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
    '61000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-STUDENT-A',
    '11000000-0000-0000-0000-000000000001',
    'Attendance Test Student A'
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    'ATTENDANCE-TEST-STUDENT-B',
    '11000000-0000-0000-0000-000000000001',
    'Attendance Test Student B'
  );

select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
insert into public.enrollments (
  id,
  student_id,
  class_id,
  started_at,
  status
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    '2026-08-01',
    'ACTIVE'
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '61000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000002',
    '2026-08-01',
    'ACTIVE'
  );

insert into public.schedules (
  id,
  class_id,
  day_of_week,
  start_time,
  end_time,
  effective_from,
  timezone,
  status
)
values (
  '81000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  1,
  '09:00',
  '10:00',
  '2026-08-01',
  'Asia/Ho_Chi_Minh',
  'ACTIVE'
);

insert into public.session_occurrences (
  id,
  schedule_id,
  occurrence_date,
  starts_at,
  ends_at,
  status
)
values (
  '91000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '2026-08-03',
  '2026-08-03 09:00:00+07',
  '2026-08-03 10:00:00+07',
  'SCHEDULED'
);

insert into public.attendance_records (id, session_occurrence_id, enrollment_id, status)
values ('a1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'PRESENT');
insert into branches(id,code,name) values('11000000-0000-0000-0000-000000000002','SCOPE-B','Scope B');
update classes set branch_id='11000000-0000-0000-0000-000000000002' where id='51000000-0000-0000-0000-000000000002';
insert into auth.users(id) select ('bc000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5) i;
insert into profiles(id) select ('bc000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5) i;
insert into user_roles(user_id,role_id,branch_id) select 'bc000000-0000-4000-8000-000000000001',id,'11000000-0000-0000-0000-000000000001' from roles where code='BRANCH_ADMIN';
insert into user_roles(user_id,role_id) select ('bc000000-0000-4000-8000-'||lpad(v.n::text,12,'0'))::uuid,r.id from (values (2,'TEACHER'),(3,'PARENT'),(4,'STUDENT'),(5,'SUPER_ADMIN')) v(n,code) join roles r on r.code=v.code;
insert into teachers(id,user_id,teacher_code,full_name) values('bc100000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000002','SCOPE-T','Scope Teacher');
delete from public.class_teachers where teacher_id in (select id from public.teachers where teacher_code like 'FIX-%');
insert into class_teachers(class_id,teacher_id,assigned_at) values('51000000-0000-0000-0000-000000000001','bc100000-0000-4000-8000-000000000001','2026-01-01');
insert into parents(id,user_id,parent_code) values('bc200000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000003','SCOPE-P');
insert into student_parents(parent_id,student_id) values('bc200000-0000-4000-8000-000000000001','61000000-0000-0000-0000-000000000001');
update students set user_id='bc000000-0000-4000-8000-000000000004' where id='61000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub','bc000000-0000-4000-8000-000000000005',true);
update classes set class_type='GROUP',capacity=10 where id in ('51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002');
insert into enrollment_tuition(id,enrollment_id,tuition_plan_id,starts_on,amount)
values('be000000-0000-4000-8000-000000000001','71000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','2026-08-01',3000000),
('be000000-0000-4000-8000-000000000002','71000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003','2026-08-01',3000000);
select create_tuition_invoice('be000000-0000-4000-8000-000000000001',null);
select create_tuition_invoice('be000000-0000-4000-8000-000000000002',null);
select issue_invoice(id,'2026-08-01','2026-08-31') from invoices where enrollment_tuition_id in ('be000000-0000-4000-8000-000000000001','be000000-0000-4000-8000-000000000002');

select create_payment('61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',1000,'VND','CASH');
select create_payment('61000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000002',1000,'VND','CASH');
select allocate_payment_to_invoice(p.id,i.id,500) from payments p join invoices i on i.student_id_snapshot=p.student_id_snapshot
where p.student_id_snapshot in ('61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002');
select pg_temp.create_refund(id,100,now(),'Scope test') from payments where student_id_snapshot in ('61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002');
select pg_temp.allocate_refund_to_payment_allocation(r.id,a.id,100) from refunds r join payment_allocations a on a.payment_id=r.payment_id
where r.student_id_snapshot in ('61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002');
insert into auth.users(id) values('bf000000-0000-4000-8000-000000000001');
insert into profiles(id) values('bf000000-0000-4000-8000-000000000001');
insert into user_roles(user_id,role_id,branch_id) select 'bf000000-0000-4000-8000-000000000001',id,'11000000-0000-0000-0000-000000000001' from roles where code='FINANCE';
insert into payroll_periods(id,branch_id,starts_on,ends_on) values
('bf100000-0000-4000-8000-000000000001','11000000-0000-0000-0000-000000000001','2000-01-01','2000-01-31'),
('bf100000-0000-4000-8000-000000000002','11000000-0000-0000-0000-000000000002','2000-01-01','2000-01-31');
insert into teacher_payrolls(period_id,teacher_id,branch_id,teacher_name,pay_type,currency)
select id,'bc100000-0000-4000-8000-000000000001',branch_id,'Scope teacher','MONTHLY','VND' from payroll_periods where id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002');
create temp table scope_ids as select i.id invoice_id,p.id payment_id,r.id refund_id,i.branch_id_snapshot branch_id
from invoices i join payments p on p.student_id_snapshot=i.student_id_snapshot join refunds r on r.payment_id=p.id
where i.student_id_snapshot in ('61000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002');
grant select on scope_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','bf000000-0000-4000-8000-000000000001',true);
select is((select count(*) from invoices where id in (select invoice_id from scope_ids)),1::bigint,'branch Finance scoped: invoices');
select is((select count(*) from invoice_items where invoice_id in (select invoice_id from scope_ids)),1::bigint,'branch Finance scoped: invoice_items');
select is((select count(*) from payments where id in (select payment_id from scope_ids)),1::bigint,'branch Finance scoped: payments');
select is((select count(*) from payment_allocations where payment_id in (select payment_id from scope_ids)),1::bigint,'branch Finance scoped: payment_allocations');
select is((select count(*) from refunds where id in (select refund_id from scope_ids)),1::bigint,'branch Finance scoped: refunds');
select is((select count(*) from refund_allocations where refund_id in (select refund_id from scope_ids)),1::bigint,'branch Finance scoped: refund_allocations');
select is((select count(*) from invoice_receivables where invoice_id in (select invoice_id from scope_ids)),1::bigint,'branch Finance scoped: invoice_receivables');
select is((select count(*) from payroll_periods where id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),1::bigint,'branch Finance scoped: payroll_periods');
select is((select count(*) from teacher_payrolls where period_id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),1::bigint,'branch Finance scoped: teacher_payrolls');
select is((select count(*) from invoices where branch_id_snapshot='11000000-0000-0000-0000-000000000002'),0::bigint,'other branch invoices denied explicitly');
select throws_ok($$select create_payment('61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001',100,'VND','CASH')$$,'P0001','SUPER_ADMIN role required','read rollout does not enable payment mutation');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='INACTIVE' where id='bf000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bf000000-0000-4000-8000-000000000001',true);
select is((select count(*) from invoices where id in (select invoice_id from scope_ids)),0::bigint,'inactive finance denied: invoices');
select is((select count(*) from invoice_items where invoice_id in (select invoice_id from scope_ids)),0::bigint,'inactive finance denied: invoice_items');
select is((select count(*) from payments where id in (select payment_id from scope_ids)),0::bigint,'inactive finance denied: payments');
select is((select count(*) from payment_allocations where payment_id in (select payment_id from scope_ids)),0::bigint,'inactive finance denied: payment_allocations');
select is((select count(*) from refunds where id in (select refund_id from scope_ids)),0::bigint,'inactive finance denied: refunds');
select is((select count(*) from refund_allocations where refund_id in (select refund_id from scope_ids)),0::bigint,'inactive finance denied: refund_allocations');
select is((select count(*) from invoice_receivables where invoice_id in (select invoice_id from scope_ids)),0::bigint,'inactive finance denied: invoice_receivables');
select is((select count(*) from payroll_periods where id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),0::bigint,'inactive finance denied: payroll_periods');
select is((select count(*) from teacher_payrolls where period_id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),0::bigint,'inactive finance denied: teacher_payrolls');
reset role;
select set_config('request.jwt.claim.sub','',true);
update profiles set status='ACTIVE' where id='bf000000-0000-4000-8000-000000000001';
update user_roles set branch_id=null where user_id='bf000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bf000000-0000-4000-8000-000000000001',true);
select is((select count(*) from invoices where id in (select invoice_id from scope_ids)),2::bigint,'explicit global Finance: invoices');
select is((select count(*) from invoice_items where invoice_id in (select invoice_id from scope_ids)),2::bigint,'explicit global Finance: invoice_items');
select is((select count(*) from payments where id in (select payment_id from scope_ids)),2::bigint,'explicit global Finance: payments');
select is((select count(*) from payment_allocations where payment_id in (select payment_id from scope_ids)),2::bigint,'explicit global Finance: payment_allocations');
select is((select count(*) from refunds where id in (select refund_id from scope_ids)),2::bigint,'explicit global Finance: refunds');
select is((select count(*) from refund_allocations where refund_id in (select refund_id from scope_ids)),2::bigint,'explicit global Finance: refund_allocations');
select is((select count(*) from invoice_receivables where invoice_id in (select invoice_id from scope_ids)),2::bigint,'explicit global Finance: invoice_receivables');
select is((select count(*) from payroll_periods where id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),2::bigint,'explicit global Finance: payroll_periods');
select is((select count(*) from teacher_payrolls where period_id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),2::bigint,'explicit global Finance: teacher_payrolls');
reset role;
select set_config('request.jwt.claim.sub','',true);
update user_roles set valid_until=now()-interval '1 day' where user_id='bf000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','bf000000-0000-4000-8000-000000000001',true);
select is((select count(*) from invoices where id in (select invoice_id from scope_ids)),0::bigint,'expired Finance: invoices');
select is((select count(*) from invoice_items where invoice_id in (select invoice_id from scope_ids)),0::bigint,'expired Finance: invoice_items');
select is((select count(*) from payments where id in (select payment_id from scope_ids)),0::bigint,'expired Finance: payments');
select is((select count(*) from payment_allocations where payment_id in (select payment_id from scope_ids)),0::bigint,'expired Finance: payment_allocations');
select is((select count(*) from refunds where id in (select refund_id from scope_ids)),0::bigint,'expired Finance: refunds');
select is((select count(*) from refund_allocations where refund_id in (select refund_id from scope_ids)),0::bigint,'expired Finance: refund_allocations');
select is((select count(*) from invoice_receivables where invoice_id in (select invoice_id from scope_ids)),0::bigint,'expired Finance: invoice_receivables');
select is((select count(*) from payroll_periods where id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),0::bigint,'expired Finance: payroll_periods');
select is((select count(*) from teacher_payrolls where period_id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),0::bigint,'expired Finance: teacher_payrolls');
reset role;
select set_config('request.jwt.claim.sub','',true);
update user_roles set valid_until=null where user_id='bf000000-0000-4000-8000-000000000001';
delete from role_permissions where role_id=(select id from roles where code='FINANCE') and permission_id in (select id from permissions where code in ('finance.view','payroll.view'));
set local role authenticated;
select set_config('request.jwt.claim.sub','bf000000-0000-4000-8000-000000000001',true);
select is((select count(*) from invoices where id in (select invoice_id from scope_ids)),0::bigint,'removed action permission: invoices');
select is((select count(*) from invoice_items where invoice_id in (select invoice_id from scope_ids)),0::bigint,'removed action permission: invoice_items');
select is((select count(*) from payments where id in (select payment_id from scope_ids)),0::bigint,'removed action permission: payments');
select is((select count(*) from payment_allocations where payment_id in (select payment_id from scope_ids)),0::bigint,'removed action permission: payment_allocations');
select is((select count(*) from refunds where id in (select refund_id from scope_ids)),0::bigint,'removed action permission: refunds');
select is((select count(*) from refund_allocations where refund_id in (select refund_id from scope_ids)),0::bigint,'removed action permission: refund_allocations');
select is((select count(*) from invoice_receivables where invoice_id in (select invoice_id from scope_ids)),0::bigint,'removed action permission: invoice_receivables');
select is((select count(*) from payroll_periods where id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),0::bigint,'removed action permission: payroll_periods');
select is((select count(*) from teacher_payrolls where period_id in ('bf100000-0000-4000-8000-000000000001','bf100000-0000-4000-8000-000000000002')),0::bigint,'removed action permission: teacher_payrolls');
select ok(not has_table_privilege('authenticated','public.payments','INSERT'),'no direct payment inserts');
select ok(not has_table_privilege('authenticated','public.teacher_payrolls','UPDATE'),'no direct payroll overwrites');
select * from finish();
rollback;
