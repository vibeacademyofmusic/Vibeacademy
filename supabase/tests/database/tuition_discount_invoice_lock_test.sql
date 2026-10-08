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

select plan(4);


-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  'c1000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-BRANCH',
  'Discount Lock Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  'c2000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-CURRICULUM',
  'Discount Lock Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  'c3000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-G1',
  'Discount Lock Grade 1',
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
  'c4000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-COURSE',
  'Discount Lock Course'
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
  'c5000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'c4000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-CLASS',
  'Discount Lock Class',
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
values (
  'c6000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-STUDENT',
  'c1000000-0000-0000-0000-000000000001',
  'Discount Lock Student'
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
values (
  'c7000000-0000-0000-0000-000000000001',
  'c6000000-0000-0000-0000-000000000001',
  'c5000000-0000-0000-0000-000000000001',
  '2026-08-20',
  '2026-09-01',
  'ACTIVE'
);


insert into public.enrollment_tuition (
  id,
  enrollment_id,
  tuition_plan_id,
  starts_on,
  discount_type,
  discount_value,
  discount_name
)
values (
  'c8000000-0000-0000-0000-000000000001',
  'c7000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  'NONE',
  0,
  null
);


insert into auth.users (
  id
)
values (
  'cf000000-0000-0000-0000-000000000001'
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
insert into public.profiles(id, status) values ('cf000000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (
  user_id,
  role_id
)
select
  'cf000000-0000-0000-0000-000000000001',
  role.id
from public.roles
as role
where role.code = 'SUPER_ADMIN'
on conflict do nothing;


select set_config(
  'request.jwt.claim.sub',
  'cf000000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;


-- =========================================================
-- 1. DISCOUNT MAY CHANGE BEFORE INVOICE
-- =========================================================

select lives_ok(
  $$
    update public.enrollment_tuition
    set
      discount_type = 'PERCENT',
      discount_value = 10,
      discount_name = 'Early Payment'
    where id =
      'c8000000-0000-0000-0000-000000000001'
  $$,
  'discount may change before invoice creation'
);


-- =========================================================
-- CREATE INVOICE
-- =========================================================

select public.create_tuition_invoice(
  'c8000000-0000-0000-0000-000000000001',
  null
);


-- =========================================================
-- 2. DISCOUNT CANNOT CHANGE AFTER INVOICE
-- =========================================================

select throws_ok(
  $$
    update public.enrollment_tuition
    set
      discount_type = 'FIXED',
      discount_value = 100000,
      discount_name = 'Manual Adjustment'
    where id =
      'c8000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Tuition discount cannot change after invoice creation',
  'discount is locked after invoice creation'
);


-- =========================================================
-- 3. EFFECTIVE END MAY STILL CHANGE
-- =========================================================

select lives_ok(
  $$
    update public.enrollment_tuition
    set effective_ends_on =
      effective_ends_on + 5
    where id =
      'c8000000-0000-0000-0000-000000000001'
  $$,
  'pause-style effective end update remains allowed'
);


-- =========================================================
-- 4. NO-OP DISCOUNT UPDATE REMAINS VALID
-- =========================================================

select lives_ok(
  $$
    update public.enrollment_tuition
    set
      discount_type = discount_type,
      discount_value = discount_value,
      discount_name = discount_name
    where id =
      'c8000000-0000-0000-0000-000000000001'
  $$,
  'unchanged discount values remain valid after invoice creation'
);


select * from finish();

rollback;
