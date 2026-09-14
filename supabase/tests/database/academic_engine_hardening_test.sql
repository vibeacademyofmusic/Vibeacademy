begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Deterministic identifiers and transaction-scoped fixtures only.
create function pg_temp.aid(text) returns uuid language sql immutable as $$ select md5('academic-hardening-' || $1)::uuid $$;
insert into public.curriculums(id,code,name) values (pg_temp.aid('c'),'HARDEN-C','Hardening'),(pg_temp.aid('other'),'HARDEN-OTHER','Other');
insert into public.students(id,student_code,full_name) select pg_temp.aid(s), 'HARDEN-'||s,s from unnest(array['A','B','C','D','E']) s;
insert into public.curriculum_levels(id,curriculum_id,code,name,sequence_no)
select pg_temp.aid('l'||n),pg_temp.aid('c'),'L'||n,'Grade '||n,n from generate_series(1,4) n;
insert into public.curriculum_subjects(id,level_id,family_code,code,name,completion_rule)
select pg_temp.aid('s'||n),pg_temp.aid('l'||n),'SKILL','S'||n,'Skill','ALL_REQUIRED_COMPONENTS' from generate_series(1,4) n;
insert into public.curriculum_subject_components(id,subject_id,code,name,is_required)
select pg_temp.aid('req'||n),pg_temp.aid('s'||n),'REQ','Required',true from generate_series(1,4) n;
insert into public.curriculum_subject_components(id,subject_id,code,name,is_required)
values(pg_temp.aid('opt'),pg_temp.aid('s1'),'OPT','Optional',false);
insert into public.curriculum_subject_components(id,subject_id,code,name,status)
values(pg_temp.aid('inactive'),pg_temp.aid('s1'),'INACTIVE','Inactive','INACTIVE');
insert into public.curriculum_subjects(id,level_id,family_code,code,name,completion_rule,is_required)
values(pg_temp.aid('opts'),pg_temp.aid('l1'),'OPTIONAL','OPT','Optional subject','DIRECT_ASSESSMENT',false);
insert into public.curriculum_subjects(id,level_id,family_code,code,name,completion_rule,status)
values(pg_temp.aid('inactives'),pg_temp.aid('l1'),'INACTIVE','INACTIVE','Inactive subject','DIRECT_ASSESSMENT','INACTIVE');
create function pg_temp.enr(text) returns uuid language sql as $$ select id from public.student_curriculum_enrollments where student_id=pg_temp.aid($1) and curriculum_id=pg_temp.aid('c') $$;
create function pg_temp.lp(text,int) returns uuid language sql as $$ select id from public.student_level_progress where enrollment_id=pg_temp.enr($1) and level_id=pg_temp.aid('l'||$2) $$;
create function pg_temp.sp(text,int) returns uuid language sql as $$ select id from public.student_subject_progress where level_progress_id=pg_temp.lp($1,$2) and subject_id=pg_temp.aid('s'||$2) $$;
create function pg_temp.pass(text,int) returns void language sql as $$ update public.student_component_progress set status='PASS' where subject_progress_id=pg_temp.sp($1,$2) and component_id=pg_temp.aid('req'||$2) $$;

