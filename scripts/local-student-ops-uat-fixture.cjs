#!/usr/bin/env node
// Local-only fixture for the student operations pilot.
// Refuses any Supabase URL that is not loopback HTTP.
// node scripts/local-student-ops-uat-fixture.cjs
// node scripts/local-student-ops-uat-fixture.cjs --view-only
// node scripts/local-student-ops-uat-fixture.cjs --restore-manage

const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')
const { localUrl, guardedFetch } = require('./local-bootstrap-admin.cjs')

const PASSWORD = 'LocalStudentOps-Fixture-2026!'
const SUPER_EMAIL = 'student-ops.super@vibe.local'
const BRANCH_EMAIL = 'student-ops.branch-a@vibe.local'
const IDS = {
  branchA: 'f8100000-0000-4000-8000-000000000001',
  branchB: 'f8100000-0000-4000-8000-000000000002',
  curriculum: 'f8300000-0000-4000-8000-000000000001',
  level: 'f8300000-0000-4000-8000-000000000002',
  course: 'f8300000-0000-4000-8000-000000000003',
  classA1: 'f8300000-0000-4000-8000-000000000011',
  classA2: 'f8300000-0000-4000-8000-000000000012',
  classB1: 'f8300000-0000-4000-8000-000000000013',
  open: 'f8600000-0000-4000-8000-b20000000001',
  future: 'f8600000-0000-4000-8000-b20000000002',
  today: 'f8600000-0000-4000-8000-b20000000003',
  other: 'f8600000-0000-4000-8000-b20000000004',
  previousOpen: 'f8600000-0000-4000-8000-a10000000001',
  previousFuture: 'f8600000-0000-4000-8000-a10000000002',
  previousToday: 'f8600000-0000-4000-8000-a10000000003',
  previousOther: 'f8600000-0000-4000-8000-a10000000004',
}

