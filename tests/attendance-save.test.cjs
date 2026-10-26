// Execute the actual server action with isolated SQL fixtures.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { PGlite } = require('@electric-sql/pglite')
const { harness, redirected } = require('./helpers/finance-operations.cjs')

// Real roster RPC and attendance validation SQL; minimal relational fixtures.
// The query adapter replaces HTTP, not the server action or SQL. Full schema/RLS
// and booking-credit lifecycle remain covered by the Supabase database suite.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const db = new PGlite()
const ready = (async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${id(999)}'::uuid $$;
    create function account_is_active() returns boolean language sql stable as $$ select current_setting('test.active', true) = 'true' $$;
    create function has_role(text) returns boolean language sql stable as $$ select true $$;
    create function can_access_session(uuid) returns boolean language sql stable as $$ select current_setting('test.access', true) = 'true' $$;
    create function class_enrollment_compatibility(uuid, uuid) returns text language sql stable as $$ select 'IN_SCOPE'::text $$;
    create table schedules(id uuid primary key, class_id uuid);
    create table students(id uuid primary key, student_code text, full_name text, preferred_name text);
    create table enrollments(id uuid primary key, student_id uuid references students, class_id uuid, started_at date, ended_at date);
    create table enrollment_pauses(enrollment_id uuid, status text, starts_on date, ends_on date);
    create table session_occurrences(id uuid primary key, schedule_id uuid references schedules, occurrence_date date, status text, occurrence_type text);
    create table session_occurrence_participants(session_occurrence_id uuid references session_occurrences, enrollment_id uuid references enrollments, booking_status text);
    create table attendance_records(id uuid default gen_random_uuid() primary key,
      session_occurrence_id uuid references session_occurrences, enrollment_id uuid references enrollments,
      status text check(status in ('PRESENT','ABSENT','LATE','EXCUSED')), notes text, marked_at timestamptz, marked_by uuid,
      unique(session_occurrence_id, enrollment_id));
  `)
  const pause = fs.readFileSync('supabase/migrations/20260907020106_enrollment_pause_engine.sql', 'utf8')
  await db.exec(pause.match(/create or replace function public\.is_enrollment_paused_on\([\s\S]+?\$\$;/i)[0])
  const migration = fs.readFileSync('supabase/migrations/20261025013000_cross_class_makeup_roster.sql', 'utf8')
  for (const name of ['session_teaching_roster', 'validate_attendance_record_class']) {
    await db.exec(migration.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]+?\\$\\$;`, 'i'))[0])
  }
  await db.exec(`create trigger validate_attendance before insert or update on attendance_records
    for each row execute function validate_attendance_record_class();
    revoke all on function session_teaching_roster(uuid) from public,anon,authenticated;`)
  await db.exec(fs.readFileSync('supabase/migrations/20260928222000_attendance_roster_read.sql', 'utf8'))
})()

async function fixture(type = 'MAKEUP') {
  await ready
  await db.exec(`
    truncate attendance_records,session_occurrence_participants,session_occurrences,enrollment_pauses,enrollments,students,schedules;
    select set_config('test.active','true',false),set_config('test.access','true',false);
    insert into schedules values('${id(1)}','${id(10)}');
    insert into students values('${id(21)}','HOST','Host',null),('${id(22)}','GUEST','Guest',null),('${id(23)}','OTHER','Other',null);
    insert into enrollments values
      ('${id(31)}','${id(21)}','${id(10)}','2026-10-01',null),
      ('${id(32)}','${id(22)}','${id(11)}','2026-10-01',null),
      ('${id(33)}','${id(23)}','${id(10)}','2026-10-01',null);
    insert into session_occurrences values('${id(40)}','${id(1)}','2026-10-31','SCHEDULED','${type}');
    insert into session_occurrence_participants values('${id(40)}','${id(31)}','ACTIVE'),('${id(40)}','${id(32)}','ACTIVE');
  `)
}