-- Deliberately use a session timezone whose calendar date is ahead of Vietnam.
set local timezone = 'Pacific/Kiritimati';
select lives_ok($$select public.assign_student_academic_program(pg_temp.aid('E'),pg_temp.aid('c'),pg_temp.aid('l1'),(now() at time zone 'Asia/Ho_Chi_Minh')::date+1)$$,'future assignment accepted using Vietnam date');
select lives_ok($$select public.assign_student_academic_program(pg_temp.aid('A'),pg_temp.aid('c'),pg_temp.aid('l1'),(now() at time zone 'Asia/Ho_Chi_Minh')::date)$$,'Vietnam today accepted independent of session timezone');
select lives_ok($$select public.assign_student_academic_program(pg_temp.aid('B'),pg_temp.aid('c'),pg_temp.aid('l1'),(now() at time zone 'Asia/Ho_Chi_Minh')::date)$$,'second student assigned independently');
select throws_ok($$select public.assign_student_academic_program(pg_temp.aid('A'),pg_temp.aid('c'),pg_temp.aid('l1'),current_date-1)$$,'P0001','Student already has an active enrollment in this curriculum','duplicate active enrollment rejected');
update public.student_curriculum_enrollments set status='PAUSED' where id=pg_temp.enr('B');
select throws_ok($$select public.assign_student_academic_program(pg_temp.aid('B'),pg_temp.aid('c'),pg_temp.aid('l1'),current_date-1)$$,'P0001','Student already has an active enrollment in this curriculum','duplicate paused enrollment rejected');
update public.student_curriculum_enrollments set status='ACTIVE' where id=pg_temp.enr('B');
select lives_ok($$select public.assign_student_academic_program(pg_temp.aid('C'),pg_temp.aid('c'),pg_temp.aid('l3'),current_date-1)$$,'starting at higher grade succeeds');
select is((select count(*) from public.student_level_progress where enrollment_id=pg_temp.enr('C')),1::bigint,'no lower grades required at entry');
select pg_temp.pass('A',1);
select is((select status from public.student_subject_progress where id=pg_temp.sp('A',1)),'PASS','optional/inactive component does not block subject');
select is((select status from public.student_level_progress where id=pg_temp.lp('A',1)),'COMPLETED','optional/inactive subject does not block grade');
select is((select status from public.student_level_progress where id=pg_temp.lp('A',2)),'AVAILABLE','completion unlocks next grade as available');
select is((select count(*) from public.student_level_progress where enrollment_id=pg_temp.enr('A')),2::bigint,'only immediate next grade unlocked');
select is((select status from public.student_level_progress where id=pg_temp.lp('B',1)),'IN_PROGRESS','student B is unaffected by A completion');
select throws_ok($$update public.student_level_progress set status='IN_PROGRESS' where id=pg_temp.lp('A',1)$$,'P0001','Completed academic grade cannot regress after progression','completed grade protected with successor available');
select throws_ok($$update public.student_level_progress set status='LOCKED' where id=pg_temp.lp('A',1)$$,'P0001','Completed academic grade cannot regress after progression','cannot lock completed predecessor');
select throws_ok($$update public.student_level_progress set status='AVAILABLE' where id=pg_temp.lp('A',1)$$,'P0001','Completed academic grade cannot regress after progression','cannot reopen completed predecessor');
select throws_ok($$update public.student_component_progress set status='NOT_STARTED' where subject_progress_id=pg_temp.sp('A',1) and component_id=pg_temp.aid('req1')$$,'P0001','Required academic progress cannot regress after progression','required component regression blocked');
select throws_ok($$delete from public.student_subject_progress where id=pg_temp.sp('A',1)$$,'P0001','Required academic progress cannot regress after progression','required subject deletion blocked');
select lives_ok($$update public.student_component_progress set status='NOT_PASSED' where subject_progress_id=pg_temp.sp('A',1) and component_id=pg_temp.aid('opt')$$,'optional component remains editable');
select lives_ok($$select public.start_student_academic_level(pg_temp.enr('A'),pg_temp.aid('l2'),current_date-1)$$,'start successor succeeds');
select is((select current_level_id from public.student_curriculum_enrollments where id=pg_temp.enr('A')),pg_temp.aid('l2'),'current grade follows this student');
select is((select count(*) from public.student_subject_progress where level_progress_id=pg_temp.lp('A',2)),1::bigint,'starting creates subject progress');
select is((select count(*) from public.student_component_progress where subject_progress_id=pg_temp.sp('A',2)),1::bigint,'starting creates component progress');
select throws_ok($$update public.student_level_progress set status='IN_PROGRESS' where id=pg_temp.lp('A',1)$$,'P0001','Completed academic grade cannot regress after progression','predecessor protected with successor in progress');
select throws_ok($$update public.student_subject_progress set status='IN_PROGRESS' where id=pg_temp.sp('A',1)$$,'P0001','Required academic progress cannot regress after progression','required subject cannot regress after successor start');
select throws_ok($$insert into public.student_level_progress(enrollment_id,level_id,status) values(pg_temp.enr('A'),pg_temp.aid('l3'),'IN_PROGRESS')$$,'23505',null,'direct write cannot create two in-progress grades');
-- DIRECT_ASSESSMENT ignores even required components.
update public.curriculum_subjects set completion_rule='DIRECT_ASSESSMENT' where id=pg_temp.aid('s2');
select pg_temp.pass('A',2);
select is((select status from public.student_subject_progress where id=pg_temp.sp('A',2)),'NOT_STARTED','direct assessment does not derive status from components');
update public.student_subject_progress set status='PASS' where id=pg_temp.sp('A',2);
select is((select status from public.student_level_progress where id=pg_temp.lp('A',2)),'COMPLETED','direct assessment can complete grade');
select pg_temp.pass('C',3);
select lives_ok($$select public.start_student_academic_level(pg_temp.enr('C'),pg_temp.aid('l4'),current_date-1)$$,'higher entry student advances without grades 1/2');
select pg_temp.pass('C',4);
select is((select status from public.student_curriculum_enrollments where id=pg_temp.enr('C')),'COMPLETED','final grade completes academic enrollment');
select throws_ok($$update public.student_level_progress set status='IN_PROGRESS' where id=pg_temp.lp('C',4)$$,'P0001','Completed academic grade cannot regress after progression','final grade cannot contradict completed enrollment');
-- Assignment validations and failed-primary rollback.
update public.curriculums set status='INACTIVE' where id=pg_temp.aid('c');
select throws_ok($$select public.assign_student_academic_program(pg_temp.aid('D'),pg_temp.aid('c'),pg_temp.aid('l1'),current_date-1)$$,'P0001','Curriculum does not exist or is inactive','inactive curriculum rejected');
update public.curriculums set status='ACTIVE' where id=pg_temp.aid('c');
update public.curriculum_levels set status='INACTIVE' where id=pg_temp.aid('l1');
select throws_ok($$select public.assign_student_academic_program(pg_temp.aid('D'),pg_temp.aid('c'),pg_temp.aid('l1'),current_date-1)$$,'P0001','Level does not belong to this curriculum or is inactive','inactive grade rejected');
update public.curriculum_levels set status='ACTIVE' where id=pg_temp.aid('l1');
select throws_ok($$select public.assign_student_academic_program(pg_temp.aid('D'),pg_temp.aid('other'),pg_temp.aid('l1'),current_date-1)$$,'P0001','Level does not belong to this curriculum or is inactive','grade from another curriculum rejected');
update public.curriculum_subject_components set is_required=false where id=pg_temp.aid('req3');
select throws_ok($$select public.assign_student_academic_program(pg_temp.aid('D'),pg_temp.aid('c'),pg_temp.aid('l3'),current_date-1)$$,'P0001','A required subject has no required active components','optional-only components cannot satisfy required subject');
update public.curriculum_subject_components set is_required=true where id=pg_temp.aid('req3');
insert into public.curriculum_levels(id,curriculum_id,code,name,sequence_no) values(pg_temp.aid('otherl'),pg_temp.aid('other'),'OTHER','Other',1);
select throws_ok($$select public.assign_student_academic_program(pg_temp.aid('A'),pg_temp.aid('other'),pg_temp.aid('otherl'),current_date-1,true)$$,'P0001','Selected level has no active subjects','empty grade rejected before demoting primary');
select ok((select is_primary from public.student_curriculum_enrollments where id=pg_temp.enr('A')),'failed assignment keeps old primary');
insert into public.curriculum_subjects(level_id,family_code,code,name,completion_rule) values(pg_temp.aid('otherl'),'DIRECT','OTHER','Other','DIRECT_ASSESSMENT');
select lives_ok($$select public.assign_student_academic_program(pg_temp.aid('A'),pg_temp.aid('other'),pg_temp.aid('otherl'),current_date-1,true)$$,'new primary program assigned atomically');
select is((select count(*) from public.student_curriculum_enrollments where student_id=pg_temp.aid('A') and is_primary),1::bigint,'only one primary remains');
select ok(not (select is_primary from public.student_curriculum_enrollments where id=pg_temp.enr('A')),'previous primary demoted');
-- Missing required progress must not disappear from the completion denominator.
insert into public.curriculum_subject_components(id,subject_id,code,name)
values(pg_temp.aid('missing'),pg_temp.aid('s1'),'MISSING','Required without progress');
select pg_temp.pass('B',1);
select isnt((select status from public.student_subject_progress where id=pg_temp.sp('B',1)),'PASS','missing required component progress blocks completion');
insert into public.curriculum_subjects(id,level_id,family_code,code,name,completion_rule)
values(pg_temp.aid('missing-subject'),pg_temp.aid('l1'),'DIRECT','MISSING','Required without progress','DIRECT_ASSESSMENT');
update public.student_subject_progress set status='PASS' where id=pg_temp.sp('B',1);
select is((select status from public.student_level_progress where id=pg_temp.lp('B',1)),'IN_PROGRESS','missing required subject progress blocks grade completion');
update public.curriculum_subject_components set status='INACTIVE' where id=pg_temp.aid('req3');
select throws_ok($$select public.start_student_academic_level(pg_temp.enr('A'),pg_temp.aid('l3'),current_date-1)$$,'P0001','A required subject has no required active components','starting next grade revalidates required active components');
select is((select current_level_id from public.student_curriculum_enrollments where id=pg_temp.enr('A')),pg_temp.aid('l2'),'failed grade start preserves current grade');
select throws_ok($$select public.assign_student_academic_program(pg_temp.aid('D'),pg_temp.aid('c'),pg_temp.aid('l3'),current_date-1)$$,'P0001','A required subject has no required active components','inactive required components do not satisfy assignment');
select * from finish();
rollback;
