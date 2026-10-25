import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

// Isolated SQL contract fixture: real roster, pause and teacher resolver definitions.
// Relationship guards are explicit test doubles; hosted RLS/role integration is a separate release check.
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function public.account_is_active() returns boolean language sql stable as $$ select current_setting('test.active',true)='true' $$;
create function public.student_ops_may_enter() returns boolean language sql stable as $$ select current_setting('test.ops',true)='true' $$;
create function public.registration_can(p_permission text,p_branch uuid) returns boolean language sql stable as $$ select p_permission='student_placement.view' and p_branch::text=current_setting('test.placement_branch',true) $$;
create table branches(id uuid primary key,name text);
create table curriculums(id uuid primary key,name text);
create table courses(id uuid primary key,name text);
create table classes(id uuid primary key,name text,code text,branch_id uuid,curriculum_id uuid,course_id uuid,capacity int,status text,start_date date,end_date date);
create table schedules(id uuid primary key,class_id uuid,room_id uuid,start_time time,end_time time,effective_from date,effective_to date,status text,day_of_week int,timezone text);
create table rooms(id uuid primary key,name text,capacity int);
create table teachers(id uuid primary key,full_name text);
create table class_teachers(class_id uuid,teacher_id uuid,teacher_role text,is_active bool,assigned_at date,ended_at date);
create table students(id uuid primary key,full_name text,student_code text);
create table enrollments(id uuid primary key,student_id uuid,class_id uuid,started_at date,ended_at date,status text);
create table enrollment_pauses(enrollment_id uuid,status text,starts_on date,ends_on date);
create table session_occurrences(id uuid primary key,schedule_id uuid,occurrence_date date,starts_at timestamptz,ends_at timestamptz,room_id uuid,status text,occurrence_type text,source_occurrence_id uuid,original_starts_at timestamptz,notes text);
create table session_occurrence_participants(session_occurrence_id uuid,enrollment_id uuid,booking_status text);
create table attendance_records(id uuid primary key,session_occurrence_id uuid,enrollment_id uuid,status text);
create table session_teacher_assignments(id uuid,session_id uuid,teacher_id uuid,assignment_type text,effective_status text,reason text,assigned_by uuid,assigned_at timestamptz);
create table session_teacher_snapshots(session_id uuid,teacher_id uuid,assignment_type text);
create function can_access_class(p_class uuid) returns boolean language sql stable set search_path=public as $$ select exists(select 1 from classes where id=p_class and branch_id::text=current_setting('test.branch',true)) $$;
create function can_access_session(p_session uuid) returns boolean language sql stable set search_path=public as $$ select exists(select 1 from session_occurrences o join schedules s on s.id=o.schedule_id where o.id=p_session and can_access_class(s.class_id)) and current_setting('test.session_denied',true) is distinct from p_session::text $$;
`)
const pauseSource = fs.readFileSync('supabase/migrations/20260907020106_enrollment_pause_engine.sql','utf8')
await db.exec(pauseSource.match(/create or replace function public\.is_enrollment_paused_on\([\s\S]+?\$\$;/i)[0])
const rosterSource = fs.readFileSync('supabase/migrations/20261025013000_cross_class_makeup_roster.sql','utf8')
await db.exec(rosterSource.match(/create or replace function public\.session_teaching_roster\([\s\S]+?\$\$;/i)[0])
const teacherSource = fs.readFileSync('supabase/migrations/20260915170000_session_teacher_assignment_v1.sql','utf8')
await db.exec(teacherSource.match(/create view public\.session_actual_teachers[\s\S]+?primary_teacher on true;/)[0])
await db.exec(fs.readFileSync('supabase/migrations/20261024002601_coordination_week_dashboard_read.sql','utf8'))

async function fixture() {
  await db.exec(`reset role; truncate branches,curriculums,courses,classes,schedules,rooms,teachers,class_teachers,students,enrollments,enrollment_pauses,session_occurrences,session_occurrence_participants,attendance_records,session_teacher_assignments,session_teacher_snapshots;
    select set_config('test.uid','${uid(999)}',false),set_config('test.active','true',false),set_config('test.branch','${uid(1)}',false),set_config('test.session_denied','',false),set_config('test.ops','true',false),set_config('test.placement_branch','${uid(1)}',false);
    insert into branches values('${uid(1)}','Branch A'),('${uid(2)}','Branch B');
    insert into classes values('${uid(10)}','Fixture Piano','P1','${uid(1)}',null,null,6,'ACTIVE','2026-10-26',null),('${uid(11)}','Hidden Piano','P2','${uid(2)}',null,null,6,'ACTIVE','2026-10-26',null);
    insert into rooms values('${uid(20)}','Piano 1',6),('${uid(21)}','Piano 2',4);
    insert into teachers values('${uid(30)}','Primary'),('${uid(31)}','Substitute');
    insert into class_teachers values('${uid(10)}','${uid(30)}','PRIMARY',true,'2026-10-26',null);
    insert into schedules values('${uid(40)}','${uid(10)}','${uid(20)}','16:00','17:30','2026-10-26',null,'ACTIVE',1,'Asia/Ho_Chi_Minh'),('${uid(41)}','${uid(11)}','${uid(21)}','16:00','17:30','2026-10-26',null,'ACTIVE',1,'Asia/Ho_Chi_Minh');
    insert into students values('${uid(50)}','Student A','A'),('${uid(51)}','Student B','B'),('${uid(52)}','Student C','C');
    insert into enrollments values('${uid(60)}','${uid(50)}','${uid(10)}','2026-10-26',null,'ACTIVE'),('${uid(61)}','${uid(51)}','${uid(10)}','2026-10-27',null,'ACTIVE'),('${uid(62)}','${uid(52)}','${uid(10)}','2026-10-25',null,'PAUSED');
    insert into enrollment_pauses values('${uid(62)}','ACTIVE','2026-10-26','2026-10-27');
  `)
}
async function read(date='2026-10-26', branch=null) {
  return (await db.query('select public.coordination_week_dashboard($1,$2) data',[date,branch])).rows[0].data
}
async function occurrence({id=70,date='2026-10-26',start='2026-10-26T09:00:00Z',end='2026-10-26T10:30:00Z',type='REGULAR',status='SCHEDULED',original=null,room=20}={}) {
  await db.query('insert into session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,room_id,status,occurrence_type,original_starts_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[uid(id),uid(40),date,start,end,uid(room),status,type,original])
}

test('SQL calendar contracts', async t => {
  await t.test('planned slots respect dates and pauses and do not leak other branches', async () => {
    await fixture(); const data=await read()
    assert.equal(data.rows.length,1); assert.equal(data.rows[0].status,'PLANNED')
    assert.deepEqual(data.rows[0].roster.map(row=>row.student_id),[uid(50)])
    assert.equal(data.branches.length,1); assert.equal((await read('2026-10-26',uid(2))).rows.length,0)
    assert.equal((await read('2026-10-19')).rows.length,0)
  })
  await t.test('rescheduled sessions replace their original slot across week boundaries', async () => {
    await fixture(); await occurrence({start:'2026-11-03T11:00:00Z',end:'2026-11-03T12:30:00Z',original:'2026-10-26T09:00:00Z',room:21})
    assert.equal((await read()).rows.length,0)
    const moved=(await read('2026-11-03')).rows.find(row=>row.session_id===uid(70))
    assert.equal(moved.room_name,'Piano 2'); assert.equal(moved.room_capacity,4)
    assert.equal(moved.roster_date,'2026-10-26')
  })
  await t.test('cancellation suppresses the planned slot and remains visible', async () => {
    await fixture(); await occurrence({status:'CANCELLED'})
    const rows=(await read()).rows; assert.equal(rows.length,1); assert.equal(rows[0].status,'CANCELLED')
  })
  await t.test('makeup uses only the canonical booked roster, not the whole class', async () => {
    await fixture(); await occurrence({type:'MAKEUP',start:'2026-10-27T09:00:00Z',end:'2026-10-27T10:30:00Z',date:'2026-10-27'})
    await db.exec(`insert into session_occurrence_participants values('${uid(70)}','${uid(60)}','ACTIVE'),('${uid(70)}','${uid(61)}','CANCELLED');`)
    const row=(await read()).rows.find(row=>row.session_id)
    assert.deepEqual(row.roster.map(r=>r.enrollment_id),[uid(60)])
  })
  await t.test('attendance and per-session substitute are read from authoritative records', async () => {
    await fixture(); await occurrence()
    await db.exec(`insert into attendance_records values('${uid(80)}','${uid(70)}','${uid(60)}','LATE'); insert into session_teacher_assignments(id,session_id,teacher_id,assignment_type,effective_status) values('${uid(90)}','${uid(70)}','${uid(31)}','SUBSTITUTE','ACTIVE');`)
    const row=(await read()).rows[0]
    assert.equal(row.teacher_name,'Substitute'); assert.equal(row.roster[0].attendance,'LATE')
  })
  await t.test('a booked guest from another class is counted once with their own attendance', async () => {
    await fixture(); await occurrence({type:'MAKEUP',date:'2026-10-27',start:'2026-10-27T09:00:00Z',end:'2026-10-27T10:30:00Z'})
    await db.exec(`insert into classes values('${uid(12)}','Guest class','G1','${uid(1)}',null,null,6,'ACTIVE','2026-10-26',null);
      insert into enrollments values('${uid(63)}','${uid(51)}','${uid(12)}','2026-10-26',null,'ACTIVE');
      insert into session_occurrence_participants values('${uid(70)}','${uid(60)}','ACTIVE'),('${uid(70)}','${uid(63)}','ACTIVE');
      insert into attendance_records values('${uid(81)}','${uid(70)}','${uid(63)}','PRESENT');`)
    const row=(await read()).rows.find(row=>row.session_id===uid(70))
    assert.equal(row.roster.length,2)
    assert.equal(row.roster.find(person=>person.enrollment_id===uid(63)).attendance,'PRESENT')
  })
  await t.test('a denied materialized session never reappears as a projected roster', async () => {
    await fixture(); await occurrence()
    await db.exec(`select set_config('test.session_denied','${uid(70)}',false);`)
    assert.equal((await read()).rows.length,0)
  })
  await t.test('more than 300 slots return without silent truncation', async () => {
    await fixture()
    await db.exec(`insert into schedules select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${uid(10)}','${uid(20)}','18:00','19:30','2026-10-26',null,'ACTIVE',2,'Asia/Ho_Chi_Minh' from generate_series(1000,1300) n;`)
    assert.equal((await read()).rows.length,302)
  })
  await t.test('class/session access alone does not grant operational roster or another branch scope', async () => {
    await fixture(); await occurrence()
    await db.exec("select set_config('test.ops','false',false);")
    await assert.rejects(read(),/CALENDAR_UNAUTHORIZED/)
    await db.exec(`select set_config('test.ops','true',false),set_config('test.placement_branch','${uid(2)}',false);`)
    const denied=await read()
    assert.equal(denied.rows.length,0); assert.equal(denied.branches.length,0)
  })
  await t.test('authenticated invocation is read-only; anon, inactive and missing identities fail', async () => {
    await fixture()
    await db.exec('set role authenticated;')
    assert.equal((await read()).rows.length,1)
    await db.exec(`select set_config('test.active','false',false);`)
    await assert.rejects(read(),/CALENDAR_UNAUTHORIZED/)
    await db.exec(`select set_config('test.active','true',false),set_config('test.uid','',false);`)
    await assert.rejects(read(),/CALENDAR_UNAUTHORIZED/)
    await db.exec('reset role; set role anon;')
    await assert.rejects(read(),/permission denied/)
    await db.exec('reset role;')
    assert.equal((await db.query('select count(*) n from session_occurrences')).rows[0].n,0)
    assert.equal((await db.query('select count(*) n from attendance_records')).rows[0].n,0)
  })
})
test.after(async()=>db.close())
