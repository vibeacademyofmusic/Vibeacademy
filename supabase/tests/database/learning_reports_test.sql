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
select throws_ok($$select generate_learning_report('71000000-0000-0000-0000-000000000001','MONTHLY','2026-08-02','2026-08-31')$$,'P0001','Monthly report requires a full calendar month','partial month rejected');
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

select * from finish();
rollback;
