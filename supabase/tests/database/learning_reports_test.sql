begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Every report query is scoped to these test enrollments, so existing local reports are preserved.
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
insert into auth.users (id) values ('b1000000-0000-0000-0000-000000000001'), ('b1000000-0000-0000-0000-000000000002');
insert into public.roles (code, name) values ('SUPER_ADMIN', 'Admin') on conflict (code) do nothing;
-- Authorization requires an active account as well as the role assignment.
insert into public.profiles(id, status) values ('b1000000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (user_id, role_id) select 'b1000000-0000-0000-0000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select lives_ok($$select public.generate_learning_report('71000000-0000-0000-0000-000000000001','MONTHLY','2026-08-01','2026-08-31')$$,'monthly generated');
select is((select count(*) from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),1::bigint,'one report');
select lives_ok($$select public.generate_learning_report('71000000-0000-0000-0000-000000000001','MONTHLY','2026-08-01','2026-08-31')$$,'repeat is idempotent');
select is((select count(*) from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),1::bigint,'no duplicate');
select is((select draft_data->'attendance'->>'attended' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'1','attendance present aggregated');
select is((select draft_data->'attendance'->>'scheduled' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'1','scheduled scoped to class and enrollment');
select is((select draft_data->'journals'->>'count' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'0','empty journals explicit');
select is((select draft_data->'attendance'->>'rate' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'100.0','attendance rate');
select ok((select snapshot_data is null from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'not finalized at generation');
select throws_ok($$select generate_learning_report('71000000-0000-0000-0000-000000000001','MONTHLY','2026-08-02','2026-08-31')$$,'P0001','Monthly report must cover a full calendar month','partial month rejected');
select throws_ok($$select generate_learning_report('71000000-0000-0000-0000-000000000001','MONTHLY','2099-08-01','2099-08-31')$$,'P0001','Invalid closed report period','future period rejected');
select throws_ok($$select generate_learning_report('71000000-0000-0000-0000-000000000001','MONTHLY','2026-09-01','2026-08-31')$$,'P0001','Invalid closed report period','reversed dates rejected');
select throws_ok($$select update_learning_report(id,version,'APPROVE') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'P0001','Invalid report transition','cannot approve draft');
insert into learning_journals(attendance_record_id,content,homework) values('a1000000-0000-0000-0000-000000000001','Practice scales','Five minutes daily');
select lives_ok($$select update_learning_report(id,version,'REGENERATE') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'regenerate draft');
select is((select version from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),2,'regeneration increments version');
select is((select draft_data->'journals'->>'count' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'1','journal refresh');
select lives_ok($$select update_learning_report(id,version,'SAVE','{"general_comment":"Teacher supplied comment"}','Internal note') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'save supplied summary');
select throws_ok($$select update_learning_report(id,1,'READY') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'P0001','Report changed; reload','stale edits rejected');
select lives_ok($$select update_learning_report(id,version,'READY') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'ready workflow');
select throws_ok($$select update_learning_report(id,version,'REGENERATE') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'P0001','Invalid report transition','reviewed data cannot regenerate');
select lives_ok($$select update_learning_report(id,version,'APPROVE') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'approve');
select is((select snapshot_data->'teacher_summary'->>'general_comment' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'Teacher supplied comment','approval includes supplied summary');
select ok((select approved_by=auth.uid() and approved_at is not null from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'approval attribution');
select throws_ok($$select update_learning_report(id,version,'SAVE') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'P0001','Report is immutable','approved cannot overwrite');
select throws_ok($$update learning_reports set admin_note='hack'$$,'42501',null,'direct writes prohibited');
update learning_journals set content='Changed after approval' where attendance_record_id='a1000000-0000-0000-0000-000000000001';
select is((select snapshot_data->'journals'->'excerpts'->0->>'content' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),'Practice scales','snapshot survives live edits');
select lives_ok($$select generate_learning_report('71000000-0000-0000-0000-000000000001','END_OF_COURSE','2026-08-01','2026-08-31')$$,'end of course manual foundation');
select lives_ok($$select update_learning_report(id,version,'CANCEL') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002') and report_type='END_OF_COURSE'$$,'cancel draft');
select throws_ok($$select update_learning_report(id,version,'REGENERATE') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002') and report_type='END_OF_COURSE'$$,'P0001','Report is immutable','cancel terminal');
reset role;
insert into curriculum_subjects(id,level_id,family_code,code,name,completion_rule) values('d1000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','PIANO','REPORT-DIRECT','Direct assessment','DIRECT_ASSESSMENT');
insert into curriculum_subject_components(subject_id,code,name) values('d1000000-0000-0000-0000-000000000001','IGNORED','Ignored direct component');
update enrollments set student_curriculum_enrollment_id=assign_student_academic_program(student_id,'21000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','2026-08-01',true) where id='71000000-0000-0000-0000-000000000002';
set local role authenticated;
select lives_ok($$select generate_learning_report('71000000-0000-0000-0000-000000000002','MONTHLY','2026-08-01','2026-08-31')$$,'second student independent');
select is((select draft_data->'attendance'->>'scheduled' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002') and enrollment_id='71000000-0000-0000-0000-000000000002'),'0','other class attendance excluded');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000002',true);
select throws_ok($$select generate_learning_report('71000000-0000-0000-0000-000000000001','MONTHLY','2026-08-01','2026-08-31')$$,'P0001','Unauthorized','non admin cannot generate');
select is((select count(*) from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')),0::bigint,'report RLS');
select is((select count(*) from learning_report_events),0::bigint,'history RLS');
select throws_ok($$select learning_report_source('71000000-0000-0000-0000-000000000001','2026-08-01','2026-08-31')$$,'42501',null,'internal source helper private');
reset role;
select throws_ok($$update learning_reports set admin_note='privileged edit' where status='APPROVED' and enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002')$$,'P0001','Report is immutable','trigger protects approved even privileged direct write');
select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',true);
select update_learning_report(id,version,'REGENERATE') from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002') and enrollment_id='71000000-0000-0000-0000-000000000002';
select is((select draft_data->'academic'->>'current_grade' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002') and enrollment_id='71000000-0000-0000-0000-000000000002'),'Attendance Test Level','academic context follows linked student program');
select is((select draft_data->'academic'->'subjects'->0->>'status' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002') and enrollment_id='71000000-0000-0000-0000-000000000002'),'NOT_STARTED','academic status captured without promotion');
select is((select draft_data->'academic'->'subjects'->0->'components' from learning_reports where enrollment_id in ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000002') and enrollment_id='71000000-0000-0000-0000-000000000002'),'[]'::jsonb,'direct assessment independent from components');
insert into session_occurrences(schedule_id,occurrence_date,starts_at,ends_at) values
('81000000-0000-0000-0000-000000000001','2026-08-31','2026-08-31 17:00:00+00','2026-08-31 18:00:00+00');
select is((learning_report_source('71000000-0000-0000-0000-000000000001','2026-08-01','2026-08-31')->'attendance'->>'scheduled'),'1','Vietnam September 1 midnight excluded from August');
select is((learning_report_source('71000000-0000-0000-0000-000000000001','2026-09-01','2026-09-30')->'attendance'->>'scheduled'),'1','Vietnam September 1 midnight included in September');
insert into session_occurrences(schedule_id,occurrence_date,starts_at,ends_at,status) values
('81000000-0000-0000-0000-000000000001','2026-08-10','2026-08-10 09:00:00+07','2026-08-10 10:00:00+07','CANCELLED');
select is((learning_report_source('71000000-0000-0000-0000-000000000001','2026-08-01','2026-08-31')->'attendance'->>'scheduled'),'1','cancelled sessions excluded');
select is((select status from student_level_progress where enrollment_id=(select student_curriculum_enrollment_id from enrollments where id='71000000-0000-0000-0000-000000000002')),'IN_PROGRESS','reports do not promote academic grade');


-- Notification jobs derive only from approved snapshots and never include notes.
insert into profiles(id) values('b1000000-0000-0000-0000-000000000002');
insert into user_roles(user_id,role_id) select 'b1000000-0000-0000-0000-000000000002',id from roles where code='STUDENT';
update students set user_id='b1000000-0000-0000-0000-000000000002' where id='61000000-0000-0000-0000-000000000001';
select is(enqueue_notification_event('LEARNING_REPORT',(select id from learning_reports where enrollment_id='71000000-0000-0000-0000-000000000001' and status='APPROVED')),1,'Approved report creates one recipient job');
select is(enqueue_notification_event('LEARNING_REPORT',(select id from learning_reports where enrollment_id='71000000-0000-0000-0000-000000000001' and status='APPROVED')),0,'Report notification generation idempotent');
select ok(not exists(select 1 from notification_jobs where recipient_id='b1000000-0000-0000-0000-000000000002' and (payload ? 'admin_note' or payload::text like '%Teacher supplied comment%')),'Notification has no private/report content');
select throws_ok($$select enqueue_notification_event('LEARNING_REPORT',(select id from learning_reports where enrollment_id='71000000-0000-0000-0000-000000000002' and status='DRAFT'))$$,'P0001','Eligible source not found','Draft report cannot notify');


insert into auth.users(id) values('de910000-0000-4000-8000-000000000001');
insert into profiles(id) values('de910000-0000-4000-8000-000000000001');
insert into branches(id,code,name) values('de910000-0000-4000-8000-000000000002','NOTIFY-OTHER','Other notification branch');
insert into parents(id,user_id,parent_code) values('de910000-0000-4000-8000-000000000003','de910000-0000-4000-8000-000000000001','NOTIFY-PARENT');
insert into student_parents(parent_id,student_id) values('de910000-0000-4000-8000-000000000003','61000000-0000-0000-0000-000000000001'),('de910000-0000-4000-8000-000000000003','61000000-0000-0000-0000-000000000002');
insert into user_roles(user_id,role_id,branch_id) select 'de910000-0000-4000-8000-000000000001',id,'de910000-0000-4000-8000-000000000002' from roles where code='PARENT';
select is(notification_private.recipient_allowed('de910000-0000-4000-8000-000000000001','61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','MONTHLY_REPORT'),false,'Parent role wrong branch cannot receive report');
update user_roles set branch_id='11000000-0000-0000-0000-000000000001' where user_id='de910000-0000-4000-8000-000000000001';
select is(notification_private.recipient_allowed('de910000-0000-4000-8000-000000000001','61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','MONTHLY_REPORT'),true,'Active linked parent correct branch eligible');
update student_parents set can_view_finance=false where parent_id='de910000-0000-4000-8000-000000000003';
select is(notification_private.recipient_allowed('de910000-0000-4000-8000-000000000001','61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','TUITION_REMINDER'),false,'Parent finance flag also gates notifications');
insert into enrollments(student_id,class_id,started_at) values('61000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000001','2026-08-01');
select lives_ok($$select enqueue_notification_event('SCHEDULE_CHANGED','91000000-0000-0000-0000-000000000001')$$,'Schedule notice resolves student and parent audience');
select is((select count(*) from notification_jobs where entity_type='SCHEDULE_CHANGED' and recipient_id='de910000-0000-4000-8000-000000000001'),1::bigint,'Two children in same session create only one parent notice');
update student_parents set is_active=false where parent_id='de910000-0000-4000-8000-000000000003';
select is(notification_private.recipient_allowed('de910000-0000-4000-8000-000000000001','61000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','MONTHLY_REPORT'),false,'Revoked parent relationship cannot receive notice');

-- Closed historical equivalents of the September/October 2026 examples.
-- Use 2025 (and leap year 2024) instead of changing the production clock guard.
create function pg_temp.monthly_id(text) returns uuid language sql immutable as $$select md5('monthly-first-'||$1)::uuid$$;
insert into students(id,student_code,full_name)
select pg_temp.monthly_id('s-'||code),'MONTHLY-'||code,'Monthly fixture '||code
from unnest(array['day1','mid','early','cancel','dec','leap','future','legacy']) code;
insert into enrollments(id,student_id,class_id,started_at,ended_at)
select pg_temp.monthly_id(code),pg_temp.monthly_id('s-'||code),'51000000-0000-0000-0000-000000000001',started,ended
from (values
 ('day1','2025-09-01'::date,null::date),('mid','2025-09-20'::date,null::date),
 ('early','2025-09-20'::date,'2025-10-15'::date),('cancel','2025-09-20'::date,null::date),
 ('dec','2025-12-31'::date,null::date),('leap','2024-01-31'::date,null::date),
 ('future','2099-09-20'::date,null::date),('legacy','2025-09-20'::date,null::date)
) fixture(code,started,ended);
set local role authenticated;
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('day1'),'MONTHLY','2025-09-01','2025-10-31')$$,'P0001','First monthly report must cover the enrollment start calendar month','day-one first period cannot extend into next month');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('day1'),'MONTHLY','2025-09-01','2025-09-30')$$,'day-one enrollment uses same full calendar month');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-09-20','2025-09-30')$$,'P0001','First monthly report must start on the enrollment start date and end on the last day of the following month','partial first month alone rejected');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-09-20','2025-10-20')$$,'P0001','First monthly report must start on the enrollment start date and end on the last day of the following month','rolling month rejected');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-09-21','2025-10-31')$$,'P0001','First monthly report must start on the enrollment start date and end on the last day of the following month','first report must start on enrollment start');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-09-01','2025-10-31')$$,'P0001','Monthly report must stay within enrollment dates; use END_OF_COURSE for a shortened final period','first report cannot precede enrollment');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-11-01','2025-11-30')$$,'P0001','First monthly report must start on the enrollment start date and end on the last day of the following month','dates alone cannot pretend first report already exists');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'END_OF_COURSE','2025-09-20','2025-09-30')$$,'end of course still supports a closed partial range');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-09-20','2025-10-31')$$,'mid-month start extends through next month despite other report type');
select is((select draft_data->>'period_start' from learning_reports where enrollment_id=pg_temp.monthly_id('mid') and report_type='MONTHLY'),'2025-09-20','source snapshot uses actual first-period start');
select is((select draft_data->>'period_end' from learning_reports where enrollment_id=pg_temp.monthly_id('mid') and report_type='MONTHLY'),'2025-10-31','source snapshot uses actual first-period end');
select is(generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-09-20','2025-10-31'),(select id from learning_reports where enrollment_id=pg_temp.monthly_id('mid') and report_type='MONTHLY'),'first-period retry returns same ID after history exists');
select is((select count(*) from learning_report_events where report_id in (select id from learning_reports where enrollment_id=pg_temp.monthly_id('mid') and report_type='MONTHLY')),1::bigint,'retry does not add duplicate generation event');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-10-01','2025-10-31')$$,'P0001','Monthly report overlaps an existing report','regular month cannot overlap extended first period');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-11-01','2025-11-30')$$,'subsequent full month succeeds');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-11-01','2025-12-31')$$,'P0001','Monthly report must cover a full calendar month','subsequent two-month range rejected');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-08-01','2025-08-31')$$,'P0001','Enrollment does not overlap period','period entirely before enrollment rejected');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('future'),'MONTHLY','2099-09-20','2099-10-31')$$,'P0001','Invalid closed report period','valid future first-period shape is still rejected');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY',(now() at time zone 'Asia/Ho_Chi_Minh')::date,(now() at time zone 'Asia/Ho_Chi_Minh')::date)$$,'P0001','Invalid closed report period','today is not a closed period');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('mid'),'MONTHLY','2025-11-30','2025-11-01')$$,'P0001','Invalid closed report period','reversed monthly dates rejected');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('early'),'MONTHLY','2025-09-20','2025-10-31')$$,'P0001','Monthly report must stay within enrollment dates; use END_OF_COURSE for a shortened final period','early enrollment end blocks extended monthly report');
select throws_ok($$select generate_learning_report(pg_temp.monthly_id('early'),'MONTHLY','2025-09-20','2025-10-15')$$,'P0001','First monthly report must start on the enrollment start date and end on the last day of the following month','monthly report is not truncated at course end');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('early'),'END_OF_COURSE','2025-09-20','2025-10-15')$$,'short course can use end-of-course report');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('dec'),'MONTHLY','2025-12-31','2026-01-31')$$,'first period crosses year boundary');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('leap'),'MONTHLY','2024-01-31','2024-02-29')$$,'first period ends on leap day');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('cancel'),'MONTHLY','2025-09-20','2025-10-31')$$,'cancellation fixture first report');
select update_learning_report(id,version,'CANCEL') from learning_reports where enrollment_id=pg_temp.monthly_id('cancel');
select is(generate_learning_report(pg_temp.monthly_id('cancel'),'MONTHLY','2025-09-20','2025-10-31'),(select id from learning_reports where enrollment_id=pg_temp.monthly_id('cancel')),'cancelled first period retry returns reserved report');
select is((select status from learning_reports where enrollment_id=pg_temp.monthly_id('cancel')),'CANCELLED','cancelled report is not revived');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('cancel'),'MONTHLY','2025-11-01','2025-11-30')$$,'cancelled report still counts as existing history');
-- Exercise review, approval, publication and the frozen snapshot after generation change.
select update_learning_report(id,version,'READY') from learning_reports where enrollment_id=pg_temp.monthly_id('day1');
select is(generate_learning_report(pg_temp.monthly_id('day1'),'MONTHLY','2025-09-01','2025-09-30'),(select id from learning_reports where enrollment_id=pg_temp.monthly_id('day1')),'reviewed report retry remains idempotent');
select update_learning_report(id,version,'APPROVE') from learning_reports where enrollment_id=pg_temp.monthly_id('day1');
select update_learning_report(id,version,'PUBLISH') from learning_reports where enrollment_id=pg_temp.monthly_id('day1');
select is((select status from learning_reports where enrollment_id=pg_temp.monthly_id('day1')),'PUBLISHED','publish workflow preserved');
select is(generate_learning_report(pg_temp.monthly_id('day1'),'MONTHLY','2025-09-01','2025-09-30'),(select id from learning_reports where enrollment_id=pg_temp.monthly_id('day1')),'published retry returns existing report');
select throws_ok($$select update_learning_report(id,version,'REGENERATE') from learning_reports where enrollment_id=pg_temp.monthly_id('day1')$$,'P0001','Report is immutable','published snapshot remains immutable');
reset role;
-- Simulate a pre-migration report which the old full-month rule allowed.
insert into learning_reports(student_id,enrollment_id,branch_id,report_type,period_start,period_end,draft_data,generated_by)
values(pg_temp.monthly_id('s-legacy'),pg_temp.monthly_id('legacy'),'11000000-0000-0000-0000-000000000001','MONTHLY','2025-09-01','2025-09-30','{}','b1000000-0000-0000-0000-000000000001');
set local role authenticated;
select is(generate_learning_report(pg_temp.monthly_id('legacy'),'MONTHLY','2025-09-01','2025-09-30'),(select id from learning_reports where enrollment_id=pg_temp.monthly_id('legacy')),'legacy identity preserved without rewriting old snapshot');
select lives_ok($$select generate_learning_report(pg_temp.monthly_id('legacy'),'MONTHLY','2025-10-01','2025-10-31')$$,'legacy history continues with regular calendar month');
reset role;

select * from finish();
rollback;