async function action(options = {}) {
  const tables = {}
  for (const table of ['session_occurrences', 'schedules', 'enrollments', 'session_occurrence_participants']) {
    tables[table] = (await db.query(`select * from ${table}`)).rows
  }
  const h = harness(tables, null, options.role ?? true, options.signedIn ?? true)
  const originalRpc = h.db.rpc, originalFrom = h.db.from
  h.db.rpc = async (name, args) => {
    if (name !== 'attendance_roster_read') return originalRpc(name, args)
    h.calls.push({ rpc: name, args })
    if (Object.hasOwn(options, 'rosterResponse')) return options.rosterResponse
    try {
      await db.exec('set role authenticated')
      const data = (await db.query('select attendance_roster_read($1) as roster', [args.p_session])).rows[0].roster
      return { data, error: null }
    } catch (error) { return { data: null, error } }
    finally { await db.exec('reset role') }
  }
  h.db.from = table => {
    if (table !== 'attendance_records') return originalFrom(table)
    return { upsert: async (records, options) => {
      h.calls.push({ table, records, options })
      if (options.onConflict !== 'session_occurrence_id,enrollment_id') throw Error('Unexpected conflict key')
      if (h.beforeWrite) await h.beforeWrite()
      try {
        // One SQL statement, like one PostgREST bulk upsert: a rejected guest
        // must not leave the host marked while reporting a failed save.
        await db.query(`insert into attendance_records(session_occurrence_id,enrollment_id,status,notes,marked_at,marked_by)
          select session_occurrence_id,enrollment_id,status,notes,marked_at,marked_by
          from jsonb_to_recordset($1::jsonb) as r(session_occurrence_id uuid,enrollment_id uuid,status text,notes text,marked_at timestamptz,marked_by uuid)
          on conflict(session_occurrence_id,enrollment_id) do update set status=excluded.status,notes=excluded.notes,marked_at=excluded.marked_at,marked_by=excluded.marked_by`, [JSON.stringify(records)])
        return { error: null }
      } catch (error) { return { error: { message: error.message } } }
    } }
  }
  h.save = (values = {}) => redirected(h.load('../attendance/actions.ts').saveAttendance, {
    occurrence_id: id(40), [`status_${id(31)}`]: 'PRESENT', [`status_${id(32)}`]: 'PRESENT', ...values,
  })
  return h
}
async function records() {
  return (await db.query('select * from attendance_records order by enrollment_id')).rows
}

test('saving the displayed makeup roster persists both host and cross-class guest', async () => {
  await fixture()
  const h = await action()
  const result = await h.save({ [`notes_${id(32)}`]: '  Học bù từ ca khác  ' })
  assert.match(result.searchParams.get('success') ?? '', /2 học viên/)
  const rows = await records()
  assert.deepEqual(rows.map(row => row.enrollment_id), [id(31), id(32)])
  assert.equal(rows[1].notes, 'Học bù từ ca khác')
  assert.equal(rows[1].marked_by, 'a0000000-0000-0000-0000-000000000001')
  const readback = await h.db.rpc('attendance_roster_read', { p_session: id(40) })
  assert.equal(readback.error, null)
  assert.equal(readback.data.length, 2)
  assert.ok(readback.data.every(row => row.status === 'PRESENT' && row.attendance_id))
  assert.ok(h.invalidated.includes('/admin/coordination'))
  assert.ok(h.invalidated.includes('/admin'))
})

test('a makeup session with only a guest saves; retry updates without duplicate records', async () => {
  await fixture()
  await db.exec(`delete from session_occurrence_participants where enrollment_id='${id(31)}'`)
  let h = await action()
  assert.ok((await h.save({ [`status_${id(31)}`]: '' })).searchParams.has('success'))
  const first = (await records())[0]
  h = await action()
  assert.ok((await h.save({ [`status_${id(31)}`]: '', [`status_${id(32)}`]: 'LATE' })).searchParams.has('success'))
  const rows = await records()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, first.id)
  assert.equal(rows[0].status, 'LATE')
})

test('stale or forged selected students fail the whole request before writing', async () => {
  await fixture()
  const h = await action()
  const result = await h.save({ [`status_${id(33)}`]: 'PRESENT' })
  assert.ok(result.searchParams.has('error'))
  assert.equal((await records()).length, 0)
})

