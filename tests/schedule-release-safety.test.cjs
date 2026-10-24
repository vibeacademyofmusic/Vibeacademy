const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const actionSource = fs.readFileSync('app/admin/classes/actions.ts', 'utf8')
const workspaceSource = fs.readFileSync('app/admin/coordination/Workspace.tsx', 'utf8')
const attendanceSql = fs.readFileSync('supabase/migrations/20260928210000_attendance_launcher.sql', 'utf8')

function compiled(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
}

function loadAction(db) {
  const shifts = { exports: {} }
  vm.runInNewContext(compiled(fs.readFileSync('lib/teaching-shifts/independent.ts', 'utf8')), {
    module: shifts, exports: shifts.exports,
  })
  const action = { exports: {} }
  const redirect = target => { throw Object.assign(new Error('redirect'), { target }) }
  const modules = {
    '@/lib/auth/request': { operationalAdminOn: async () => ({ data: true, error: null }) },
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect },
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/teaching-shifts/independent': shifts.exports,
    '@/lib/teaching-shifts/overlap': { primaryShiftWouldExceedTwo: () => false },
  }
  vm.runInNewContext(compiled(actionSource), {
    module: action, exports: action.exports, require: name => {
      if (!modules[name]) throw new Error(`Unknown module ${name}`)
      return modules[name]
    }, Date, Intl, console,
  })
  return action.exports.createClass
}

function loadLegacyScheduleAction(db) {
  const action = { exports: {} }
  const redirect = target => { throw Object.assign(new Error('redirect'), { target }) }
  const modules = {
    'next/cache': { refresh() {}, revalidatePath() {} },
    'next/navigation': { redirect },
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/teaching-shifts/overlap': { primaryShiftWouldExceedTwo: () => false },
  }
  vm.runInNewContext(compiled(fs.readFileSync('app/admin/schedule/actions.ts', 'utf8')), {
    module: action, exports: action.exports, require: name => {
      if (!modules[name]) throw new Error(`Unknown module ${name}`)
      return modules[name]
    }, console,
  })
  return action.exports.createSchedule
}

function baseForm() {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    branch_id: '11111111-1111-4111-8111-111111111111',
    curriculum_id: '22222222-2222-4222-8222-222222222222',
    code: 'PIANO-T2-1800', name: 'Piano · Thứ 2 · 18:00–19:30',
    class_type: 'GROUP', capacity: '3',
  })) form.set(key, value)
  return form
}

async function redirected(action, form, message) {
  await assert.rejects(action(form), error => {
    assert.match(decodeURIComponent(error.target || ''), message)
    return true
  })
}

test('one submission cannot create multiple days or windows, even when the client is bypassed', async () => {
  const db = { auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } }, error: null }) }, from() { throw new Error('A rejected form must not reach a table') } }
  const action = loadAction(db)
  const twoDays = baseForm()
  twoDays.append('day_of_week', '1')
  twoDays.append('day_of_week', '3')
  await redirected(action, twoDays, /Mỗi lần chỉ tạo một ca/)

  const twoWindows = baseForm()
  for (const [day, start, end] of [['1', '18:00', '19:30'], ['1', '20:00', '21:00']]) {
    twoWindows.append('slot_day', day)
    twoWindows.append('slot_start', start)
    twoWindows.append('slot_end', end)
  }
  await redirected(action, twoWindows, /Mỗi lần chỉ tạo một ca/)

  const noCapacity = baseForm()
  noCapacity.set('capacity', '')
  await redirected(action, noCapacity, /Nhập sức chứa thực tế/)
})

test('unknown room capacity is rejected before creating any class', async () => {
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } }, error: null }) },
    from(table) {
      if (!['branches', 'operational_curriculums', 'rooms'].includes(table)) throw new Error('No write or schedule read is allowed')
      return {
        select() { return this }, eq() { return this },
        async maybeSingle() {
          if (table === 'branches') return { data: { id: 'branch' }, error: null }
          if (table === 'operational_curriculums') return { data: { id: 'program', code: 'PIANO', name: 'Piano' }, error: null }
          return { data: { id: 'room', branch_id: '11111111-1111-4111-8111-111111111111', status: 'ACTIVE', capacity: null }, error: null }
        },
      }
    },
  }
  const form = baseForm()
  for (const [key, value] of Object.entries({ room_id: '33333333-3333-4333-8333-333333333333', day_of_week: '1', start_time: '18:00', end_time: '19:30', effective_from: '2026-10-26' })) form.set(key, value)
  await redirected(loadAction(db), form, /Phòng chưa xác định sức chứa/)
})

