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

select no_plan();


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
  (now() at time zone 'Asia/Ho_Chi_Minh')::date-60,
  (now() at time zone 'Asia/Ho_Chi_Minh')::date-40,
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
  (now() at time zone 'Asia/Ho_Chi_Minh')::date-40,
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





create temp table reminder_cases(label text,term uuid);
insert into reminder_cases values('current3','c8000000-0000-0000-0000-000000000001');
do $$ declare label text; sid uuid; eid uuid; tid uuid; start_date date; months integer; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
 foreach label in array array['current12','future','past','cancelled','completed'] loop
  sid:=gen_random_uuid(); eid:=gen_random_uuid(); tid:=gen_random_uuid();
  start_date:=case label when 'future' then today+10 when 'past' then today-500 when 'current12' then (today-interval '9 months')::date else today-20 end;
  months:=case when label='current12' then 12 else 3 end;
  insert into students(id,student_code,full_name,default_branch_id) values(sid,'REM-'||label,'Reminder '||label,'c1000000-0000-0000-0000-000000000001');
 perform pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
  insert into enrollments(id,student_id,class_id,enrolled_at,started_at,status) values(eid,sid,'c5000000-0000-0000-0000-000000000001',start_date,start_date,'ACTIVE');
  insert into enrollment_tuition(id,enrollment_id,tuition_plan_id,starts_on,status)
  select tid,eid,id,start_date,case label when 'cancelled' then 'CANCELLED' when 'completed' then 'COMPLETED' when 'future' then 'SCHEDULED' else 'ACTIVE' end from tuition_plans where duration_months=months limit 1;
  insert into reminder_cases values(label,tid);
 end loop;
end $$;
grant select on reminder_cases to authenticated;
set local role authenticated;
select is((select window_start from tuition_reminder_window('2026-01-31',3)),date '2026-03-31','3 month schedule opens on month 3 anniversary');
select is((select window_end from tuition_reminder_window('2026-01-31',3)),date '2026-04-29','3 month stays in deadline through the term end');
select is((select window_start from tuition_reminder_window('2024-01-31',3)),date '2024-03-31','leap year month 3 anniversary');
select is((select window_start from tuition_reminder_window('2025-12-31',3)),date '2026-02-28','month 3 clamps to month end');
select is((select window_start from tuition_balance_due_window('2026-01-31',3)),date '2026-02-28','3 month 50 percent balance due in week 1 of month 2');
select is((select window_end from tuition_balance_due_window('2026-01-31',3)),date '2026-03-06','3 month balance week is exactly 7 days');
select is((select window_start from tuition_balance_due_window('2024-01-31',3)),date '2024-02-29','leap year month 2 balance week');
select is((select window_start from tuition_balance_due_window('2026-01-15')),date '2026-04-05','annual 50 percent balance due in week 4 of month 3');
select is((select window_end from tuition_balance_due_window('2026-01-15')),date '2026-04-21','balance stays due through week 1 of month 4');
select is((select window_start from tuition_reminder_window('2026-01-15',12)),date '2026-10-15','12 month reminder starts month 10');
select is((select window_end from tuition_reminder_window('2026-01-15',12)),date '2026-11-14','month 10 inclusive end');
select is((select count(*) from tuition_reminder_window('2026-01-15',6)),0::bigint,'unsupported duration excluded');
select lives_ok($$select generate_tuition_reminders()$$,'first generation');
select is((select count(*) from tuition_reminders where enrollment_tuition_id in(select term from reminder_cases)),2::bigint,'only current eligible periods');
select lives_ok($$select generate_tuition_reminders()$$,'second generation');
select is((select count(*) from tuition_reminders where enrollment_tuition_id in(select term from reminder_cases)),2::bigint,'idempotent for 3 and 12 months');
select is((select count(*) from tuition_reminders where enrollment_tuition_id in(select term from reminder_cases where label in('future','past','cancelled','completed'))),0::bigint,'future expired cancelled completed excluded');
select is((select student_id from tuition_reminder_operations where enrollment_tuition_id='c8000000-0000-0000-0000-000000000001'),'c6000000-0000-0000-0000-000000000001'::uuid,'student linkage');
select is((select branch_id_snapshot from tuition_reminder_operations where enrollment_tuition_id='c8000000-0000-0000-0000-000000000001'),'c1000000-0000-0000-0000-000000000001'::uuid,'branch linkage');
select is((timestamptz '2026-09-30 17:00:00+00' at time zone 'Asia/Ho_Chi_Minh')::date,date '2026-10-01','Vietnam midnight boundary');
select is((timestamptz '2026-09-30 16:59:59+00' at time zone 'Asia/Ho_Chi_Minh')::date,date '2026-09-30','before Vietnam midnight');
select throws_ok($$select resolve_tuition_reminder((select id from tuition_reminders where enrollment_tuition_id='c8000000-0000-0000-0000-000000000001'),'SENT','fake')$$,'P0001','Invalid reminder resolution','no fabricated sent');
select throws_ok($$select resolve_tuition_reminder((select id from tuition_reminders where enrollment_tuition_id='c8000000-0000-0000-0000-000000000001'),'SKIPPED','')$$,'P0001','Invalid reminder resolution','reason required');
select lives_ok($$select resolve_tuition_reminder((select id from tuition_reminders where enrollment_tuition_id='c8000000-0000-0000-0000-000000000001'),'SKIPPED','Already discussed')$$,'skip pending');
select ok((select marked_by=auth.uid() and marked_at is not null from tuition_reminders where enrollment_tuition_id='c8000000-0000-0000-0000-000000000001'),'skip audit recorded');
select throws_ok($$select resolve_tuition_reminder((select id from tuition_reminders where enrollment_tuition_id='c8000000-0000-0000-0000-000000000001'),'CANCELLED','retry')$$,'P0001','Pending reminder not found','terminal history cannot transition again');