test('failed or malformed roster reads never become a partial successful save', async () => {
  for (const rosterResponse of [
    { data: null, error: { message: 'permission denied' } },
    { data: null, error: null },
    { data: [{ enrollment_id: id(31) }, null], error: null },
    { data: [{ enrollment_id: id(31) }, { enrollment_id: id(31) }], error: null },
  ]) {
    await fixture()
    const h = await action({ rosterResponse })
    assert.ok((await h.save()).searchParams.has('error'))
    assert.equal((await records()).length, 0)
  }
})

test('regular sessions use the date and pause rules of the canonical roster', async () => {
  await fixture('REGULAR')
  await db.exec(`delete from session_occurrence_participants;
    insert into enrollment_pauses values('${id(33)}','ACTIVE','2026-10-31','2026-10-31');
    update enrollments set ended_at='2026-10-31' where id='${id(31)}';`)
  const h = await action()
  assert.ok((await h.save({ [`status_${id(32)}`]: '' })).searchParams.has('success'))
  assert.deepEqual((await records()).map(row => row.enrollment_id), [id(31)])
  const stale = await action()
  assert.ok((await stale.save({ [`status_${id(32)}`]: '', [`status_${id(33)}`]: 'PRESENT' })).searchParams.has('error'))
  assert.equal((await records()).length, 1)
})

test('cancelled bookings are excluded even if an old form still submits them', async () => {
  await fixture()
  await db.exec(`update session_occurrence_participants set booking_status='CANCELLED' where enrollment_id='${id(32)}'`)
  const h = await action()
  assert.ok((await h.save()).searchParams.has('error'))
  assert.equal((await records()).length, 0)
})

test('a booking cancelled after the roster read rejects the entire bulk save', async () => {
  await fixture()
  const h = await action()
  h.beforeWrite = () => db.exec(`update session_occurrence_participants set booking_status='CANCELLED' where enrollment_id='${id(32)}'`)
  assert.ok((await h.save()).searchParams.has('error'))
  assert.equal((await records()).length, 0)
  assert.equal(h.invalidated.length, 0)
})

test('authentication, admin permission and RPC session scope remain required', async () => {
  for (const options of [{ signedIn: false }, { role: false }, { active: false }, { access: false }]) {
    await fixture()
    if (options.active === false) await db.exec("select set_config('test.active','false',false)")
    if (options.access === false) await db.exec("select set_config('test.access','false',false)")
    const h = await action(options)
    const result = await h.save()
    assert.ok(result.pathname === '/login' || result.searchParams.has('error'))
    assert.equal((await records()).length, 0)
  }
})

test('completed and cancelled sessions cannot be changed by this action', async () => {
  for (const status of ['COMPLETED', 'CANCELLED']) {
    await fixture()
    await db.query('update session_occurrences set status=$1', [status])
    const h = await action()
    assert.ok((await h.save()).searchParams.has('error'))
    assert.equal((await records()).length, 0)
  }
})

test('an unselected guest keeps the existing record while the selected host is updated', async () => {
  await fixture()
  let h = await action()
  await h.save({ [`status_${id(32)}`]: 'EXCUSED', [`notes_${id(32)}`]: 'Giữ ghi chú' })
  h = await action()
  const result = await h.save({ [`status_${id(31)}`]: 'LATE', [`status_${id(32)}`]: '' })
  assert.match(result.searchParams.get('success') ?? '', /1 học viên/)
  const rows = await records()
  assert.deepEqual(rows.map(row => row.status), ['LATE', 'EXCUSED'])
  assert.equal(rows[1].notes, 'Giữ ghi chú')
})

test('invalid or empty statuses never produce a successful partial save', async () => {
  for (const statuses of [['PRESENT', 'UNKNOWN'], ['', '']]) {
    await fixture()
    const h = await action()
    assert.ok((await h.save({ [`status_${id(31)}`]: statuses[0], [`status_${id(32)}`]: statuses[1] })).searchParams.has('error'))
    assert.equal((await records()).length, 0)
  }
})

test.after(async () => { await ready; await db.close() })
