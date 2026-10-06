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

create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id) values('de930000-0000-4000-8000-000000000001'),('de930000-0000-4000-8000-000000000002'),('de930000-0000-4000-8000-000000000003'),('de930000-0000-4000-8000-000000000004');
insert into profiles(id) select id from auth.users where id::text like 'de930000-%';
insert into user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join roles r where u.id in('de930000-0000-4000-8000-000000000001','de930000-0000-4000-8000-000000000002') and r.code='SUPER_ADMIN';
insert into user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join roles r where u.id in('de930000-0000-4000-8000-000000000003','de930000-0000-4000-8000-000000000004') and r.code='STUDENT';
insert into branches(id,code,name) values('de930000-0000-4000-8000-000000000011','LEARN-B','Learning branch');
insert into curriculums(id,code,name) values('de930000-0000-4000-8000-000000000012','LEARN-C','Learning curriculum');
insert into curriculum_levels(id,curriculum_id,code,name,sequence_no) values('de930000-0000-4000-8000-000000000013','de930000-0000-4000-8000-000000000012','LEARN-G1','Grade 1',1);
insert into courses(id,curriculum_id,level_id,code,name) values('de930000-0000-4000-8000-000000000014','de930000-0000-4000-8000-000000000012','de930000-0000-4000-8000-000000000013','LEARN-COURSE','Learning course');
insert into classes(id,branch_id,course_id,code,name,status) values('de930000-0000-4000-8000-000000000015','de930000-0000-4000-8000-000000000011','de930000-0000-4000-8000-000000000014','LEARN-CLASS','Learning class','ACTIVE');
insert into students(id,user_id,student_code,full_name) values('de930000-0000-4000-8000-000000000016','de930000-0000-4000-8000-000000000003','LEARN-S1','Learning student'),('de930000-0000-4000-8000-000000000017','de930000-0000-4000-8000-000000000004','LEARN-S2','Other student');
select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
insert into enrollments(id,student_id,class_id,started_at,enrolled_at) values('de930000-0000-4000-8000-000000000018','de930000-0000-4000-8000-000000000016','de930000-0000-4000-8000-000000000015',current_date-1,current_date-1);
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select create_learning_version('de930000-0000-4000-8000-000000000013',1,'Synthetic foundation lesson','{"modules":[{"code":"TEST.01","title":"Synthetic module","lessons":[{"code":"TEST.01.L1","title":"Synthetic lesson","blocks":[{"type":"TEXT","text":"Synthetic test content, not published curriculum."}]}]}]}','Local synthetic fixture')$$,'Create versioned hierarchy');
select set_config('test.learning_version',(select id::text from learning_versions where level_id='de930000-0000-4000-8000-000000000013'),true);
select lives_ok($$select grant_learning_access('de930000-0000-4000-8000-000000000018','de930000-0000-4000-8000-000000000013',now()-interval '1 day',now()+interval '1 day','Synthetic grant')$$,'Explicit enrollment grant');
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000003',true);
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Draft payload hidden from enrolled learner');
select throws_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','COMPLETE_LESSON')$$,'P0001','Learning content unavailable','Cannot complete draft');
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000001',true);
select lives_ok($$select transition_learning_version(current_setting('test.learning_version')::uuid,'SUBMIT','Ready for review')$$,'Submit draft');
select throws_ok($$select transition_learning_version(current_setting('test.learning_version')::uuid,'APPROVE','Self review')$$,'P0001','Independent content reviewer required','Author cannot self approve');
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000002',true);
select lives_ok($$select transition_learning_version(current_setting('test.learning_version')::uuid,'APPROVE','Original synthetic material reviewed')$$,'Independent review');
select lives_ok($$select transition_learning_version(current_setting('test.learning_version')::uuid,'PUBLISH','Approved synthetic release')$$,'Publish');
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000003',true);
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),1::bigint,'Eligible learner sees published content');
reset role;
insert into enrollment_pauses(enrollment_id,starts_on,ends_on,reason,created_by) values('de930000-0000-4000-8000-000000000018',(now() at time zone 'Asia/Ho_Chi_Minh')::date,(now() at time zone 'Asia/Ho_Chi_Minh')::date,'Synthetic pause','de930000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Paused enrollment blocks delivery despite live grant');
reset role;
update enrollment_pauses set status='CANCELLED',cancelled_at=now(),cancelled_by='de930000-0000-4000-8000-000000000001',cancel_reason='Synthetic resume' where enrollment_id='de930000-0000-4000-8000-000000000018';
update enrollments set ended_at=current_date-1 where id='de930000-0000-4000-8000-000000000018';
set local role authenticated;
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Ended enrollment blocks delivery despite live grant');
reset role;
update enrollments set ended_at=null where id='de930000-0000-4000-8000-000000000018';
update user_roles set valid_until=now()-interval '1 second' where user_id='de930000-0000-4000-8000-000000000003';
set local role authenticated;
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Expired role blocks delivery');
reset role;
update user_roles set valid_until=null where user_id='de930000-0000-4000-8000-000000000003';
set local role authenticated;
reset role;
update classes set end_date=current_date-1 where id='de930000-0000-4000-8000-000000000015';
set local role authenticated;
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Course delivery expiry denies content despite live grant');
reset role;
update classes set end_date=null where id='de930000-0000-4000-8000-000000000015';
update curriculums set status='INACTIVE' where id='de930000-0000-4000-8000-000000000012';
set local role authenticated;
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Inactive curriculum denies delivery');
reset role;
update curriculums set status='ACTIVE' where id='de930000-0000-4000-8000-000000000012';
set local role authenticated;
select lives_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','COMPLETE_LESSON')$$,'Complete lesson');
select lives_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','COMPLETE_LESSON')$$,'Completion retry');
select is((select count(*) from learning_lesson_progress),1::bigint,'One completion');
select lives_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','PRACTICE','de930000-0000-4000-8000-000000000030','{"answer":"synthetic"}')$$,'Practice evidence recorded');
select lives_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','PRACTICE','de930000-0000-4000-8000-000000000030','{"answer":"synthetic"}')$$,'Practice retry');
select is((select count(*) from learning_practice_attempts),1::bigint,'One attempt');
select is((select status from learning_practice_attempts where id='de930000-0000-4000-8000-000000000030'),'RECORDED_UNGRADED','Foundation never invents scores');
select throws_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','FINAL')$$,'P0001','Unsupported learning activity','Final assessment not enabled without policy engine');
select throws_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','PRACTICE','de930000-0000-4000-8000-000000000030','{"answer":"changed"}')$$,'P0001','Practice request mismatch','History not overwritten by retry');
select throws_ok($$insert into learning_lesson_progress(student_id,version_id,lesson_code) values('de930000-0000-4000-8000-000000000017',current_setting('test.learning_version')::uuid,'FORGED')$$,'42501',null,'Direct progress forgery denied');
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000004',true);
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Unrelated student content denied');
select is((select count(*) from learning_lesson_progress),0::bigint,'Unrelated student history denied');
select throws_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','COMPLETE_LESSON')$$,'P0001','Learning access denied or expired','Unenrolled learner cannot submit');
reset role;
select throws_ok($$update learning_versions set content='{}' where id=current_setting('test.learning_version')::uuid$$,'P0001','Create a new learning version','Published content immutable even to privileged update');
update learning_access_grants set valid_until=now()-interval '1 second' where enrollment_id='de930000-0000-4000-8000-000000000018';
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Expired membership denies protected payload');
select is((select count(*) from learning_practice_attempts),1::bigint,'Expired membership preserves own evidence');
select throws_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','COMPLETE_LESSON')$$,'P0001','Learning access denied or expired','Expiry blocks writes too');
reset role;
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000001',true);
update profiles set status='INACTIVE' where id='de930000-0000-4000-8000-000000000003';
select set_config('request.jwt.claim.sub','de930000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*) from learning_practice_attempts),0::bigint,'Inactive account denies history');
select ok(not has_function_privilege('anon','public.record_learning_activity(uuid,text,text,uuid,jsonb)','EXECUTE'),'Anonymous mutation denied');
select ok(not has_table_privilege('service_role','public.learning_versions','UPDATE'),'Service client cannot bypass immutable version workflow');
reset role;
select is((select count(*) from student_level_progress where enrollment_id in(select id from student_curriculum_enrollments where student_id='de930000-0000-4000-8000-000000000016')),0::bigint,'No academic progress fabricated');
select * from finish();
rollback;