reset role;
insert into auth.users(id) values('cf000000-0000-0000-0000-000000000002');
insert into profiles(id) values('cf000000-0000-0000-0000-000000000002');
insert into user_roles(user_id,role_id) select 'cf000000-0000-0000-0000-000000000002',id from roles where code='STUDENT';
update students set user_id='cf000000-0000-0000-0000-000000000002' where student_code='REM-current12';
set local role authenticated;
select is(enqueue_notification_event('TUITION_REMINDER',(select id from tuition_reminders where enrollment_tuition_id=(select term from reminder_cases where label='current12'))),1,'Month 10 notification uses canonical reminder');
select is(enqueue_notification_event('TUITION_REMINDER',(select id from tuition_reminders where enrollment_tuition_id=(select term from reminder_cases where label='current12'))),0,'Reminder job not duplicated');
select lives_ok($$update enrollment_tuition set status='CANCELLED' where id=(select term from reminder_cases where label='current12')$$,'cancel source term');
select throws_ok($$select deliver_in_app_notification(id) from notification_jobs where recipient_id='cf000000-0000-0000-0000-000000000002'$$,'P0001','Notification source no longer eligible','Cancelled term cannot deliver stale notice');
select is((select status from tuition_reminders where enrollment_tuition_id=(select term from reminder_cases where label='current12')),'CANCELLED','source cancellation invalidates pending');
select lives_ok($$select generate_tuition_reminders()$$,'generation after resolution');
select is((select count(*) from tuition_reminders where enrollment_tuition_id in(select term from reminder_cases)),2::bigint,'resolved events not regenerated');
select throws_ok($$update tuition_reminders set status='SENT'$$,'42501',null,'direct update prohibited');
select throws_ok($$insert into tuition_reminders(enrollment_tuition_id,window_start,window_end) values('c8000000-0000-0000-0000-000000000001',current_date,current_date)$$,'42501',null,'direct insert prohibited');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
select throws_ok($$select generate_tuition_reminders()$$,'P0001','SUPER_ADMIN role required','generate admin only');
select is((select count(*) from tuition_reminders),0::bigint,'non admin cannot read reminders');
select * from finish(); rollback;