function readLocalStatus() {
  const output = execFileSync(path.resolve(__dirname, '../node_modules/.bin/supabase'), ['status', '-o', 'env'], {
    cwd: path.resolve(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
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

function psql(sql) {
  return execFileSync('docker', ['exec', '-i', databaseContainer(), 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], {
    input: sql,
    encoding: 'utf8',
  })
}

async function ensureUser(client, email, name) {
  let user
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error('Cannot list local auth users.')
    user = data.users.find(item => item.email?.toLowerCase() === email)
    if (user || data.users.length < 100) break
  }
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
    if (error || !data.user) throw new Error(`Cannot create ${email}.`)
    user = data.user
  }
  const { error } = await client.from('profiles').upsert({ id: user.id, full_name: name, status: 'ACTIVE' }, { onConflict: 'id' })
  if (error) throw new Error(`Cannot ensure profile for ${email}.`)
  return user.id
}

function permissionSql(mode) {
  if (mode === 'revoke') {
    return `
      delete from public.role_permissions
      where role_id = (select id from public.roles where code = 'BRANCH_ADMIN')
        and permission_id = (select id from public.permissions where code = 'student_placement.manage');
    `
  }
  return `
    insert into public.role_permissions(role_id, permission_id)
    select r.id, p.id
    from public.roles r
    join public.permissions p on p.code = 'student_placement.manage'
    where r.code = 'BRANCH_ADMIN'
    on conflict do nothing;
  `
}

function seedSql(superId, branchId) {
  return `
    alter table public.student_placement_cases disable trigger user;
    alter table public.student_placement_events disable trigger user;
    alter table public.registration_applications disable trigger user;
    alter table public.registration_application_events disable trigger user;
    delete from public.student_placement_events where placement_id in (
      select id from public.student_placement_cases where registration_application_id in ('${IDS.open}','${IDS.future}','${IDS.today}','${IDS.other}','${IDS.previousOpen}','${IDS.previousFuture}','${IDS.previousToday}','${IDS.previousOther}')
    );
    delete from public.student_placement_cases where registration_application_id in ('${IDS.open}','${IDS.future}','${IDS.today}','${IDS.other}','${IDS.previousOpen}','${IDS.previousFuture}','${IDS.previousToday}','${IDS.previousOther}');
    delete from public.registration_application_events where application_id in ('${IDS.open}','${IDS.future}','${IDS.today}','${IDS.other}','${IDS.previousOpen}','${IDS.previousFuture}','${IDS.previousToday}','${IDS.previousOther}');
    delete from public.registration_applications where id in ('${IDS.open}','${IDS.future}','${IDS.today}','${IDS.other}','${IDS.previousOpen}','${IDS.previousFuture}','${IDS.previousToday}','${IDS.previousOther}');
    delete from public.student_parents where student_id in (select id from public.students where full_name like 'UAT Ops %');
    delete from public.enrollments where student_id in (select id from public.students where full_name like 'UAT Ops %');
    delete from public.students where full_name like 'UAT Ops %';
    alter table public.student_placement_cases enable trigger user;
    alter table public.student_placement_events enable trigger user;
    alter table public.registration_applications enable trigger user;
    alter table public.registration_application_events enable trigger user;

    insert into public.branches(id, code, name) values
      ('${IDS.branchA}', 'UAT-OPS-A', 'UAT Ops A'),
      ('${IDS.branchB}', 'UAT-OPS-B', 'UAT Ops B')
    on conflict (id) do nothing;
    insert into public.curriculums(id, code, name) values
      ('${IDS.curriculum}', 'UAT-OPS-CUR', 'UAT Ops Curriculum')
    on conflict (id) do nothing;
    insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values
      ('${IDS.level}', '${IDS.curriculum}', 'UAT-OPS-L', 'So cap', 1)
    on conflict (id) do nothing;
    insert into public.courses(id, curriculum_id, level_id, code, name) values
      ('${IDS.course}', '${IDS.curriculum}', '${IDS.level}', 'UAT-OPS-PIANO', 'Piano')
    on conflict (id) do nothing;
    insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status) values
      ('${IDS.classA1}', '${IDS.branchA}', '${IDS.course}', 'UAT-OPS-A1', 'Lop A1', 'GROUP', 8, 'ACTIVE'),
      ('${IDS.classA2}', '${IDS.branchA}', '${IDS.course}', 'UAT-OPS-A2', 'Lop A2', 'GROUP', 8, 'ACTIVE'),
      ('${IDS.classB1}', '${IDS.branchB}', '${IDS.course}', 'UAT-OPS-B1', 'Lop B1', 'GROUP', 8, 'ACTIVE')
    on conflict (id) do nothing;
    insert into public.user_roles(user_id, role_id)
    select '${superId}', id from public.roles where code = 'SUPER_ADMIN'
      and not exists (
        select 1 from public.user_roles ur
        where ur.user_id = '${superId}' and ur.role_id = public.roles.id and ur.branch_id is null
      );
    insert into public.user_roles(user_id, role_id, branch_id)
    select '${branchId}', id, '${IDS.branchA}' from public.roles where code = 'BRANCH_ADMIN'
      and not exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = '${branchId}' and r.code = 'BRANCH_ADMIN' and ur.branch_id = '${IDS.branchA}'
      );
    ${permissionSql('restore')}
    select set_config('request.jwt.claim.sub', '${superId}', false);
    select set_config('request.jwt.claim.role', 'authenticated', false);
    select public.create_registration_application('${IDS.open}', '${IDS.branchA}', null, 'UAT Ops Open', '2015-01-01', 'Phu Open', null, 'Piano', null, public.registration_vietnam_today() + 21, 'Thu 2 18:00');
    select public.transition_registration_application('f8610000-0000-4000-8000-000000000001', '${IDS.open}', 1, 'SUBMIT');
    select public.transition_registration_application('f8610000-0000-4000-8000-000000000002', '${IDS.open}', 2, 'VERIFY');
    select public.complete_registration_application('f8620000-0000-4000-8000-000000000001', '${IDS.open}', 3, null, null);
    select public.create_registration_application('${IDS.future}', '${IDS.branchA}', null, 'UAT Ops Future', '2014-02-02', 'Phu Future', null, 'Piano', null, public.registration_vietnam_today() + 30, 'Thu 4 18:00');
    select public.transition_registration_application('f8610000-0000-4000-8000-000000000003', '${IDS.future}', 1, 'SUBMIT');
    select public.transition_registration_application('f8610000-0000-4000-8000-000000000004', '${IDS.future}', 2, 'VERIFY');
    select public.complete_registration_application('f8620000-0000-4000-8000-000000000002', '${IDS.future}', 3, null, null);
    select public.assign_student_placement('f8630000-0000-4000-8000-000000000002', (select id from public.student_placement_cases where registration_application_id = '${IDS.future}'), 1, '${IDS.classA1}', public.registration_vietnam_today() + 30);
    select public.create_registration_application('${IDS.today}', '${IDS.branchA}', null, 'UAT Ops Today', '2013-03-03', 'Phu Today', null, 'Piano', null, public.registration_vietnam_today(), 'Thu 6 18:00');
    select public.transition_registration_application('f8610000-0000-4000-8000-000000000005', '${IDS.today}', 1, 'SUBMIT');
    select public.transition_registration_application('f8610000-0000-4000-8000-000000000006', '${IDS.today}', 2, 'VERIFY');
    select public.complete_registration_application('f8620000-0000-4000-8000-000000000003', '${IDS.today}', 3, null, null);
    select public.assign_student_placement('f8630000-0000-4000-8000-000000000003', (select id from public.student_placement_cases where registration_application_id = '${IDS.today}'), 1, '${IDS.classA1}', public.registration_vietnam_today());
    select public.create_registration_application('${IDS.other}', '${IDS.branchB}', null, 'UAT Ops Other', '2012-04-04', 'Phu Other', null, 'Piano', null, public.registration_vietnam_today() + 14, 'Thu 3 18:00');
    select public.transition_registration_application('f8610000-0000-4000-8000-000000000007', '${IDS.other}', 1, 'SUBMIT');
    select public.transition_registration_application('f8610000-0000-4000-8000-000000000008', '${IDS.other}', 2, 'VERIFY');
    select public.complete_registration_application('f8620000-0000-4000-8000-000000000004', '${IDS.other}', 3, null, null);
    select public.assign_student_placement('f8630000-0000-4000-8000-000000000004', (select id from public.student_placement_cases where registration_application_id = '${IDS.other}'), 1, '${IDS.classB1}', public.registration_vietnam_today() + 14);
  `
}

async function main() {
  const mode = process.argv.includes('--view-only') ? 'revoke' : process.argv.includes('--restore-manage') ? 'restore' : 'seed'
  if (mode !== 'seed') {
    psql(permissionSql(mode))
    console.log(mode === 'revoke' ? 'LOCAL: student_placement.manage removed from BRANCH_ADMIN.' : 'LOCAL: student_placement.manage restored for BRANCH_ADMIN.')
    return
  }
  const { url, key } = readLocalStatus()
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: guardedFetch(url) },
  })
  const superId = await ensureUser(client, SUPER_EMAIL, 'UAT Ops Super')
  const branchId = await ensureUser(client, BRANCH_EMAIL, 'UAT Ops Branch A')
  psql(seedSql(superId, branchId))
  console.log('LOCAL student operations fixture ready.')
  console.log(`Super: ${SUPER_EMAIL}`)
  console.log(`Branch A: ${BRANCH_EMAIL}`)
}

main().catch(error => {
  console.error(error.message || 'Fixture failed.')
  process.exitCode = 1
})
