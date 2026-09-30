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

select plan(19);


-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  '1a000000-0000-0000-0000-000000000001',
  'TUITION-TEST-BRANCH',
  'Tuition Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  '2a000000-0000-0000-0000-000000000001',
  'TUITION-TEST-CURRICULUM',
  'Tuition Test Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '3a000000-0000-0000-0000-000000000001',
  '2a000000-0000-0000-0000-000000000001',
  'TUITION-G1',
  'Tuition Grade 1',
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
  '4a000000-0000-0000-0000-000000000001',
  '2a000000-0000-0000-0000-000000000001',
  '3a000000-0000-0000-0000-000000000001',
  'TUITION-COURSE',
  'Tuition Test Course'
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
  '5a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-000000000001',
  '4a000000-0000-0000-0000-000000000001',
  'TUITION-CLASS',
  'Tuition Test Class',
  'GROUP',
  5,
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
    '6a000000-0000-0000-0000-000000000001',
    'TUITION-STUDENT-A',
    '1a000000-0000-0000-0000-000000000001',
    'Tuition Student A'
  ),
  (
    '6a000000-0000-0000-0000-000000000002',
    'TUITION-STUDENT-B',
    '1a000000-0000-0000-0000-000000000001',
    'Tuition Student B'
  ),
  (
    '6a000000-0000-0000-0000-000000000003',
    'TUITION-STUDENT-C',
    '1a000000-0000-0000-0000-000000000001',
    'Tuition Student C'
  );


select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
select throws_ok(
  $$
    insert into public.enrollments (
      id, student_id, class_id, enrolled_at, started_at, status
    )
    values (
      '7a000000-0000-0000-0000-000000000002',
      '6a000000-0000-0000-0000-000000000002',
      '5a000000-0000-0000-0000-000000000001',
      '2026-09-01',
      null,
      'ACTIVE'
    )
  $$,
  'P0001',
  'PLACEMENT_START_DENIED',
  'enrollment without a start date is denied'
);
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
    '7a000000-0000-0000-0000-000000000001',
    '6a000000-0000-0000-0000-000000000001',
    '5a000000-0000-0000-0000-000000000001',
    '2026-08-20',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '7a000000-0000-0000-0000-000000000003',
    '6a000000-0000-0000-0000-000000000003',
    '5a000000-0000-0000-0000-000000000001',
    '2026-09-01',
    '2026-09-15',
    'ACTIVE'
  );


-- =========================================================
-- 1–2. DEFAULT PLANS
-- =========================================================

select is(
  (
    select duration_months
    from public.tuition_plans
    where code = 'VIBE_3_MONTHS'
  ),
  3,
  'VIBE 3 MONTHS has a three-month duration'
);


select is(
  (
    select duration_months
    from public.tuition_plans
    where code = 'VIBE_12_MONTHS'
  ),
  12,
  'VIBE 12 MONTHS has a twelve-month duration'
);


-- =========================================================
-- 3. NO started_at = NO TUITION
-- =========================================================

select is(
  (
    select count(*)
    from public.enrollments
    where id = '7a000000-0000-0000-0000-000000000002'
  ),
  0::bigint,
  'rejects tuition when enrollment started_at is null'
);


-- =========================================================
-- 4. FIRST TERM MUST START EXACTLY ON started_at
-- =========================================================

select throws_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000005',
      '7a000000-0000-0000-0000-000000000003',
      'a1000000-0000-0000-0000-000000000012',
      '2026-09-16',
      12000000
    )
  $$,
  'P0001',
  'The first tuition term must start on the enrollment study start date',
  'rejects first tuition term that starts after started_at'
);


-- =========================================================
-- 5. CREATE FIRST 3-MONTH TERM
-- =========================================================

select lives_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000001',
      '7a000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000003',
      '2026-09-01',
      3000000
    )
  $$,
  'creates first tuition term on enrollment started_at'
);


-- =========================================================
-- 6. TUITION CAN NEVER START BEFORE started_at
-- =========================================================

select throws_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000007',
      '7a000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000003',
      '2026-08-31',
      3000000
    )
  $$,
  'P0001',
  'Tuition cannot start before the enrollment study start date',
  'rejects any tuition term before enrollment started_at'
);


