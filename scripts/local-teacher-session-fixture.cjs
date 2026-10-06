#!/usr/bin/env node
const {execFileSync}=require('node:child_process')
const {createClient}=require('@supabase/supabase-js')
function psql(sql){return execFileSync('docker',['exec','-i','supabase_db_vibe-academy-system','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'})}
const id=n=>`c2000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const IDS={branch:id(1),course:id(2),room:id(3),class:id(4),schedule:id(5),session:id(6),teacher:id(7),other:id(8),students:[11,12,13,14].map(id),enrollments:[21,22,23,24].map(id)}
const EMAIL='teacher-session.test@vibe.local', OTHER='teacher-session.other@vibe.local', PASSWORD='LocalTeacherSession-2026!'
const quote=value=>"'"+value.replaceAll("'","''")+"'"
function localStatus(){const s=JSON.parse(execFileSync('npx',['--no-install','supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));const url=new URL(s.API_URL);if(!['127.0.0.1','localhost'].includes(url.hostname)||url.port!=='54321')throw Error('LOCAL ONLY: teacher session fixture refuses every database except 127.0.0.1:54321');return s}
function cleanupSql(){return `
-- Guard changes are transactional and table-locked: only the exact TEST namespace is removed.
alter table student_journal_observation_selections disable trigger student_journal_selections_guard;
alter table student_learning_journal_entries disable trigger student_learning_entries_guard;
alter table session_learning_journals disable trigger session_learning_journals_guard;
delete from student_journal_observation_selections where entry_id in (select e.id from student_learning_journal_entries e join session_learning_journals j on j.id=e.session_journal_id join session_occurrences o on o.id=j.session_occurrence_id where o.schedule_id='${IDS.schedule}');
delete from student_learning_journal_entries where session_journal_id in (select j.id from session_learning_journals j join session_occurrences o on o.id=j.session_occurrence_id where o.schedule_id='${IDS.schedule}');
delete from session_learning_journals where session_occurrence_id in(select id from session_occurrences where schedule_id='${IDS.schedule}');
alter table student_journal_observation_selections enable trigger student_journal_selections_guard;
alter table student_learning_journal_entries enable trigger student_learning_entries_guard;
alter table session_learning_journals enable trigger session_learning_journals_guard;
alter table attendance_records disable trigger trg_zz_guard_attendance_mutation_for_finalized_session;
delete from attendance_records where enrollment_id in (${IDS.enrollments.map(quote)});
alter table attendance_records enable trigger trg_zz_guard_attendance_mutation_for_finalized_session;
delete from session_occurrence_participants where session_occurrence_id in(select id from session_occurrences where schedule_id='${IDS.schedule}');
delete from makeup_credits where enrollment_id in (${IDS.enrollments.map(quote)});
alter table session_teacher_snapshots disable trigger guard_session_teacher_snapshot;
alter table session_teacher_assignments disable trigger guard_session_teacher_history;
delete from session_teacher_snapshots where session_id in(select id from session_occurrences where schedule_id='${IDS.schedule}');
delete from session_teacher_assignments where session_id in(select id from session_occurrences where schedule_id='${IDS.schedule}');
alter table session_teacher_snapshots enable trigger guard_session_teacher_snapshot;
alter table session_teacher_assignments enable trigger guard_session_teacher_history;
delete from session_occurrences where schedule_id='${IDS.schedule}' and occurrence_type='MAKEUP';
delete from session_occurrences where schedule_id='${IDS.schedule}';
delete from schedules where id='${IDS.schedule}';
delete from class_teachers where class_id='${IDS.class}';
delete from enrollments where id in (${IDS.enrollments.map(quote)});
delete from student_curriculum_enrollments where student_id in (${IDS.students.map(quote)});
delete from students where id in (${IDS.students.map(quote)});
delete from classes where id='${IDS.class}';
delete from rooms where id='${IDS.room}';
delete from courses where id='${IDS.course}';
delete from teacher_branches where teacher_id in('${IDS.teacher}','${IDS.other}');
delete from teachers where id in('${IDS.teacher}','${IDS.other}');
delete from user_roles where branch_id='${IDS.branch}' and user_id in(select id from auth.users where email in('${EMAIL}','${OTHER}'));
delete from branches where id='${IDS.branch}';
`}
function seedSql(users){return `
${cleanupSql()}
insert into branches(id,code,name) values('${IDS.branch}','TEST_TSW','TEST Teacher Session');
insert into courses(id,curriculum_id,code,name) select '${IDS.course}',id,'TEST_TSW','Guitar Group Test' from curriculums where code='TEST_GUITAR';
insert into rooms(id,branch_id,code,name,capacity) values('${IDS.room}','${IDS.branch}','TEST_TSW','Phòng TEST 2',10);
insert into classes(id,branch_id,course_id,code,name,class_type,capacity,status,accepted_from_level_id,accepted_to_level_id)
select '${IDS.class}','${IDS.branch}','${IDS.course}','TEST_TSW','Guitar Group Test','GROUP',10,'ACTIVE',
 (select l.id from curriculum_levels l join curriculums c on c.id=l.curriculum_id where c.code='TEST_GUITAR' and l.code='PRE'),
 (select l.id from curriculum_levels l join curriculums c on c.id=l.curriculum_id where c.code='TEST_GUITAR' and l.code='GRADE_5');
