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
insert into auth.users(id) values('de960000-0000-4000-8000-000000000001'),('de960000-0000-4000-8000-000000000002'),('de960000-0000-4000-8000-000000000003'),('de960000-0000-4000-8000-000000000004');
insert into profiles(id) select id from auth.users where id::text like 'de960000-%';
insert into user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join roles r where u.id in('de960000-0000-4000-8000-000000000001','de960000-0000-4000-8000-000000000002') and r.code='SUPER_ADMIN';
insert into user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join roles r where u.id in('de960000-0000-4000-8000-000000000003','de960000-0000-4000-8000-000000000004') and r.code='STUDENT';
insert into branches(id,code,name) values('de960000-0000-4000-8000-000000000011','REGRADE-B','Learning branch');
insert into curriculums(id,code,name) values('de960000-0000-4000-8000-000000000012','REGRADE-C','Learning curriculum');
insert into curriculum_levels(id,curriculum_id,code,name,sequence_no) values('de960000-0000-4000-8000-000000000013','de960000-0000-4000-8000-000000000012','REGRADE-G1','Grade 1',1);
insert into courses(id,curriculum_id,level_id,code,name) values('de960000-0000-4000-8000-000000000014','de960000-0000-4000-8000-000000000012','de960000-0000-4000-8000-000000000013','REGRADE-COURSE','Learning course');
insert into classes(id,branch_id,course_id,code,name,status) values('de960000-0000-4000-8000-000000000015','de960000-0000-4000-8000-000000000011','de960000-0000-4000-8000-000000000014','REGRADE-CLASS','Learning class','ACTIVE');
insert into students(id,user_id,student_code,full_name) values('de960000-0000-4000-8000-000000000016','de960000-0000-4000-8000-000000000003','REGRADE-S1','Learning student'),('de960000-0000-4000-8000-000000000017','de960000-0000-4000-8000-000000000004','REGRADE-S2','Other student');
select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
insert into enrollments(id,student_id,class_id,started_at,enrolled_at) values('de960000-0000-4000-8000-000000000018','de960000-0000-4000-8000-000000000016','de960000-0000-4000-8000-000000000015',current_date-1,current_date-1);
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select create_learning_version('de960000-0000-4000-8000-000000000013',1,'Synthetic foundation lesson','{"modules":[{"code":"TEST.01","title":"Synthetic module","lessons":[{"code":"TEST.01.L1","title":"Synthetic lesson","blocks":[{"type":"TEXT","text":"Synthetic test content, not published curriculum."}]}]}]}','Local synthetic fixture')$$,'Create versioned hierarchy');
select set_config('test.learning_version',(select id::text from learning_versions where level_id='de960000-0000-4000-8000-000000000013'),true);
select lives_ok($$select grant_learning_access('de960000-0000-4000-8000-000000000018','de960000-0000-4000-8000-000000000013',now()-interval '1 day',now()+interval '1 day','Synthetic grant')$$,'Explicit enrollment grant');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000003',true);
select is((select count(*) from learning_versions where id=current_setting('test.learning_version')::uuid),0::bigint,'Draft payload hidden from enrolled learner');
select throws_ok($$select record_learning_activity(current_setting('test.learning_version')::uuid,'TEST.01.L1','COMPLETE_LESSON')$$,'P0001','Learning content unavailable','Cannot complete draft');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000001',true);
select lives_ok($$select transition_learning_version(current_setting('test.learning_version')::uuid,'SUBMIT','Ready for review')$$,'Submit draft');
select throws_ok($$select transition_learning_version(current_setting('test.learning_version')::uuid,'APPROVE','Self review')$$,'P0001','Independent content reviewer required','Author cannot self approve');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000002',true);
select lives_ok($$select transition_learning_version(current_setting('test.learning_version')::uuid,'APPROVE','Original synthetic material reviewed')$$,'Independent review');
select lives_ok($$select transition_learning_version(current_setting('test.learning_version')::uuid,'PUBLISH','Approved synthetic release')$$,'Publish');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000001',true);
select set_config('test.policy',create_learning_assessment(current_setting('test.learning_version')::uuid,'Synthetic mixed final','FINAL',70,3,86400,'[{"code":"Q1","prompt":"Synthetic objective","type":"TRUE_FALSE","mode":"AUTO","points":1,"key":true},{"code":"Q2","prompt":"Synthetic manual","type":"MANUAL_REVIEW","mode":"MANUAL","points":3,"rubric":"Synthetic rubric only"}]')::text,true);
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000002',true);
select approve_learning_assessment(current_setting('test.policy')::uuid,'Independent synthetic review');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000003',true);
select start_learning_assessment(current_setting('test.policy')::uuid,'de960000-0000-4000-8000-000000000030',true);
select submit_learning_assessment('de960000-0000-4000-8000-000000000030','{"Q1":true,"Q2":"Synthetic response"}');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000002',true);
select review_learning_assessment('de960000-0000-4000-8000-000000000030','{"Q2":3}','Initial synthetic full marks');
select is((select score from learning_effective_assessment_results where id='de960000-0000-4000-8000-000000000030'),100::numeric,'Initial effective result matches immutable attempt');
select throws_ok($$select regrade_learning_assessment('de960000-0000-4000-8000-000000000030','de960000-0000-4000-8000-000000000040',null,'{"Q2":0}','')$$,'P0001','Regrade evidence required','Regrade reason mandatory');
select throws_ok($$select regrade_learning_assessment('de960000-0000-4000-8000-000000000030','de960000-0000-4000-8000-000000000040',null,'{"Q1":0,"Q2":0}','Change auto marks')$$,'P0001','Unknown manual question','Regrade cannot override original objective score');
select lives_ok($$select regrade_learning_assessment('de960000-0000-4000-8000-000000000030','de960000-0000-4000-8000-000000000040',null,'{"Q2":0}','Correct synthetic manual scoring error')$$,'Append regrade event');
select lives_ok($$select regrade_learning_assessment('de960000-0000-4000-8000-000000000030','de960000-0000-4000-8000-000000000040',null,'{"Q2":0}','Correct synthetic manual scoring error')$$,'Regrade retry idempotent');
select is((select count(*) from learning_assessment_regrades where attempt_id='de960000-0000-4000-8000-000000000030'),1::bigint,'Retry does not duplicate correction');
select is((select score from learning_assessment_attempts where id='de960000-0000-4000-8000-000000000030'),100::numeric,'Original score remains unchanged');
select is((select score from learning_effective_assessment_results where id='de960000-0000-4000-8000-000000000030'),25::numeric,'Effective weighted score reflects correction');
select is((select proposed_outcome from learning_final_shadow_outcomes where attempt_id='de960000-0000-4000-8000-000000000030'),'NOT_PASSED','Corrected failure withdraws effective shadow PASS');
select is((select count(*) from learning_academic_shadow where attempt_id='de960000-0000-4000-8000-000000000030'),1::bigint,'Original shadow evidence is retained');
select is((select count(*) from learning_audit where entity_id='de960000-0000-4000-8000-000000000040' and event='ASSESSMENT_REGRADED'),1::bigint,'Correction audited once');
select throws_ok($$select regrade_learning_assessment('de960000-0000-4000-8000-000000000030','de960000-0000-4000-8000-000000000041',null,'{"Q2":2}','Stale reviewer')$$,'P0001','Result changed; reload before regrading','Optimistic revision guard prevents lost review');
select throws_ok($$select regrade_learning_assessment('de960000-0000-4000-8000-000000000030','de960000-0000-4000-8000-000000000040',null,'{"Q2":2}','Correct synthetic manual scoring error')$$,'P0001','Regrade request mismatch','Request id cannot change marks');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000003',true);
select is((select score from learning_assessment_history() where id='de960000-0000-4000-8000-000000000030'),25::numeric,'Student history uses effective score');
select throws_ok($$select regrade_learning_assessment('de960000-0000-4000-8000-000000000030','de960000-0000-4000-8000-000000000041','de960000-0000-4000-8000-000000000040','{"Q2":3}','Self correction')$$,'P0001','Unauthorized','Student cannot regrade');
select throws_ok($$select start_learning_assessment(current_setting('test.policy')::uuid,'de960000-0000-4000-8000-000000000031',true)$$,'P0001','Assessment attempt limit or cooldown reached','Cooldown reads corrected failed outcome');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000004',true);
select is((select count(*) from learning_assessment_regrades),0::bigint,'Cross-student correction evidence denied');
select is((select count(*) from learning_assessment_history()),0::bigint,'Cross-student effective history denied');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000002',true);
select lives_ok($$select regrade_learning_assessment('de960000-0000-4000-8000-000000000030','de960000-0000-4000-8000-000000000041','de960000-0000-4000-8000-000000000040','{"Q2":2}','Second synthetic correction with evidence')$$,'Second correction explicitly links first');
select is((select prior_score from learning_assessment_regrades where id='de960000-0000-4000-8000-000000000041'),25::numeric,'Second correction retains preceding effective score');
select is((select proposed_outcome from learning_final_shadow_outcomes where attempt_id='de960000-0000-4000-8000-000000000030'),'PASS','Effective shadow recalculated without live Academic mutation');
select set_config('request.jwt.claim.sub','de960000-0000-4000-8000-000000000003',true);
select lives_ok($$select start_learning_assessment(current_setting('test.policy')::uuid,'de960000-0000-4000-8000-000000000031',true)$$,'Corrected PASS removes erroneous failed cooldown');
reset role;
select throws_ok($$update learning_assessment_regrades set corrected_score=100 where id='de960000-0000-4000-8000-000000000040'$$,'P0001','Learning history is immutable','Even privileged updates cannot rewrite correction events');
update learning_access_grants set valid_until=now()-interval '1 second' where enrollment_id='de960000-0000-4000-8000-000000000018';
set local role authenticated;
select is((select count(*) from learning_effective_assessment_results),0::bigint,'Expiry still hides question/answer view');
select is((select score from learning_assessment_history() where id='de960000-0000-4000-8000-000000000030'),75::numeric,'Expiry preserves corrected outcome summary');
select ok(not has_table_privilege('service_role','public.learning_assessment_regrades','INSERT'),'No service bypass for regrades');
select ok(not has_function_privilege('anon','public.regrade_learning_assessment(uuid,uuid,uuid,jsonb,text)','EXECUTE'),'Anonymous regrade denied');
reset role;
select is((select count(*) from student_level_progress where enrollment_id in(select id from student_curriculum_enrollments where student_id='de960000-0000-4000-8000-000000000016')),0::bigint,'Regrades never mutate real Academic progression');
select * from finish();
rollback;