-- =========================================================
-- 7–8. DATE CALCULATION
-- =========================================================

select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  '2026-11-30'::date,
  'three-month tuition term calculates correct base end date'
);


select is(
  (
    select effective_ends_on
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  '2026-11-30'::date,
  'effective end initially equals base end'
);


-- =========================================================
-- 9. PLAN / BRANCH / PRICE SNAPSHOT
-- =========================================================

select ok(
  (
    select
      plan_code_snapshot = 'VIBE_3_MONTHS'
      and plan_name_snapshot = 'VIBE 3 MONTHS'
      and duration_months_snapshot = 3
      and branch_code_snapshot = 'TUITION-TEST-BRANCH'
      and list_price = 4500000
      and discount_type = 'NONE'
      and discount_amount = 0
      and amount = 4500000
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  'tuition term snapshots plan, branch, list price, and final amount'
);


-- Change master plan after historical term already exists.

update public.tuition_plans
set name = 'VIBE 3 MONTHS UPDATED'
where id = 'a1000000-0000-0000-0000-000000000003';


-- =========================================================
-- 10. HISTORICAL SNAPSHOT MUST NOT CHANGE
-- =========================================================

select is(
  (
    select plan_name_snapshot
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  'VIBE 3 MONTHS',
  'changing tuition plan does not rewrite historical snapshot'
);


-- =========================================================
-- 11. OVERLAPPING TERM MUST BE BLOCKED
-- =========================================================

select throws_ok(
  $$
    do $block$
    begin
      begin
        insert into public.enrollment_tuition (
          id,
          enrollment_id,
          tuition_plan_id,
          starts_on,
          amount
        )
        values (
          'b1000000-0000-0000-0000-000000000006',
          '7a000000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000003',
          '2026-11-30',
          3000000
        );
      exception
        when exclusion_violation then
          raise exception 'TUITION_OVERLAP_BLOCKED';
      end;
    end
    $block$;
  $$,
  'P0001',
  'TUITION_OVERLAP_BLOCKED',
  'rejects overlapping tuition terms for the same enrollment'
);


-- =========================================================
-- 12. CONTIGUOUS RENEWAL IS ALLOWED
-- =========================================================

select lives_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000002',
      '7a000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000003',
      '2026-12-01',
      3200000
    )
  $$,
  'allows renewal to begin the day after the previous term ends'
);


-- =========================================================
-- 13. RENEWAL DATE CALCULATION
-- =========================================================

select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000002'
  ),
  '2027-02-28'::date,
  'renewal calculates its own contractual end date'
);


-- =========================================================
-- 14. CORE HISTORICAL FIELDS ARE IMMUTABLE
-- =========================================================

select throws_ok(
  $$
    update public.enrollment_tuition
    set starts_on = '2026-09-02'
    where id = 'b1000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Core tuition term snapshots are immutable',
  'rejects rewriting core tuition history'
);


-- =========================================================
-- 15. EFFECTIVE END CANNOT SHRINK BELOW BASE END
-- =========================================================

select throws_ok(
  $$
    update public.enrollment_tuition
    set effective_ends_on = '2026-11-29'
    where id = 'b1000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Effective tuition end cannot be earlier than the base tuition end',
  'rejects shortening effective tuition entitlement below base term'
);


-- =========================================================
-- 16. FINANCIAL HISTORY CANNOT BE DELETED
-- =========================================================

select throws_ok(
  $$
    delete from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Tuition terms cannot be deleted; cancel the term instead',
  'rejects deletion of tuition history'
);


-- =========================================================
-- 17–18. 12-MONTH PLAN
-- =========================================================

select lives_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000003',
      '7a000000-0000-0000-0000-000000000003',
      'a1000000-0000-0000-0000-000000000012',
      '2026-09-15',
      12000000
    )
  $$,
  'creates twelve-month tuition term on enrollment started_at'
);


select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000003'
  ),
  '2027-09-14'::date,
  'twelve-month tuition term calculates correct base end date'
);


select * from finish();

rollback;