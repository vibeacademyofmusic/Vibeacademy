/* Local integration test: two real Postgres connections compete for one room,
 * teacher slots, and one student/class enrollment. TEST fixtures are removed in finally.
 * Never point this script at a remote database. */
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const assert = require('node:assert/strict')

const container = process.env.SCHEDULE_TEST_DB_CONTAINER || 'supabase_db_vibe-academy-system'
assert.match(container, /^supabase_db_vibe-[a-z0-9-]+$/,
  'Concurrency test requires a dedicated local Supabase container')
const prefix = 'f3500000-0000-4000-8000-'
const psql = ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1']

function query(input) {
  return execFileSync('docker', psql, { input, encoding: 'utf8' }).trim()
}

function session(input, marker, holdOpen = false) {
  const child = spawn('docker', psql)
  let output = ''
  let readyResolve
  const ready = new Promise(resolve => { readyResolve = resolve })
  child.stdout.on('data', chunk => {
    output += chunk
    if (output.includes(marker)) readyResolve()
  })
  child.stderr.on('data', chunk => { output += chunk })
  const done = new Promise(resolve => child.on('close', code => {
    readyResolve()
    resolve({ code, output })
  }))
  if (holdOpen) child.stdin.write(input)
  else child.stdin.end(input)
  return { ready, done, finish: sql => {
    if (!child.stdin.destroyed) child.stdin.end(sql)
  }, abort: () => child.kill('SIGTERM') }
}

