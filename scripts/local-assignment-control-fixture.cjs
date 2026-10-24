#!/usr/bin/env node
// Local-only fixture for the teacher assignment control center.
// Refuses any Supabase URL that is not loopback HTTP.
// Rollback: node scripts/local-assignment-control-fixture.cjs --reset
// Full local wipe: npx supabase db reset
// Do not point this script at a remote database.

const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')
const { localUrl, guardedFetch } = require('./local-bootstrap-admin.cjs')

const EMAIL = 'assignment.fixture@vibe.local'
const PASSWORD = 'LocalAssignment-Fixture-2026!'
const IDS = {
  branchA: 'f1e00000-0000-4000-8000-000000000001',
  branchB: 'f1e00000-0000-4000-8000-000000000002',
  curriculum: 'f1e00000-0000-4000-8000-000000000011',
  level: 'f1e00000-0000-4000-8000-000000000012',
  course: 'f1e00000-0000-4000-8000-000000000013',
  classA: 'f1e00000-0000-4000-8000-0000000000a1',
  classB: 'f1e00000-0000-4000-8000-0000000000a2',
  classC: 'f1e00000-0000-4000-8000-0000000000a3',
  classD: 'f1e00000-0000-4000-8000-0000000000a4',
  teacherA: 'f1e00000-0000-4000-8000-0000000000b1',
  teacherB: 'f1e00000-0000-4000-8000-0000000000b2',
  scheduleA: 'f1e00000-0000-4000-8000-0000000000c1',
  scheduleB: 'f1e00000-0000-4000-8000-0000000000c2',
  scheduleC: 'f1e00000-0000-4000-8000-0000000000c3',
  scheduleD: 'f1e00000-0000-4000-8000-0000000000c4',
  scheduleDone: 'f1e00000-0000-4000-8000-0000000000c5',
  sessionA: 'f1e00000-0000-4000-8000-0000000000d1',
  sessionB: 'f1e00000-0000-4000-8000-0000000000d2',
  sessionC: 'f1e00000-0000-4000-8000-0000000000d3',
  sessionD: 'f1e00000-0000-4000-8000-0000000000d4',
  sessionDone: 'f1e00000-0000-4000-8000-0000000000d5',
  sessionNext: 'f1e00000-0000-4000-8000-0000000000d6',
}

function readLocalStatus() {
  let output
  try {
    output = execFileSync(path.resolve(__dirname, '../node_modules/.bin/supabase'), ['status', '-o', 'env'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error('Local Supabase is unavailable. Run npx supabase start first.')
  }
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="([^"]*)"$/)
    if (match) values[match[1]] = match[2]
  }
  const url = localUrl(values.API_URL)
  if (!values.SERVICE_ROLE_KEY) throw new Error('Local Supabase service-role credential is missing.')
  return { url, key: values.SERVICE_ROLE_KEY }
}

function databaseContainer() {
  const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((name) => name.startsWith('supabase_db_'))
  if (names.length !== 1 || !names[0].includes('vibe-academy-system')) {
    throw new Error('Refusing fixture SQL: expected exactly one local vibe-academy database container.')
  }
  return names[0]
}

function psql(container, sql) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: sql,
    encoding: 'utf8',
  })
}

function cleanupSql() {
  const teachers = `'${IDS.teacherA}','${IDS.teacherB}'`
  const branches = `'${IDS.branchA}','${IDS.branchB}'`
  const sessions = `'${IDS.sessionA}','${IDS.sessionB}','${IDS.sessionC}','${IDS.sessionD}','${IDS.sessionDone}','${IDS.sessionNext}'`
  return `
begin;
alter table public.session_teacher_snapshots disable trigger guard_session_teacher_snapshot;
alter table public.session_teacher_assignments disable trigger guard_session_teacher_history;
delete from public.payroll_earning_lines where session_id in (${sessions}) or actual_teacher_id in (${teachers});
delete from public.teacher_payrolls where teacher_id in (${teachers});
delete from public.payroll_events where period_id in (select id from public.payroll_periods where branch_id in (${branches}));
delete from public.payroll_periods where branch_id in (${branches});
delete from public.teacher_compensation_rules where teacher_id in (${teachers});
delete from public.session_teacher_snapshots where session_id in (${sessions});
delete from public.session_teacher_assignments where session_id in (${sessions});
delete from public.session_occurrences where id in (${sessions});
delete from public.schedules where id in ('${IDS.scheduleA}','${IDS.scheduleB}','${IDS.scheduleC}','${IDS.scheduleD}','${IDS.scheduleDone}');
delete from public.class_teachers where class_id in ('${IDS.classA}','${IDS.classB}','${IDS.classC}','${IDS.classD}') or teacher_id in (${teachers});
delete from public.classes where id in ('${IDS.classA}','${IDS.classB}','${IDS.classC}','${IDS.classD}');
delete from public.courses where id = '${IDS.course}';
delete from public.curriculum_levels where id = '${IDS.level}';
delete from public.curriculums where id = '${IDS.curriculum}';
delete from public.teacher_branches where teacher_id in (${teachers});
delete from public.teachers where id in (${teachers});
delete from public.branches where id in (${branches});
alter table public.session_teacher_assignments enable trigger guard_session_teacher_history;
alter table public.session_teacher_snapshots enable trigger guard_session_teacher_snapshot;
commit;
`
}