${users.map((user,i)=>`insert into profiles(id,full_name,status) values('${user}','TEST ${i?'Other':'Minh'}','ACTIVE') on conflict(id) do update set status='ACTIVE';
insert into user_roles(user_id,role_id,branch_id) select '${user}',id,'${IDS.branch}' from roles where code='TEACHER';
insert into teachers(id,user_id,teacher_code,full_name,status) values('${i?IDS.other:IDS.teacher}','${user}','TEST_TSW_${i}','TEST ${i?'Other':'Minh'}','ACTIVE');
insert into teacher_branches(teacher_id,branch_id) values('${i?IDS.other:IDS.teacher}','${IDS.branch}');`).join('\n')}
insert into class_teachers(class_id,teacher_id,teacher_role,is_active,assigned_at) values('${IDS.class}','${IDS.teacher}','PRIMARY',true,current_date-30);
${IDS.students.map((student,i)=>`insert into students(id,student_code,full_name,default_branch_id,status) values('${student}','TEST_TSW_${i}','${['An','Bình','Cúc','Dũng'][i]} — TEST','${IDS.branch}','ACTIVE');
select public.assign_student_academic_program('${student}',c.id,l.id,current_date-30) from curriculums c join curriculum_levels l on l.curriculum_id=c.id where c.code='TEST_GUITAR' and l.code='${['GRADE_1','GRADE_3','PRE','GRADE_5'][i]}';
insert into enrollments(id,student_id,class_id,student_curriculum_enrollment_id,started_at,enrolled_at,status)
select '${IDS.enrollments[i]}','${student}','${IDS.class}',id,current_date-14,current_date-14,'ACTIVE' from student_curriculum_enrollments where student_id='${student}';`).join('\n')}
-- Actual engine: finish Grade 5 items and start Grade 6. No direct current-level update.
update student_component_item_progress set status='PASS' where component_progress_id in(
 select cp.id from student_component_progress cp join student_subject_progress sp on sp.id=cp.subject_progress_id join student_level_progress lp on lp.id=sp.level_progress_id join student_curriculum_enrollments e on e.id=lp.enrollment_id where e.student_id='${IDS.students[3]}');
select public.start_student_academic_level(e.id,l.id,current_date-1) from student_curriculum_enrollments e join curriculum_levels l on l.curriculum_id=e.curriculum_id where e.student_id='${IDS.students[3]}' and l.code='GRADE_6';
-- Distinct initial progress for An and Bình, leave Cúc untouched.
update student_component_item_progress set status='IN_PROGRESS' where id in(select ip.id from student_component_item_progress ip join student_component_progress cp on cp.id=ip.component_progress_id join student_subject_progress sp on sp.id=cp.subject_progress_id join student_level_progress lp on lp.id=sp.level_progress_id join student_curriculum_enrollments e on e.id=lp.enrollment_id where e.student_id='${IDS.students[0]}' order by ip.id limit 1);
update student_component_item_progress set status='PASS' where id in(select ip.id from student_component_item_progress ip join student_component_progress cp on cp.id=ip.component_progress_id join student_subject_progress sp on sp.id=cp.subject_progress_id join student_level_progress lp on lp.id=sp.level_progress_id join student_curriculum_enrollments e on e.id=lp.enrollment_id where e.student_id='${IDS.students[1]}' order by ip.id limit 2);
insert into schedules(id,class_id,room_id,day_of_week,start_time,end_time,effective_from,status) values('${IDS.schedule}','${IDS.class}','${IDS.room}',extract(isodow from current_date+1),'15:00','16:30',current_date-7,'ACTIVE');
insert into session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,room_id,status,occurrence_type) values('${IDS.session}','${IDS.schedule}',current_date+1,(current_date+1+time '15:00') at time zone 'Asia/Ho_Chi_Minh',(current_date+1+time '16:30') at time zone 'Asia/Ho_Chi_Minh','${IDS.room}','SCHEDULED','REGULAR');
`}
async function main(){const status=localStatus(),db=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await db.auth.admin.listUsers({perPage:1000});if(error)throw error;
 if(process.argv[2]==='--cleanup'){psql('begin;\n'+cleanupSql()+'commit;');for(const user of data.users.filter(u=>[EMAIL,OTHER].includes(u.email))){const result=await db.auth.admin.deleteUser(user.id);if(result.error)throw result.error}console.log('Teacher Session TEST cleanup complete; canonical demo curriculum retained.');return}
 const users=[];for(const email of [EMAIL,OTHER]){let user=data.users.find(u=>u.email===email);if(!user){const result=await db.auth.admin.createUser({email,password:PASSWORD,email_confirm:true});if(result.error)throw result.error;user=result.data.user}users.push(user.id)}
 psql('begin;\n'+seedSql(users)+'commit;');console.log(JSON.stringify({session:IDS.session,url:`http://localhost:3000/operations/teacher/sessions/${IDS.session}`,email:EMAIL,password:PASSWORD,users}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1})
module.exports={IDS,EMAIL,OTHER,PASSWORD,localStatus,cleanupSql,seedSql}
