// Disposable PostgreSQL contract fixture. Existing authorization helpers are
// fixture dependencies, not a replacement for Supabase assignment/RLS tests.
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const tools = process.env.VIBE_VIDEO_TEST_TOOLS
  ? createRequire(path.join(process.env.VIBE_VIDEO_TEST_TOOLS, 'package.json')) : require
const { PGlite } = tools('@electric-sql/pglite')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ids = { admin: id(1), parent: id(2), studentUser: id(3), teacher: id(4), stranger: id(5), branchAdmin: id(6), disabled: id(7), learner: id(10), otherLearner: id(11), program: id(20), otherProgram: id(21), curriculum: id(30), otherCurriculum: id(31), level: id(40), otherLevel: id(41), subject: id(50), otherSubject: id(51), component: id(60), otherComponent: id(61), lesson: id(70), otherLesson: id(71) }

async function createFixture() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    create table public.fixture_access(user_id uuid primary key,role text,student_id uuid,active boolean default true);
    create function public.has_role(role_code text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
      select exists(select 1 from fixture_access where user_id=auth.uid() and role=role_code and active)
    $$;
    create function public.teacher_can_read_student_academic(p_student uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
      select exists(select 1 from fixture_access where user_id=auth.uid() and role='TEACHER' and student_id=p_student and active)
    $$;
    create function public.can_read_family_academic(p_student uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
      select public.has_role('SUPER_ADMIN') or exists(select 1 from fixture_access where user_id=auth.uid() and role in ('PARENT','STUDENT') and student_id=p_student and active)
    $$;
    create table student_curriculum_enrollments(id uuid primary key,student_id uuid,curriculum_id uuid,status text default 'ACTIVE');
    create table curriculum_levels(id uuid primary key,curriculum_id uuid,name text,sequence_no int);
    create table student_level_progress(id uuid primary key,enrollment_id uuid,level_id uuid,status text default 'IN_PROGRESS');
    create table curriculum_subjects(id uuid primary key,level_id uuid,name text,sort_order int);
    create table curriculum_subject_components(id uuid primary key,subject_id uuid,name text,sort_order int);
    create table curriculum_component_items(id uuid primary key,component_id uuid,name text,sort_order int);
  `)
  for (const [user, role, student, active] of [
    [ids.admin, 'SUPER_ADMIN', null, true], [ids.parent, 'PARENT', ids.learner, true],
    [ids.studentUser, 'STUDENT', ids.learner, true], [ids.teacher, 'TEACHER', ids.learner, true],
    [ids.stranger, 'PARENT', ids.otherLearner, true], [ids.branchAdmin, 'BRANCH_ADMIN', ids.learner, true],
    [ids.disabled, 'SUPER_ADMIN', null, false],
  ]) {
    await db.query('insert into auth.users values ($1)', [user])
    await db.query('insert into fixture_access values ($1,$2,$3,$4)', [user, role, student, active])
  }
  for (const [program, student, curriculum, level, subject, component, lesson, name] of [
    [ids.program, ids.learner, ids.curriculum, ids.level, ids.subject, ids.component, ids.lesson, 'Piano Pre Step'],
    [ids.otherProgram, ids.otherLearner, ids.otherCurriculum, ids.otherLevel, ids.otherSubject, ids.otherComponent, ids.otherLesson, 'Guitar Pre'],
  ]) {
    await db.query('insert into student_curriculum_enrollments(id,student_id,curriculum_id) values ($1,$2,$3)', [program, student, curriculum])
    await db.query('insert into curriculum_levels values ($1,$2,$3,1)', [level, curriculum, name])
    await db.query('insert into student_level_progress(id,enrollment_id,level_id) values ($1,$2,$3)', [program, program, level])
    await db.query("insert into curriculum_subjects values ($1,$2,'Methode Book',1)", [subject, level])
    await db.query("insert into curriculum_subject_components values ($1,$2,'Bài thực hành',1)", [component, subject])
    await db.query("insert into curriculum_component_items values ($1,$2,'Lesson 1',1)", [lesson, component])
  }
  await db.exec(fs.readFileSync(path.resolve('supabase/migrations/20261004183000_academic_video_links.sql'), 'utf8'))
  await db.exec(fs.readFileSync(path.resolve('supabase/migrations/20261005020000_academic_video_lesson_required.sql'), 'utf8'))
  async function identity(user = ids.admin, role = 'authenticated') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || ''])
    if (!['authenticated', 'anon', 'service_role'].includes(role)) throw new Error('Invalid fixture role')
    await db.exec(`set role ${role}`)
  }
  async function context(student = ids.learner, enrollment = ids.program) {
    return (await db.query('select academic_video_link_context($1,$2) as result', [student, enrollment])).rows[0].result
  }
  async function save(overrides = {}) {
    const p = { student: ids.learner, enrollment: ids.program, id: null, version: 0, title: 'Bài biểu diễn Lesson 1', url: 'https://www.youtube.com/watch?v=abcdefghijk', note: 'Giữ nhịp đều hơn ở đoạn cuối.', level: ids.level, item: ids.lesson, shared: false, ...overrides }
    return (await db.query('select save_academic_video_link($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id', Object.values(p))).rows[0].id
  }
  async function remove(link, version, student = ids.learner, enrollment = ids.program) {
    await db.query('select remove_academic_video_link($1,$2,$3,$4)', [student, enrollment, link, version])
  }
  await identity()
  return { db, identity, context, save, remove }
}
module.exports = { createFixture, ids, tools }