function fixtureSql(userId) {
  return `
begin;
insert into public.branches (id, code, name) values
  ('${IDS.branchA}', 'ASSIGN-FIXTURE-A', 'Chi nhánh fixture A'),
  ('${IDS.branchB}', 'ASSIGN-FIXTURE-B', 'Chi nhánh fixture B');
insert into public.curriculums (id, code, name) values
  ('${IDS.curriculum}', 'ASSIGN-FIXTURE', 'Assignment Fixture Curriculum');
insert into public.curriculum_levels (id, curriculum_id, code, name, sequence_no) values
  ('${IDS.level}', '${IDS.curriculum}', 'ASSIGN-FIXTURE-L1', 'Assignment Fixture Level', 1);
insert into public.courses (id, curriculum_id, level_id, code, name) values
  ('${IDS.course}', '${IDS.curriculum}', '${IDS.level}', 'ASSIGN-FIXTURE-COURSE', 'Assignment Fixture Course');
insert into public.classes (id, branch_id, course_id, code, name, status) values
  ('${IDS.classA}', '${IDS.branchA}', '${IDS.course}', 'ASSIGN-FIXTURE-A', 'Lớp A Phân công chính', 'ACTIVE'),
  ('${IDS.classB}', '${IDS.branchA}', '${IDS.course}', 'ASSIGN-FIXTURE-B', 'Lớp B Chưa có giáo viên chính', 'ACTIVE'),
  ('${IDS.classC}', '${IDS.branchB}', '${IDS.course}', 'ASSIGN-FIXTURE-C', 'Lớp C Trùng lịch', 'ACTIVE'),
  ('${IDS.classD}', '${IDS.branchA}', '${IDS.course}', 'ASSIGN-FIXTURE-D', 'Lớp D Dạy thay', 'ACTIVE');
insert into public.teachers (id, teacher_code, full_name, status) values
  ('${IDS.teacherA}', 'ASSIGN-FIXTURE-A', 'Giáo viên A', 'ACTIVE'),
  ('${IDS.teacherB}', 'ASSIGN-FIXTURE-B', 'Giáo viên B', 'ACTIVE');
insert into public.teacher_branches (teacher_id, branch_id, is_primary) values
  ('${IDS.teacherA}', '${IDS.branchA}', true),
  ('${IDS.teacherA}', '${IDS.branchB}', false),
  ('${IDS.teacherB}', '${IDS.branchA}', true);
insert into public.class_teachers (class_id, teacher_id, teacher_role, is_active, assigned_at) values
  ('${IDS.classA}', '${IDS.teacherA}', 'PRIMARY', true, '2026-01-01'),
  ('${IDS.classC}', '${IDS.teacherA}', 'PRIMARY', true, '2026-01-01'),
  ('${IDS.classD}', '${IDS.teacherA}', 'PRIMARY', true, '2026-01-01');
insert into public.schedules (id, class_id, day_of_week, start_time, end_time, effective_from, timezone, status) values
  ('${IDS.scheduleA}', '${IDS.classA}', 1, '17:00', '18:00', '2026-01-01', 'Asia/Ho_Chi_Minh', 'ACTIVE'),
  ('${IDS.scheduleB}', '${IDS.classB}', 1, '10:00', '11:00', '2026-01-01', 'Asia/Ho_Chi_Minh', 'ACTIVE'),
  ('${IDS.scheduleC}', '${IDS.classC}', 1, '17:30', '18:30', '2026-01-01', 'Asia/Ho_Chi_Minh', 'ACTIVE'),
  ('${IDS.scheduleD}', '${IDS.classD}', 1, '09:00', '10:00', '2026-01-01', 'Asia/Ho_Chi_Minh', 'ACTIVE'),
  ('${IDS.scheduleDone}', '${IDS.classA}', 2, '08:00', '09:00', '2026-01-01', 'Asia/Ho_Chi_Minh', 'ACTIVE');
insert into public.session_occurrences (id, schedule_id, occurrence_date, starts_at, ends_at, status)
select v.id::uuid, v.schedule_id::uuid, d.today + v.day_offset,
  ((d.today + v.day_offset)::timestamp + v.start_at::time) at time zone 'Asia/Ho_Chi_Minh',
  ((d.today + v.day_offset)::timestamp + v.end_at::time) at time zone 'Asia/Ho_Chi_Minh',
  'SCHEDULED'
from (values
  ('${IDS.sessionA}', '${IDS.scheduleA}', 1, '17:00', '18:00'),
  ('${IDS.sessionB}', '${IDS.scheduleB}', 1, '10:00', '11:00'),
  ('${IDS.sessionC}', '${IDS.scheduleC}', 1, '17:30', '18:30'),
  ('${IDS.sessionD}', '${IDS.scheduleD}', 2, '09:00', '10:00'),
  ('${IDS.sessionNext}', '${IDS.scheduleD}', 3, '09:00', '10:00'),
  ('${IDS.sessionDone}', '${IDS.scheduleDone}', 0, '00:10', '00:40')
) as v(id, schedule_id, day_offset, start_at, end_at)
cross join (select (now() at time zone 'Asia/Ho_Chi_Minh')::date as today) d;
insert into public.session_teacher_assignments (session_id, teacher_id, assignment_type, reason, assigned_by) values
  ('${IDS.sessionD}', '${IDS.teacherB}', 'SUBSTITUTE', 'Giáo viên A nghỉ buổi này', '${userId}'),
  ('${IDS.sessionDone}', '${IDS.teacherB}', 'SUBSTITUTE', 'Giáo viên A nghỉ buổi đã hoàn tất', '${userId}');
update public.session_occurrences set status = 'COMPLETED' where id = '${IDS.sessionDone}';
insert into public.teacher_compensation_rules (teacher_id, branch_id, pay_type, rate, currency, effective_from, created_by)
select '${IDS.teacherB}', '${IDS.branchA}', 'HOURLY', 100000, 'VND', date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')::date)::date, '${userId}';
insert into public.payroll_periods (branch_id, starts_on, ends_on)
select '${IDS.branchA}', date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')::date)::date, (date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')::date) + interval '1 month - 1 day')::date;
commit;
`
}