async function waitReady(held, label) {
  let timer
  try {
    await Promise.race([
      held.ready,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not reach its transaction marker`)), 45000)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

function cleanup() {
  query(`begin;
    delete from public.enrollments where class_id in (select id from public.classes where id::text like '${prefix}%');
    delete from public.student_curriculum_enrollments where student_id in (select id from public.students where id::text like '${prefix}%');
    delete from public.students where id::text like '${prefix}%';
    delete from public.session_occurrences where schedule_id in (select id from public.schedules where class_id in (select id from public.classes where id::text like '${prefix}%'));
    delete from public.schedules where class_id in (select id from public.classes where id::text like '${prefix}%');
    delete from public.class_teachers where class_id in (select id from public.classes where id::text like '${prefix}%');
    delete from public.classes where id::text like '${prefix}%';
    delete from public.teachers where id::text like '${prefix}%';
    delete from public.rooms where id::text like '${prefix}%';
    delete from public.courses where id::text like '${prefix}%';
    delete from public.curriculum_levels where id::text like '${prefix}%';
    delete from public.curriculums where id::text like '${prefix}%';
    delete from public.branches where id::text like '${prefix}%';
    commit;`)
}

async function main() {
  const fixtureTables = ['branches', 'curriculums', 'curriculum_levels', 'courses',
    'classes', 'rooms', 'teachers', 'schedules', 'students', 'enrollments']
  const fixtureCount = query(fixtureTables.map(table =>
    `select count(*) as n from public.${table} where id::text like '${prefix}%'`).join(' union all '))
  assert.ok(fixtureCount.split('\n').every(count => count === '0'),
    'TEST fixture already exists; refusing to alter it')
  const source = fs.readFileSync('supabase/tests/database/schedule_room_atomic_guard_test.sql', 'utf8')
  const fixture = source.slice(source.indexOf('insert into public.branches'), source.indexOf('select lives_ok($$insert into public.schedules'))
  query(`begin;\n${fixture}\ncommit;`)
  console.log('Local TEST fixture ready')
  let heldOccurrence
  try {
    const common = `room_id, day_of_week, start_time, end_time, effective_from, status) values `
    const target = `'f3500000-0000-4000-8000-000000000050',
      extract(isodow from current_date + 2)::smallint, '16:00', '17:00', current_date + 2, 'ACTIVE'`
    const book = classId => `insert into public.schedules(class_id, ${common}('${classId}', ${target});`
    const first = session(`begin; ${book('f3500000-0000-4000-8000-000000000041')}
      select 'room_claimed'; select pg_sleep(2); commit;`, 'room_claimed')
    await waitReady(first, 'room booking')
    const second = session(`begin; ${book('f3500000-0000-4000-8000-000000000042')} commit;`, 'unused')
    const [a, b] = await Promise.all([first.done, second.done])
    assert.equal(a.code, 0, a.output)
    assert.notEqual(b.code, 0, b.output)
    assert.match(b.output, /SCHEDULE_ROOM_CONFLICT/)
    assert.equal(query(`select count(*) from public.schedules
      where room_id='f3500000-0000-4000-8000-000000000050'
        and day_of_week=extract(isodow from current_date + 2)::smallint
        and start_time='16:00'`), '1')

    query(`begin;
      insert into public.rooms(id, branch_id, code, name, capacity, status) values
        ('f3500000-0000-4000-8000-000000000055','f3500000-0000-4000-8000-000000000001','TEST-ROOM-5','TEST Room 5',6,'ACTIVE'),
        ('f3500000-0000-4000-8000-000000000056','f3500000-0000-4000-8000-000000000001','TEST-ROOM-6','TEST Room 6',6,'ACTIVE'),
        ('f3500000-0000-4000-8000-000000000057','f3500000-0000-4000-8000-000000000001','TEST-ROOM-7','TEST Room 7',6,'ACTIVE'),
        ('f3500000-0000-4000-8000-000000000058','f3500000-0000-4000-8000-000000000001','TEST-ROOM-8','TEST Room 8',6,'ACTIVE'),
        ('f3500000-0000-4000-8000-000000000059','f3500000-0000-4000-8000-000000000001','TEST-ROOM-9','TEST Room 9',6,'ACTIVE'),
        ('f3500000-0000-4000-8000-00000000005a','f3500000-0000-4000-8000-000000000001','TEST-ROOM-10','TEST Room 10',6,'ACTIVE');
      insert into public.classes(id,branch_id,course_id,code,name,class_type,capacity,status) values
        ('f3500000-0000-4000-8000-000000000045','f3500000-0000-4000-8000-000000000001','f3500000-0000-4000-8000-000000000031','TEST-ROOM-F','TEST Guitar F','GROUP',2,'ACTIVE'),
        ('f3500000-0000-4000-8000-000000000046','f3500000-0000-4000-8000-000000000001','f3500000-0000-4000-8000-000000000031','TEST-ROOM-G','TEST Guitar G','GROUP',2,'ACTIVE'),
        ('f3500000-0000-4000-8000-000000000047','f3500000-0000-4000-8000-000000000001','f3500000-0000-4000-8000-000000000031','TEST-ROOM-H','TEST Guitar H','GROUP',2,'ACTIVE'),
        ('f3500000-0000-4000-8000-000000000048','f3500000-0000-4000-8000-000000000001','f3500000-0000-4000-8000-000000000031','TEST-ROOM-I','TEST Guitar I','GROUP',2,'ACTIVE');
      insert into public.class_teachers(class_id,teacher_id,teacher_role,assigned_at) values
        ('f3500000-0000-4000-8000-000000000043','f3500000-0000-4000-8000-000000000060','PRIMARY',current_date),
        ('f3500000-0000-4000-8000-000000000044','f3500000-0000-4000-8000-000000000060','PRIMARY',current_date),
        ('f3500000-0000-4000-8000-000000000045','f3500000-0000-4000-8000-000000000061','ASSISTANT',current_date),
        ('f3500000-0000-4000-8000-000000000046','f3500000-0000-4000-8000-000000000061','ASSISTANT',current_date),
        ('f3500000-0000-4000-8000-000000000047','f3500000-0000-4000-8000-000000000060','PRIMARY',current_date),
        ('f3500000-0000-4000-8000-000000000048','f3500000-0000-4000-8000-000000000060','PRIMARY',current_date);
      commit;`)
    const primarySchedule = (classSuffix, roomSuffix) => `insert into public.schedules(class_id,room_id,day_of_week,start_time,end_time,effective_from,effective_to,status)
      values('f3500000-0000-4000-8000-0000000000${classSuffix}',
        'f3500000-0000-4000-8000-0000000000${roomSuffix}',
        extract(isodow from current_date + 1)::smallint,'18:00','19:00',current_date + 1,current_date + 21,'ACTIVE');`
    const firstPrimary = session(`begin; ${primarySchedule('43', '55')}
      select 'teacher_primary_claimed'; select pg_sleep(2); commit;`, 'teacher_primary_claimed')
    await waitReady(firstPrimary, 'primary teacher booking')
    const secondPrimary = session(`begin; ${primarySchedule('44', '56')} commit;`, 'unused')
    const [primaryA, primaryB] = await Promise.all([firstPrimary.done, secondPrimary.done])
    assert.equal(primaryA.code, 0, primaryA.output)
    assert.notEqual(primaryB.code, 0, primaryB.output)
    assert.match(primaryB.output, /A primary teacher already has two overlapping teaching shifts/)
    assert.equal(query(`select count(*) from public.schedules where class_id in
      ('f3500000-0000-4000-8000-000000000043','f3500000-0000-4000-8000-000000000044')
      and status='ACTIVE'`), '1')

    const assistantSchedule = (classSuffix, roomSuffix) => `insert into public.schedules(class_id,room_id,day_of_week,start_time,end_time,effective_from,effective_to,status)
      values('f3500000-0000-4000-8000-0000000000${classSuffix}',
        'f3500000-0000-4000-8000-0000000000${roomSuffix}',
        extract(isodow from current_date + 2)::smallint,'20:00','21:00',current_date + 2,current_date + 22,'ACTIVE');`
    const firstAssistant = session(`begin; ${assistantSchedule('45', '57')}
      select 'teacher_assistant_claimed'; select pg_sleep(2); commit;`, 'teacher_assistant_claimed')
    await waitReady(firstAssistant, 'assistant teacher booking')
    const secondAssistant = session(`begin; ${assistantSchedule('46', '58')} commit;`, 'unused')
    const [assistantA, assistantB] = await Promise.all([firstAssistant.done, secondAssistant.done])
    assert.equal(assistantA.code, 0, assistantA.output)
    assert.notEqual(assistantB.code, 0, assistantB.output)
    assert.match(assistantB.output, /A teacher assigned to this class is already teaching another class at that time/)
    assert.equal(query(`select count(*) from public.schedules where class_id in
      ('f3500000-0000-4000-8000-000000000045','f3500000-0000-4000-8000-000000000046')
      and status='ACTIVE'`), '1')

    query(`begin;
      insert into public.schedules(id,class_id,room_id,day_of_week,start_time,end_time,effective_from,effective_to,status) values
        ('f3500000-0000-4000-8000-000000000072','f3500000-0000-4000-8000-000000000047','f3500000-0000-4000-8000-000000000059',extract(isodow from current_date + 3)::smallint,'16:00','17:00',current_date + 3,current_date + 24,'ACTIVE'),
        ('f3500000-0000-4000-8000-000000000073','f3500000-0000-4000-8000-000000000048','f3500000-0000-4000-8000-00000000005a',extract(isodow from current_date + 3)::smallint,'17:00','18:00',current_date + 3,current_date + 24,'ACTIVE');
      insert into public.session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,room_id) values
        ('f3500000-0000-4000-8000-000000000074','f3500000-0000-4000-8000-000000000070',current_date + 1,(current_date + 1 + '18:00'::time) at time zone 'Asia/Ho_Chi_Minh',(current_date + 1 + '19:00'::time) at time zone 'Asia/Ho_Chi_Minh','f3500000-0000-4000-8000-000000000050'),
        ('f3500000-0000-4000-8000-000000000075','f3500000-0000-4000-8000-000000000072',current_date + 3,(current_date + 3 + '16:00'::time) at time zone 'Asia/Ho_Chi_Minh',(current_date + 3 + '17:00'::time) at time zone 'Asia/Ho_Chi_Minh','f3500000-0000-4000-8000-000000000059'),
        ('f3500000-0000-4000-8000-000000000076','f3500000-0000-4000-8000-000000000073',current_date + 3,(current_date + 3 + '17:00'::time) at time zone 'Asia/Ho_Chi_Minh',(current_date + 3 + '18:00'::time) at time zone 'Asia/Ho_Chi_Minh','f3500000-0000-4000-8000-00000000005a');
      commit;`)
    const movedSlot = occurrenceId => `update public.session_occurrences set
      starts_at=(current_date + 1 + '18:00'::time) at time zone 'Asia/Ho_Chi_Minh',
      ends_at=(current_date + 1 + '19:00'::time) at time zone 'Asia/Ho_Chi_Minh'
      where id='f3500000-0000-4000-8000-0000000000${occurrenceId}';`
    const firstMoved = session(`begin; ${movedSlot('75')}
      select 'teacher_occurrence_claimed'; select pg_sleep(2); commit;`, 'teacher_occurrence_claimed')
    await waitReady(firstMoved, 'concrete teacher booking')
    const secondMoved = session(`begin; ${movedSlot('76')} commit;`, 'unused')
    const [movedA, movedB] = await Promise.all([firstMoved.done, secondMoved.done])
    assert.equal(movedA.code, 0, movedA.output)
    assert.notEqual(movedB.code, 0, movedB.output)
    assert.match(movedB.output, /A primary teacher already has two overlapping teaching shifts/)
    assert.equal(query(`select count(*) from public.session_occurrences where id in
      ('f3500000-0000-4000-8000-000000000075','f3500000-0000-4000-8000-000000000076')
      and starts_at=(current_date + 1 + '18:00'::time) at time zone 'Asia/Ho_Chi_Minh'`), '1')
    query(`delete from public.session_occurrences where id in
      ('f3500000-0000-4000-8000-000000000074','f3500000-0000-4000-8000-000000000075','f3500000-0000-4000-8000-000000000076')`)

    query(`begin;
      insert into public.students(id,student_code,full_name,default_branch_id,status)
      values('f3500000-0000-4000-8000-000000000080','TEST-ROOM-STUDENT','TEST Student',
        'f3500000-0000-4000-8000-000000000001','ACTIVE');
      insert into public.student_curriculum_enrollments(student_id,curriculum_id,current_level_id,started_at,status)
      values('f3500000-0000-4000-8000-000000000080',
        'f3500000-0000-4000-8000-000000000010',
        'f3500000-0000-4000-8000-000000000020',current_date,'ACTIVE');
      commit;`)
    const enroll = `insert into public.enrollments(student_id,class_id,started_at,status)
      values('f3500000-0000-4000-8000-000000000080',
        'f3500000-0000-4000-8000-000000000040',current_date + 1,'ACTIVE');`
    const firstEnrollment = session(`begin; ${enroll} select 'seat_claimed'; select pg_sleep(2); commit;`, 'seat_claimed')
    await waitReady(firstEnrollment, 'duplicate enrollment')
    const secondEnrollment = session(`begin; ${enroll} commit;`, 'unused')
    const [c, d] = await Promise.all([firstEnrollment.done, secondEnrollment.done])
    assert.equal(c.code, 0, c.output)
    assert.notEqual(d.code, 0, d.output)
    assert.match(d.output, /PLACEMENT_ALREADY_ENROLLED/)
    assert.equal(query(`select count(*) from public.enrollments
      where student_id='f3500000-0000-4000-8000-000000000080'
        and class_id='f3500000-0000-4000-8000-000000000040'
        and status in ('ACTIVE','PAUSED')`), '1')

    query(`begin;
      insert into public.students(id,student_code,full_name,default_branch_id,status)
      values('f3500000-0000-4000-8000-000000000081','TEST-ROOM-STUDENT-2','TEST Student 2',
        'f3500000-0000-4000-8000-000000000001','ACTIVE');
      insert into public.student_curriculum_enrollments(student_id,curriculum_id,current_level_id,started_at,status)
      values('f3500000-0000-4000-8000-000000000081',
        'f3500000-0000-4000-8000-000000000010',
        'f3500000-0000-4000-8000-000000000020',current_date,'ACTIVE');
      commit;`)
    const occurrence = session(`begin;
      insert into public.session_occurrences(schedule_id, occurrence_date, starts_at, ends_at, room_id)
      values('f3500000-0000-4000-8000-000000000070', current_date + 1,
        (current_date + 1 + '18:00'::time) at time zone 'Asia/Ho_Chi_Minh',
        (current_date + 1 + '19:00'::time) at time zone 'Asia/Ho_Chi_Minh',
        'f3500000-0000-4000-8000-000000000050');
      select 'occurrence_claimed';
    `, 'occurrence_claimed', true)
    heldOccurrence = occurrence
    await waitReady(occurrence, 'regular occurrence')
    const competingEnrollment = session(`begin; set local lock_timeout = '750ms';
      insert into public.enrollments(student_id,class_id,started_at,status)
      values('f3500000-0000-4000-8000-000000000081',
        'f3500000-0000-4000-8000-000000000040',current_date + 1,'ACTIVE');
      commit;`, 'unused')
    const blocked = await competingEnrollment.done
    assert.notEqual(blocked.code, 0, blocked.output)
    assert.match(blocked.output, /lock timeout/)
    occurrence.finish('commit;\n')
    const occurrenceResult = await occurrence.done
    heldOccurrence = null
    assert.equal(occurrenceResult.code, 0, occurrenceResult.output)
    query(`insert into public.enrollments(student_id,class_id,started_at,status)
      values('f3500000-0000-4000-8000-000000000081',
        'f3500000-0000-4000-8000-000000000040',current_date + 1,'ACTIVE')`)
    assert.equal(query(`select count(*) from public.enrollments where class_id=
      'f3500000-0000-4000-8000-000000000040' and status in ('ACTIVE','PAUSED')`), '2')
    console.log('PASS: concurrent room booking yields one schedule and one conflict')
    console.log('PASS: concurrent primary teacher bookings in different rooms stop at two parallel classes')
    console.log('PASS: concurrent assistant teacher bookings in different rooms stop at one class')
    console.log('PASS: concurrent concrete session moves in different rooms stop at two primary shifts')
    console.log('PASS: concurrent duplicate enrollment yields one membership and one rejection')
    console.log('PASS: an open regular occurrence transaction locks its class before enrollment; retry succeeds after commit')
  } finally {
    if (heldOccurrence) {
      heldOccurrence.finish('rollback;\n')
      await Promise.race([heldOccurrence.done, new Promise(resolve => setTimeout(resolve, 3000))])
      heldOccurrence.abort()
    }
    cleanup()
    console.log('Local TEST fixtures removed')
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