test('another room at the same time gets a separate code and only one new shift', async () => {
  const branch = '11111111-1111-4111-8111-111111111111'
  const room = '33333333-3333-4333-8333-333333333333'
  const otherRoom = '44444444-4444-4444-8444-444444444444'
  const createdId = '55555555-5555-4555-8555-555555555555'
  const inserts = []
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } }, error: null }) },
    from(table) {
      const query = {
        filters: {}, op: 'select', payload: null,
        select() { return this }, eq(key, value) { this.filters[key] = value; return this },
        insert(payload) { this.op = 'insert'; this.payload = payload; inserts.push({ table, payload }); return this },
        async maybeSingle() {
          if (table === 'branches') return { data: { id: branch }, error: null }
          if (table === 'operational_curriculums') return { data: { id: this.filters.id, code: 'PIANO', name: 'Piano' }, error: null }
          if (table === 'rooms') return { data: { id: room, branch_id: branch, status: 'ACTIVE', capacity: 6 }, error: null }
          if (table === 'classes') return { data: this.filters.code === 'PIANO-T2-1800' ? { id: 'existing' } : null, error: null }
          throw new Error(`Unexpected maybeSingle: ${table}`)
        },
        async single() {
          if (table === 'classes' && this.op === 'insert') return { data: { id: createdId }, error: null }
          throw new Error(`Unexpected single: ${table}`)
        },
        then(resolve, reject) {
          const data = table === 'schedules' && this.op === 'select'
            ? this.filters.room_id
              ? []
              : [{ class_id: 'existing', room_id: otherRoom, day_of_week: 1, start_time: '18:00:00', end_time: '19:30:00', effective_from: '2026-10-26', effective_to: null }]
            : null
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  const form = baseForm()
  for (const [key, value] of Object.entries({ room_id: room, day_of_week: '1', start_time: '18:00', end_time: '19:30', effective_from: '2026-10-26' })) form.set(key, value)
  await redirected(loadAction(db), form, /Đã tạo bản nháp/)
  assert.deepEqual(inserts.map(entry => entry.table), ['classes', 'schedules'])
  assert.equal(inserts[0].payload.code, 'PIANO-T2-1800-2')
  assert.equal(inserts[1].payload.room_id, room)
})

test('today names come from the same dated roster as its count', () => {
  const today = workspaceSource.slice(workspaceSource.indexOf('async function Today('))
  assert.match(today, /row\.student_names\?\.trim\(\)/)
  assert.doesNotMatch(today, /db\.from\('enrollments'\)/)
  assert.match(attendanceSql, /from public\.session_teaching_roster\(v\.session_id\) rr/)
  assert.match(attendanceSql, /select count\(\*\) total[\s\S]*string_agg\(coalesce\(st\.preferred_name,st\.full_name,st\.student_code\)/)
})

test('legacy schedule action rejects a multi-day submission before any table write', async () => {
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } }, error: null }) },
    rpc: async () => ({ data: true, error: null }),
    from() { throw new Error('Rejected form must not touch a table') },
  }
  const form = new FormData()
  form.set('class_id', '11111111-1111-4111-8111-111111111111')
  form.set('room_id', '22222222-2222-4222-8222-222222222222')
  form.append('day_of_week', '1')
  form.append('day_of_week', '3')
  await redirected(loadLegacyScheduleAction(db), form, /Mỗi ca dạy chỉ có một thứ/)
})

test('legacy schedule action refuses a second concurrent slot on one class', async () => {
  const classId = '11111111-1111-4111-8111-111111111111'
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } }, error: null }) },
    rpc: async () => ({ data: true, error: null }),
    from(table) {
      const query = {
        select() { return this }, eq() { return this },
        async maybeSingle() {
          assert.equal(table, 'classes')
          return { data: { id: classId, branch_id: 'branch', status: 'ACTIVE' }, error: null }
        },
        then(resolve, reject) {
          assert.equal(table, 'schedules')
          return Promise.resolve({ data: [{ effective_from: '2026-10-01', effective_to: null }], error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  const form = new FormData()
  for (const [key, value] of Object.entries({
    class_id: classId, room_id: '22222222-2222-4222-8222-222222222222',
    day_of_week: '1', start_time: '6:00', start_period: 'PM', duration_minutes: '90',
    effective_from: '2026-11-01',
  })) form.set(key, value)
  await redirected(loadLegacyScheduleAction(db), form, /Ca này đã có lịch trong khoảng ngày/)
})