async function ensureReviewer(url, key) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: guardedFetch(url) },
  })
  const { data: role, error: roleError } = await client.from('roles').select('id').eq('code', 'SUPER_ADMIN').single()
  if (roleError || !role) throw new Error('SUPER_ADMIN role is unavailable.')
  let user
  for (let page = 1; page < 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error('Cannot list local auth users.')
    user = data.users.find((item) => item.email?.toLowerCase() === EMAIL)
    if (user || data.users.length < 100) break
  }
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
    if (error || !data.user) throw new Error('Cannot create local fixture reviewer.')
    user = data.user
  } else {
    const { error } = await client.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true })
    if (error) throw new Error('Cannot refresh local fixture reviewer credentials.')
  }
  const { error: profileError } = await client.from('profiles').upsert(
    { id: user.id, full_name: 'Assignment Fixture Reviewer' },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (profileError) throw new Error('Cannot ensure local fixture profile.')
  const { data: assignments, error: assignmentError } = await client.from('user_roles').select('id').eq('user_id', user.id).eq('role_id', role.id).is('branch_id', null)
  if (assignmentError) throw new Error('Cannot read local role assignments.')
  if (!assignments.length) {
    const { error } = await client.from('user_roles').insert({ user_id: user.id, role_id: role.id })
    if (error && error.code !== '23505') throw new Error('Cannot assign local SUPER_ADMIN.')
  }
  return user.id
}

function payrollSql(userId) {
  return `
begin;
select set_config('request.jwt.claim.sub', '${userId}', true);
select public.generate_teacher_payroll(id) from public.payroll_periods where branch_id = '${IDS.branchA}' and status = 'DRAFT';
commit;
select s.session_id, s.primary_teacher_id, s.teacher_id actual_teacher_id, s.assignment_type, s.is_locked,
       snap.teacher_id snapshot_teacher_id,
       line.actual_teacher_id payroll_actual_teacher_id
from public.session_actual_teachers s
left join public.session_teacher_snapshots snap on snap.session_id = s.session_id
left join public.payroll_earning_lines line on line.session_id = s.session_id
where s.session_id in ('${IDS.sessionA}','${IDS.sessionB}','${IDS.sessionC}','${IDS.sessionD}','${IDS.sessionDone}','${IDS.sessionNext}')
order by s.starts_at;
`
}

async function main() {
  const reset = process.argv.includes('--reset')
  if (process.argv.some((arg) => arg !== '--reset' && arg !== process.argv[0] && arg !== process.argv[1])) {
    throw new Error('Usage: node scripts/local-assignment-control-fixture.cjs [--reset]')
  }
  const { url } = readLocalStatus()
  const container = databaseContainer()
  if (reset) {
    psql(container, cleanupSql())
    console.log(`PASS: local assignment fixture removed from ${url}.`)
    return
  }
  const { key } = readLocalStatus()
  const userId = await ensureReviewer(url, key)
  psql(container, cleanupSql())
  psql(container, fixtureSql(userId))
  let payroll = ''
  try {
    payroll = psql(container, payrollSql(userId))
  } catch (error) {
    payroll = `PAYROLL_GENERATE_FAILED\n${error.stderr || error.message}`
  }
  console.log(`PASS: local assignment fixture ready at ${url}`)
  console.log(`reviewer=${EMAIL}`)
  console.log(`class_b=${IDS.classB}`)
  console.log(`session_substitute=${IDS.sessionD}`)
  console.log(`session_completed=${IDS.sessionDone}`)
  console.log(`branch_a=${IDS.branchA}`)
  console.log(payroll)
}

main().catch((error) => {
  console.error(error.message && error.message.startsWith('REFUSED') ? error.message : `FAILED: ${error.message}`)
  process.exitCode = 1
})
