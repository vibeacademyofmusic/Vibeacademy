begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into branches(id,code,name) values ('b9000000-0000-4000-8000-000000000001','TEST-TP','TEST Training Placement');
insert into curriculums(id,code,name) values ('b9000000-0000-4000-8000-000000000002','TEST-TP','TEST Training Placement');
insert into curriculum_levels(id,curriculum_id,code,name,sequence_no) values ('b9000000-0000-4000-8000-000000000003','b9000000-0000-4000-8000-000000000002','TEST','TEST',1);
insert into courses(id,curriculum_id,code,name) values ('b9000000-0000-4000-8000-000000000004','b9000000-0000-4000-8000-000000000002','TEST-TP','TEST');
insert into rooms(id,branch_id,code,name,capacity) select ('b9000000-0000-4000-8000-'||lpad((10+i)::text,12,'0'))::uuid,'b9000000-0000-4000-8000-000000000001','TEST-TP-'||i,'TEST '||i,10 from generate_series(1,3) i;
insert into teachers(id,teacher_code,full_name) select ('b9000000-0000-4000-8000-'||lpad((20+i)::text,12,'0'))::uuid,'TEST-TP-'||i,'TEST '||i from generate_series(1,3) i;
insert into classes(id,branch_id,course_id,code,name,class_type,capacity,status,accepted_from_level_id,accepted_to_level_id)
select ('b9000000-0000-4000-8000-'||lpad((30+i)::text,12,'0'))::uuid,'b9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000004','TEST-TP-'||i,'TEST '||i,case when i=1 then 'ONE_ON_ONE' else 'GROUP' end,case when i=1 then 1 else 2 end,'ACTIVE','b9000000-0000-4000-8000-000000000003','b9000000-0000-4000-8000-000000000003' from generate_series(1,3) i;
insert into class_teachers(class_id,teacher_id,teacher_role,assigned_at)
select ('b9000000-0000-4000-8000-'||lpad((30+i)::text,12,'0'))::uuid,('b9000000-0000-4000-8000-'||lpad((20+i)::text,12,'0'))::uuid,'PRIMARY','2020-01-01' from generate_series(1,3) i;
insert into schedules(id,class_id,room_id,day_of_week,start_time,end_time,effective_from)
select ('b9000000-0000-4000-8000-'||lpad((40+i)::text,12,'0'))::uuid,('b9000000-0000-4000-8000-'||lpad((30+i)::text,12,'0'))::uuid,('b9000000-0000-4000-8000-'||lpad((10+i)::text,12,'0'))::uuid,1,case when i=1 then '08:00'::time when i=2 then '09:00'::time else '08:30'::time end,case when i=1 then '09:00'::time when i=2 then '10:00'::time else '09:30'::time end,'2020-01-01' from generate_series(1,3) i;
insert into students(id,student_code,full_name,default_branch_id)
select ('b9000000-0000-4000-8000-'||lpad((50+i)::text,12,'0'))::uuid,'TEST-TP-'||i,'TEST '||i,'b9000000-0000-4000-8000-000000000001' from generate_series(1,4) i;
insert into student_curriculum_enrollments(student_id,curriculum_id,current_level_id,started_at,status)
select ('b9000000-0000-4000-8000-'||lpad((50+i)::text,12,'0'))::uuid,'b9000000-0000-4000-8000-000000000002','b9000000-0000-4000-8000-000000000003',current_date,'ACTIVE' from generate_series(1,4) i;
-- A different branch's incomplete schedule cannot deny this branch's placement.
insert into branches(id,code,name) values ('b9000000-0000-4000-8000-000000000101','TEST-TP-B','TEST unrelated branch');
insert into classes(id,branch_id,course_id,code,name,status) values ('b9000000-0000-4000-8000-000000000131','b9000000-0000-4000-8000-000000000101','b9000000-0000-4000-8000-000000000004','TEST-TP-UNKNOWN','TEST unrelated incomplete','ACTIVE');
insert into schedules(class_id,day_of_week,start_time,end_time,effective_from) values ('b9000000-0000-4000-8000-000000000131',1,'08:00','09:00','2020-01-01');
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000031','b9000000-0000-4000-8000-000000000051',current_date+1),'CLEAR','unrelated branch missing room/teacher does not deny placement');
update schedules set timezone='UTC' where class_id='b9000000-0000-4000-8000-000000000131';
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000031','b9000000-0000-4000-8000-000000000051',current_date+1),'CLEAR','unrelated branch timezone does not deny placement');
update classes set status='CANCELLED' where id='b9000000-0000-4000-8000-000000000131';
update schedules set status='INACTIVE' where class_id='b9000000-0000-4000-8000-000000000131';
select lives_ok($$insert into enrollments(id,student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000061','b9000000-0000-4000-8000-000000000051','b9000000-0000-4000-8000-000000000031',current_date+1)$$,'one-to-one first seat');
select throws_ok($$insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000052','b9000000-0000-4000-8000-000000000031',current_date+1)$$,'P0001','PLACEMENT_CLASS_FULL','one-to-one full');
select lives_ok($$insert into enrollments(id,student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000062','b9000000-0000-4000-8000-000000000051','b9000000-0000-4000-8000-000000000032',current_date+1)$$,'adjacent periods allowed');
select throws_ok($$insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000051','b9000000-0000-4000-8000-000000000033',current_date+1)$$,'P0001','PLACEMENT_STUDENT_CONFLICT','student overlap rejected');
select lives_ok($$insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000052','b9000000-0000-4000-8000-000000000032',current_date+1)$$,'group final seat');
select throws_ok($$insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000053','b9000000-0000-4000-8000-000000000032',current_date+1)$$,'P0001','PLACEMENT_CLASS_FULL','group full');
select throws_ok($$insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000051','b9000000-0000-4000-8000-000000000031',current_date+1)$$,'P0001','PLACEMENT_ALREADY_ENROLLED','duplicate retry cannot create enrollment');
insert into enrollment_pauses(enrollment_id,starts_on,ends_on,reason) values ('b9000000-0000-4000-8000-000000000061',current_date+1,current_date+7,'TEST pause');
select throws_ok($$insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000054','b9000000-0000-4000-8000-000000000031',current_date+1)$$,'P0001','PLACEMENT_CLASS_FULL','pause retains seat');
update enrollments set started_at=current_date-1 where id='b9000000-0000-4000-8000-000000000061';
select throws_ok($$update enrollments set class_id='b9000000-0000-4000-8000-000000000033' where id='b9000000-0000-4000-8000-000000000061'$$,'P0001','PLACEMENT_HISTORY_LOCKED','started membership cannot rewrite class');
update schedules set room_id='b9000000-0000-4000-8000-000000000011' where id='b9000000-0000-4000-8000-000000000043';
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000033','b9000000-0000-4000-8000-000000000054',current_date+1),'PLACEMENT_ROOM_CONFLICT','room overlap');
update classes set start_date=current_date+60 where id='b9000000-0000-4000-8000-000000000031';
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000033','b9000000-0000-4000-8000-000000000054',current_date+1),'PLACEMENT_ROOM_CONFLICT','future class boundary beyond next fortnight remains checked');
update classes set start_date=null where id='b9000000-0000-4000-8000-000000000031';
update schedules set room_id='b9000000-0000-4000-8000-000000000013' where id='b9000000-0000-4000-8000-000000000043';
update class_teachers set teacher_id='b9000000-0000-4000-8000-000000000021' where class_id='b9000000-0000-4000-8000-000000000033';
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000033','b9000000-0000-4000-8000-000000000054',current_date+1),'PLACEMENT_TEACHER_CONFLICT','teacher overlap');
update class_teachers set teacher_id='b9000000-0000-4000-8000-000000000023' where class_id='b9000000-0000-4000-8000-000000000033';
update schedules set status='INACTIVE' where id='b9000000-0000-4000-8000-000000000043';
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000033','b9000000-0000-4000-8000-000000000054',current_date+1),'PLACEMENT_SCHEDULE_REQUIRED','missing schedule is not clear');
select ok(not has_function_privilege('authenticated','public.placement_schedule_check(uuid,uuid,date,date,uuid)','EXECUTE'),'internal timetable not exposed');
update schedules set status='ACTIVE' where id='b9000000-0000-4000-8000-000000000043';
update students set default_branch_id=null where id='b9000000-0000-4000-8000-000000000054';
select throws_ok($$insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000054','b9000000-0000-4000-8000-000000000033',current_date+1)$$,'P0001','PLACEMENT_CLASS_DENIED','wrong branch profile');
update students set default_branch_id='b9000000-0000-4000-8000-000000000001' where id='b9000000-0000-4000-8000-000000000054';
update classes set start_date=current_date+20 where id='b9000000-0000-4000-8000-000000000033';
select throws_ok($$insert into enrollments(student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000054','b9000000-0000-4000-8000-000000000033',current_date+1)$$,'P0001','PLACEMENT_START_DENIED','before class start rejected');
update classes set start_date=null where id='b9000000-0000-4000-8000-000000000033';
update class_teachers set assigned_at=current_date+20 where class_id='b9000000-0000-4000-8000-000000000033';
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000033','b9000000-0000-4000-8000-000000000054',current_date+1),'PLACEMENT_SCHEDULE_UNKNOWN','future teacher is not incorrectly treated as current');
update class_teachers set assigned_at='2020-01-01' where class_id='b9000000-0000-4000-8000-000000000033';
-- Move the next regular Monday to 11:00; original 08:30 must not remain in projection.
insert into session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,room_id,original_starts_at,original_ends_at)
select 'b9000000-0000-4000-8000-000000000071','b9000000-0000-4000-8000-000000000043',d,
(d+'11:00'::time) at time zone 'Asia/Ho_Chi_Minh',(d+'12:00'::time) at time zone 'Asia/Ho_Chi_Minh','b9000000-0000-4000-8000-000000000013',
(d+'08:30'::time) at time zone 'Asia/Ho_Chi_Minh',(d+'09:30'::time) at time zone 'Asia/Ho_Chi_Minh'
from (select current_date+(8-extract(isodow from current_date)::int) d) x;
select is((select count(*) from placement_timetable('b9000000-0000-4000-8000-000000000033',current_date+1,current_date+7)),1::bigint,'rescheduled slot replaces recurrence');
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000033','b9000000-0000-4000-8000-000000000051',current_date+1,current_date+7),'CLEAR','rescheduled actual time resolves conflict during effective window');
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000033','b9000000-0000-4000-8000-000000000051',current_date+8),'PLACEMENT_STUDENT_CONFLICT','later recurring conflict is still detected');
insert into enrollments(id,student_id,class_id,started_at) values ('b9000000-0000-4000-8000-000000000064','b9000000-0000-4000-8000-000000000054','b9000000-0000-4000-8000-000000000033',current_date-20);
insert into session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,room_id,status)
values ('b9000000-0000-4000-8000-000000000072','b9000000-0000-4000-8000-000000000043',current_date-7,(current_date-7+'08:30'::time) at time zone 'Asia/Ho_Chi_Minh',(current_date-7+'09:30'::time) at time zone 'Asia/Ho_Chi_Minh','b9000000-0000-4000-8000-000000000013','CANCELLED');
insert into session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,room_id,occurrence_type,source_occurrence_id)
select 'b9000000-0000-4000-8000-000000000073','b9000000-0000-4000-8000-000000000043',d,(d+'14:00'::time) at time zone 'Asia/Ho_Chi_Minh',(d+'15:00'::time) at time zone 'Asia/Ho_Chi_Minh','b9000000-0000-4000-8000-000000000013','MAKEUP','b9000000-0000-4000-8000-000000000072'
from(select current_date+(8-extract(isodow from current_date)::int) d)x;
insert into makeup_credits(enrollment_id,source_occurrence_id,source_reason) values ('b9000000-0000-4000-8000-000000000064','b9000000-0000-4000-8000-000000000072','SESSION_CANCELLED') on conflict do nothing;
insert into session_occurrence_participants(session_occurrence_id,enrollment_id) values ('b9000000-0000-4000-8000-000000000073','b9000000-0000-4000-8000-000000000064');
update schedules set start_time='14:00',end_time='15:00' where id='b9000000-0000-4000-8000-000000000042';
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000032','b9000000-0000-4000-8000-000000000054',current_date+1,current_date+7),'PLACEMENT_STUDENT_CONFLICT','explicit makeup roster conflicts with new membership');
select is(placement_schedule_check('b9000000-0000-4000-8000-000000000032','b9000000-0000-4000-8000-000000000053',current_date+1,current_date+7),'CLEAR','makeup does not include nonparticipants');
insert into auth.users(id) values ('b9000000-0000-4000-8000-000000000099');
insert into profiles(id,full_name,status) values ('b9000000-0000-4000-8000-000000000099','TEST pagination admin','ACTIVE');
insert into user_roles(user_id,role_id) select 'b9000000-0000-4000-8000-000000000099',id from roles where code='SUPER_ADMIN';
select set_config('request.jwt.claim.sub','b9000000-0000-4000-8000-000000000099',true);
insert into classes(branch_id,course_id,code,name,class_type,capacity,status)
select 'b9000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000004','TEST-PAGE-'||i,'TEST page '||lpad(i::text,3,'0'),'GROUP',4,'ACTIVE' from generate_series(1,105)i;
select is((select count(*) from (select * from list_placement_class_options('b9000000-0000-4000-8000-000000000001') offset 100 limit 100) page),8::bigint,'all choices after first 100 remain reachable by pagination');
select * from finish();
rollback;
