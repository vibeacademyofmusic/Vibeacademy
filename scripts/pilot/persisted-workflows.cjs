// Synthetic records only, on the dedicated 56321 platform. No browser session is read.
const fs = require('node:fs')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createClient } = require('@supabase/supabase-js')
const RUN = 'VIBE-EXEC-20260930'
const dir = 'docs/verification/execution-20260930/raw'
const secretPath = '/private/tmp/vibe-execution-20260930/workflow-actors.json'
const mapPath = `${dir}/workflow-records.json`
const id = key => { const h = crypto.createHash('sha256').update(RUN + '/' + key).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}` }
const map = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath)) : { run: RUN, objects: {} }
const results = []
const ok = (r, label) => { if (r.error) throw Error(`${label}: ${r.error.message}`); return r.data }
function save() { fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n'); fs.writeFileSync(`${dir}/persisted-workflows.json`, JSON.stringify(results, null, 2) + '\n') }
async function check(name, fn) { try { results.push({ name, status: 'PASS', evidence: await fn() ?? 'Assertions passed' }) } catch (e) { results.push({ name, status: 'FAIL', evidence: e.message }) } save() }
async function setup() {
  const output = execFileSync('node_modules/.bin/supabase', ['status', '--workdir', '/private/tmp/vibe-execution-20260930', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const env = Object.fromEntries([...output.matchAll(/^([A-Z0-9_]+)="([^\"]*)"$/gm)].map(m => [m[1], m[2]]))
  assert.equal(env.API_URL, 'http://127.0.0.1:56321')
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => {
    assert.equal(new URL(url).origin, env.API_URL, 'External request blocked')
    return fetch(url, { ...init, redirect: 'error' })
  } } }
  const root = createClient(env.API_URL, env.SERVICE_ROLE_KEY, options)
  let accounts = fs.existsSync(secretPath) ? JSON.parse(fs.readFileSync(secretPath)) : {}
  const roles = ok(await root.from('roles').select('id,code'), 'roles')
  for (const branch of ['A', 'B']) ok(await root.from('branches').upsert({ id: id('branch' + branch), code: RUN + '-' + branch, name: 'TEST execution branch ' + branch }), 'branch bootstrap')
  const actors = { ADMIN: 'SUPER_ADMIN', ADMIN2: 'SUPER_ADMIN', STAFF: 'STAFF', BA: 'BRANCH_ADMIN', BB: 'BRANCH_ADMIN', FIN: 'FINANCE', TEACHER: 'TEACHER', PARENT: 'PARENT', STUDENT: 'STUDENT' }
  const clients = {}
  for (const [actor, role] of Object.entries(actors)) {
    if (!accounts[actor]) {
      const email = `exec.${actor.toLowerCase()}.20260930@example.test`
      const password = crypto.randomBytes(24).toString('base64url') + 'aA!7'
      const user = ok(await root.auth.admin.createUser({ email, password, email_confirm: true }), 'synthetic Auth bootstrap').user
      accounts[actor] = { id: user.id, email, password }
      fs.writeFileSync(secretPath, JSON.stringify(accounts), { mode: 0o600 }); fs.chmodSync(secretPath, 0o600)
    }
    const a = accounts[actor]
    ok(await root.from('profiles').upsert({ id: a.id, full_name: `TEST ${RUN} ${actor}`, status: 'ACTIVE' }), 'profile bootstrap')
    const roleId = roles.find(r => r.code === role)?.id
    assert.ok(roleId, 'Use existing role only')
    ok(await root.from('user_roles').upsert({ id: id('role' + actor), user_id: a.id, role_id: roleId, branch_id: actor === 'BB' ? id('branchB') : ['BA', 'STAFF', 'FIN', 'TEACHER'].includes(actor) ? id('branchA') : null }), 'existing-role fixture link')
    clients[actor] = createClient(env.API_URL, env.ANON_KEY, options)
    ok(await clients[actor].auth.signInWithPassword({ email: a.email, password: a.password }), 'synthetic normal password sign-in')
  }
  clients.ANON = createClient(env.API_URL, env.ANON_KEY, options)
  map.actors = Object.fromEntries(Object.entries(accounts).map(([k, a]) => [k, { id: a.id, role: actors[k] }]))
  save()
  return { root, clients, accounts }
}
async function main() {
  const { root, clients: c, accounts } = await setup()
  const rpc = async (actor, name, args) => ok(await c[actor].rpc(name, args), name)
  const read = async (table, key) => ok(await c.ADMIN.from(table).select('*').eq('id', key).single(), 'persisted ' + table)
  const ensure = async (table, key, row) => {
    const existing = ok(await root.from(table).select('id').eq('id', id(key)).maybeSingle(), table)
    if (!existing) ok(await c.ADMIN.from(table).insert({ id: id(key), ...row }), 'authenticated synthetic foundation ' + table)
  }
  // Foundation only: a test-owned legacy course bridge is required by classes.course_id.
  await ensure('curriculums', 'curriculum', { code: RUN, name: 'TEST execution curriculum' })
  await ensure('curriculum_levels', 'level', { curriculum_id: id('curriculum'), code: 'G1', name: 'TEST Grade 1', sequence_no: 1 })
  await ensure('curriculum_subjects', 'subject', { level_id: id('level'), family_code: 'TEST', code: RUN, name: 'TEST direct subject', completion_rule: 'DIRECT_ASSESSMENT' })
  await ensure('courses', 'legacyCourse', { curriculum_id: id('curriculum'), level_id: id('level'), code: RUN, name: 'TEST legacy bridge (fixture only)' })
  await ensure('teachers', 'teacher', { user_id: accounts.TEACHER.id, teacher_code: RUN, full_name: 'TEST execution teacher' })
  ok(await root.from('teacher_branches').upsert({ teacher_id: id('teacher'), branch_id: id('branchA'), is_primary: true }), 'teacher branch fixture')
  await ensure('rooms', 'room', { branch_id: id('branchA'), code: RUN, name: 'TEST execution room', capacity: 5 })
  await ensure('classes', 'class', { branch_id: id('branchA'), course_id: id('legacyCourse'), code: RUN, name: 'TEST execution class', class_type: 'GROUP', capacity: 5, status: 'ACTIVE', start_date: '2026-09-30', end_date: '2027-09-29', accepted_from_level_id: id('level'), accepted_to_level_id: id('level') })
  await ensure('class_teachers', 'classTeacher', { class_id: id('class'), teacher_id: id('teacher'), teacher_role: 'PRIMARY', assigned_at: '2026-09-30' })
  await ensure('schedules', 'schedule', { class_id: id('class'), room_id: id('room'), day_of_week: 3, start_time: '08:00', end_time: '09:00', effective_from: '2026-09-30', effective_to: '2027-09-29', timezone: 'Asia/Ho_Chi_Minh' })
  ok(await c.ADMIN.from('schedules').update({ timezone: 'Asia/Ho_Chi_Minh' }).eq('id', id('schedule')), 'canonical fixture timezone')
  await ensure('tuition_plans', 'plan', { code: RUN, name: 'TEST execution 12-month plan', duration_months: 12 })
  await ensure('tuition_plan_branch_prices', 'price', { tuition_plan_id: id('plan'), branch_id: id('branchA'), list_price: 12000000, currency: 'VND' })
  ok(await c.ADMIN.from('session_occurrences').update({ room_id: id('room') }).eq('id', id('sourceSession')), 'test occurrence room fixture')
  const registration = { p_request: id('registration'), p_branch: id('branchA'), p_lead: null,
    p_student_name: 'TEST VIBE EXEC 20260930 Student', p_student_date_of_birth: '2015-01-01',
    p_parent_name: 'TEST VIBE EXEC Parent', p_parent_phone: '0900000001', p_curriculum: id('curriculum'),
    p_level: id('level'), p_subject: null, p_desired_start: '2026-09-30', p_preferred_schedule: 'TEST Wednesday 08:00',
    p_consent: false, p_consent_method: '', p_over_18: false, p_zalo_phone: '0900000001', p_home_address: 'TEST isolated address' }
  await check('Authenticated intake draft persists; replay creates one application', async () => {
    map.objects.registration = await rpc('BA', 'create_registration_with_zalo_consent', registration)
    assert.equal(await rpc('BA', 'create_registration_with_zalo_consent', registration), map.objects.registration)
    const row = await read('registration_applications', map.objects.registration)
    assert.equal(row.created_by, accounts.BA.id); assert.equal(row.student_name, registration.p_student_name)
    assert.equal(row.zalo_phone, '84900000001'); assert.equal(row.home_address, registration.p_home_address)
    return { id: row.id, created_by: row.created_by, state: row.status }
  })
  await check('Out-of-branch and ordinary staff registration mutation denied', async () => {
    const row = await read('registration_applications', map.objects.registration)
    const evidence = {}
    for (const actor of ['BB', 'STAFF', 'TEACHER', 'PARENT', 'ANON']) {
      const result = await c[actor].rpc('transition_registration_application', { p_request: crypto.randomUUID(), p_application: row.id, p_version: row.version, p_action: 'SUBMIT' })
      assert.ok(result.error, actor + ' must be denied'); assert.notEqual(result.error.code, 'PGRST202'); evidence[actor] = result.error.message
    }
    assert.equal((await read('registration_applications', row.id)).version, row.version)
    return evidence
  })
  await check('Submit, verify and agreed full-price quote persist', async () => {
    for (const [state, action] of [['DRAFT', 'SUBMIT'], ['SUBMITTED', 'VERIFY']]) {
      const row = await read('registration_applications', map.objects.registration)
      if (row.status === state) await rpc('BA', 'transition_registration_application', { p_request: id(action), p_application: row.id, p_version: row.version, p_action: action })
    }
    const row = await read('registration_applications', map.objects.registration)
    if (row.status === 'VERIFIED') await rpc('BA', 'set_registration_deposit_quote', { p_application: row.id, p_version: row.version, p_plan: id('plan'), p_discount_type: 'NONE', p_discount_value: 0, p_discount_name: null, p_payment_option: 'FULL' })
    const terms = ok(await c.ADMIN.from('registration_deposit_terms').select('*').eq('application_id', row.id).single(), 'terms')
    assert.equal(Number(terms.amount_due), 12000000)
    return { application: row.id, quote: terms.amount_due, no_discount: true }
  })
  await check('Unpaid completion denied; synthetic server payment completes once', async () => {
    let app = await read('registration_applications', map.objects.registration)
    if (app.status !== 'COMPLETED') {
      const denied = await c.BA.rpc('complete_registration_application', { p_request: crypto.randomUUID(), p_application: app.id, p_version: app.version, p_student: null, p_parent: null })
      assert.ok(denied.error); assert.match(denied.error.message, /PAYMENT_REQUIRED/)
      const order = await rpc('BA', 'reserve_registration_payos_order', { p_application: app.id, p_request: id('order'), p_version: app.version })
      map.objects.order_code = order.order_code
      // Inject a synthetic verified server event into the isolated database.
      // No provider call or real webhook/signature verification is claimed.
      ok(await root.rpc('activate_registration_payos_order', { p_order_code: order.order_code, p_amount: 12000000, p_payment_link_id: RUN, p_checkout_url: 'https://pay.payos.vn/TEST-NOT-VISITED', p_qr_code: 'TEST' }), 'synthetic order activation')
      assert.equal(ok(await root.rpc('record_verified_payos_webhook', { p_order_code: order.order_code, p_payment_link_id: RUN, p_reference: RUN, p_amount: 12000000, p_currency: 'VND' }), 'synthetic server payment'), 'COMPLETED')
    }
    app = await read('registration_applications', app.id)
    assert.equal(app.status, 'COMPLETED'); map.objects.student = app.linked_student_id; map.objects.parent = app.linked_parent_id
    assert.equal(ok(await root.rpc('record_verified_payos_webhook', { p_order_code: map.objects.order_code, p_payment_link_id: RUN, p_reference: RUN, p_amount: 12000000, p_currency: 'VND' }), 'event replay'), 'ALREADY_PAID')
    const orders = ok(await c.ADMIN.from('registration_payos_orders').select('*').eq('application_id', app.id), 'orders')
    assert.equal(orders.length, 1); map.objects.gatewayPayment = orders[0].finance_payment_id
    const payment = await read('payments', map.objects.gatewayPayment)
    assert.equal(payment.student_id_snapshot, app.linked_student_id); assert.equal(payment.branch_id_snapshot, id('branchA')); assert.equal(Number(payment.amount), 12000000)
    return { student: app.linked_student_id, payment: payment.id, student_owner: payment.student_id_snapshot, branch_owner: payment.branch_id_snapshot, created_by: payment.created_by ?? null, synthetic_server_event: true }
  })
  await check('Student, parent and academic path persist with expected relationships', async () => {
    const student = await read('students', map.objects.student)
    assert.equal(student.full_name, registration.p_student_name); assert.equal(student.phone, '84900000001'); assert.equal(student.address, registration.p_home_address)
    ok(await root.from('students').update({ user_id: accounts.STUDENT.id }).eq('id', student.id), 'synthetic student actor association')
    ok(await root.from('parents').update({ user_id: accounts.PARENT.id }).eq('id', map.objects.parent), 'synthetic parent actor association')
    const path = ok(await root.from('student_curriculum_enrollments').select('*').eq('student_id', student.id), 'academic path')
    assert.equal(path.length, 1); assert.equal(path[0].curriculum_id, id('curriculum')); assert.equal(path[0].current_level_id ?? path[0].level_id, id('level'))
    const links = ok(await root.from('student_parents').select('*').eq('student_id', student.id), 'parent link')
    assert.equal(links.length, 1); assert.equal(links[0].parent_id, map.objects.parent)
    return { student: student.id, path: path[0].id, parent: map.objects.parent }
  })
  await check('Placement creates exactly one correctly owned enrollment', async () => {
    let placement = ok(await c.ADMIN.from('student_placement_cases').select('*').eq('registration_application_id', map.objects.registration).single(), 'placement')
    if (!placement.enrollment_id) await rpc('BA', 'assign_student_placement', { p_request: id('placementRequest'), p_placement: placement.id, p_version: placement.version, p_class: id('class'), p_start: '2026-09-30' })
    placement = await read('student_placement_cases', placement.id); map.objects.placement = placement.id; map.objects.enrollment = placement.enrollment_id
    const e = await read('enrollments', placement.enrollment_id)
    assert.equal(e.student_id, map.objects.student); assert.equal(e.class_id, id('class'))
    assert.equal(ok(await root.from('enrollments').select('id').eq('student_id', map.objects.student), 'single enrollment').length, 1)
    return { placement: placement.id, enrollment: e.id, student: e.student_id, class: e.class_id }
  })
  await check('Tuition term, invoice and gateway receipt allocation persist', async () => {
    if (!map.objects.tuition) map.objects.tuition = await rpc('ADMIN', 'create_tuition_term', { p_enrollment_id: map.objects.enrollment, p_tuition_plan_id: id('plan'), p_starts_on: '2026-09-30', p_discount_type: 'NONE', p_discount_value: 0, p_discount_name: null, p_notes: RUN })
    if (!map.objects.invoice) map.objects.invoice = await rpc('ADMIN', 'create_tuition_invoice', { p_enrollment_tuition_id: map.objects.tuition, p_notes: RUN })
    const invoice = await read('invoices', map.objects.invoice)
    if (invoice.status === 'DRAFT') await rpc('ADMIN', 'issue_invoice', { p_invoice_id: invoice.id, p_issued_on: '2026-09-30', p_due_on: '2026-09-30' })
    await rpc('ADMIN', 'allocate_registration_deposits_to_invoice', { p_application: map.objects.registration, p_invoice: invoice.id })
    const saved = await read('invoices', invoice.id)
    const allocations = ok(await root.from('payment_allocations').select('*').eq('invoice_id', invoice.id), 'allocations')
    assert.equal(allocations.length, 1); assert.equal(allocations[0].payment_id, map.objects.gatewayPayment); assert.equal(Number(allocations[0].amount), 12000000)
    assert.equal(saved.student_id_snapshot, map.objects.student); assert.equal(saved.branch_id_snapshot, id('branchA'))
    return { tuition: map.objects.tuition, invoice: invoice.id, invoice_state: saved.status, allocated: allocations[0].amount, paid_by_receipt: map.objects.gatewayPayment }
  })
  const cash = { p_idempotency_key: id('cashRequest'), p_student_id: map.objects.student, p_branch_id: id('branchA'), p_amount: 100000, p_currency: 'VND', p_payment_method: 'CASH', p_paid_at: '2026-09-30T02:00:00Z', p_reference: RUN + '-CASH', p_notes: RUN + ' synthetic cash ownership test' }
  await check('Reception STAFF, branch admin, finance, teacher, parent and anon cannot record counter cash', async () => {
    const before = ok(await root.from('payments').select('id'), 'payments before').length
    const evidence = {}
    for (const actor of ['STAFF', 'BA', 'FIN', 'TEACHER', 'PARENT', 'ANON']) {
      const result = await c[actor].rpc('create_payment_once', cash)
      assert.ok(result.error, actor + ' unexpectedly recorded a payment'); assert.match(result.error.message, /SUPER_ADMIN role required|permission denied for function create_payment_once/); evidence[actor] = result.error.message
    }
    assert.equal(ok(await root.from('payments').select('id'), 'payments after').length, before)
    return { denials: evidence, rows_added: 0, operational_gap: 'Reception requires an existing authorized SUPER_ADMIN for counter cash; roles unchanged' }
  })
  await check('Counter cash actor ownership and idempotency are enforced', async () => {
    map.objects.cashPayment = await rpc('ADMIN', 'create_payment_once', cash)
    assert.equal(await rpc('ADMIN', 'create_payment_once', cash), map.objects.cashPayment)
    const changed = await c.ADMIN.rpc('create_payment_once', { ...cash, p_amount: 200000 }); assert.ok(changed.error)
    const anotherOwner = await c.ADMIN2.rpc('create_payment_once', cash); assert.ok(anotherOwner.error)
    const receipt = await read('payments', map.objects.cashPayment)
    assert.equal(receipt.created_by, accounts.ADMIN.id); assert.equal(receipt.student_id_snapshot, map.objects.student); assert.equal(receipt.branch_id_snapshot, id('branchA')); assert.equal(Number(receipt.amount), 100000)
    const request = JSON.parse(execFileSync('docker', ['exec', 'supabase_db_vibe-execution-20260930', 'psql', '-U', 'postgres', '-d', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', `select jsonb_build_object('created_by',created_by,'payment_id',payment_id) from payment_entry_requests where request_id='${id('cashRequest')}'::uuid`], { encoding: 'utf8' }).trim())
    assert.equal(request.created_by, accounts.ADMIN.id); assert.equal(request.payment_id, receipt.id)
    return { payment: receipt.id, actor_owner: receipt.created_by, student_owner: receipt.student_id_snapshot, branch_owner: receipt.branch_id_snapshot, replay_same_receipt: true, changed_input_denied: changed.error.message, different_actor_denied: anotherOwner.error.message }
  })
  await check('Teacher attendance persists; unrelated roles cannot forge attendance', async () => {
    await ensure('session_occurrences', 'sourceSession', { schedule_id: id('schedule'), room_id: id('room'), occurrence_date: '2026-09-30', starts_at: '2026-09-30T01:00:00Z', ends_at: '2026-09-30T02:00:00Z', status: 'SCHEDULED' })
    map.objects.sourceSession = id('sourceSession')
    const args = { p_session: id('sourceSession'), p_action: 'attendance', p_enrollment: map.objects.enrollment, p_payload: { status: 'EXCUSED' } }
    for (const actor of ['STAFF', 'PARENT', 'BB', 'ANON']) assert.ok((await c[actor].rpc('teacher_session_write', args)).error, actor + ' attendance denied')
    let occurrence = await read('session_occurrences', id('sourceSession'))
    const priorAttendance = ok(await c.ADMIN.from('attendance_records').select('id').eq('session_occurrence_id', occurrence.id).eq('enrollment_id', map.objects.enrollment), 'prior attendance')
    if (occurrence.status === 'COMPLETED' && !priorAttendance.length) {
      await rpc('ADMIN', 'set_session_occurrence_status', { p_occurrence_id: occurrence.id, p_status: 'SCHEDULED' })
      occurrence = await read('session_occurrences', occurrence.id)
    }
    if (occurrence.status === 'SCHEDULED') await rpc('TEACHER', 'teacher_session_write', args)
    const attendance = ok(await root.from('attendance_records').select('*').eq('session_occurrence_id', id('sourceSession')).eq('enrollment_id', map.objects.enrollment).single(), 'attendance')
    assert.equal(attendance.status, 'EXCUSED'); assert.equal(attendance.marked_by, accounts.TEACHER.id)
    map.objects.attendance = attendance.id
    return { attendance: attendance.id, marked_by: attendance.marked_by, status: attendance.status }
  })
  await check('Completing excused regular session creates exactly one makeup entitlement', async () => {
    const source = await read('session_occurrences', id('sourceSession'))
    if (source.status !== 'COMPLETED') await rpc('ADMIN', 'set_session_occurrence_status', { p_occurrence_id: source.id, p_status: 'COMPLETED' })
    const credits = ok(await root.from('makeup_credits').select('*').eq('source_occurrence_id', source.id).eq('enrollment_id', map.objects.enrollment), 'credits')
    assert.equal(credits.length, 1); map.objects.credit = credits[0].id
    return { credit: credits[0].id, state: credits[0].status, unique_source: true }
  })
  await check('Makeup reservation, attendance and credit consumption persist without money movement', async () => {
    const before = ok(await root.from('payments').select('id,amount'), 'payments before makeup')
    if (!map.objects.makeupSession) map.objects.makeupSession = await rpc('ADMIN', 'create_makeup_session_occurrence', { p_source_occurrence_id: id('sourceSession'), p_starts_at: '2026-10-01T01:00:00Z', p_ends_at: '2026-10-01T02:00:00Z', p_room_id: id('room'), p_enrollment_ids: [map.objects.enrollment], p_reason: RUN + ' equivalent synthetic exercise accepted' })
    const occurrence = await read('session_occurrences', map.objects.makeupSession)
    if (occurrence.status === 'SCHEDULED') await rpc('TEACHER', 'teacher_session_write', { p_session: occurrence.id, p_action: 'attendance', p_enrollment: map.objects.enrollment, p_payload: { status: 'PRESENT' } })
    if (occurrence.status !== 'COMPLETED') await rpc('ADMIN', 'set_session_occurrence_status', { p_occurrence_id: occurrence.id, p_status: 'COMPLETED' })
    const credit = await read('makeup_credits', map.objects.credit)
    assert.equal(credit.status, 'USED'); assert.equal(credit.reserved_occurrence_id, occurrence.id)
    assert.deepEqual(ok(await root.from('payments').select('id,amount'), 'payments after makeup'), before)
    return { session: occurrence.id, credit: credit.id, state: credit.status, no_new_money: true }
  })
  await check('Pause request, approval and cancellation preserve financial records', async () => {
    const before = ok(await root.from('payments').select('id,amount,created_by'), 'payment baseline')
    const invoiceBefore = await read('invoices', map.objects.invoice)
    const args = { p_enrollment_id: map.objects.enrollment, p_starts_on: '2026-10-02', p_ends_on: '2026-10-04', p_reason: RUN }
    for (const actor of ['STAFF', 'BA', 'FIN', 'TEACHER', 'PARENT', 'ANON']) {
      const denied = await c[actor].rpc('request_enrollment_pause', args)
      assert.ok(denied.error, actor + ' pause request must fail authorization'); assert.notEqual(denied.error.code, 'PGRST202')
    }
    const requested = await rpc('ADMIN', 'request_enrollment_pause', args); assert.equal(requested.ok, true, JSON.stringify(requested))
    map.objects.pauseRequest = requested.request_id
    const pendingBefore = await read('enrollment_pause_requests', requested.request_id)
    assert.equal(pendingBefore.status, 'REQUESTED')
    for (const actor of ['STAFF', 'BA', 'FIN', 'TEACHER', 'PARENT', 'ANON']) {
      const denied = await c[actor].rpc('decide_enrollment_pause', { p_request_id: requested.request_id, p_approve: true, p_note: RUN })
      assert.ok(denied.error, actor + ' must not approve a pending request'); assert.notEqual(denied.error.code, 'PGRST202')
    }
    assert.deepEqual(await read('enrollment_pause_requests', requested.request_id), pendingBefore)
    const pendingOverlap = await rpc('ADMIN', 'preview_enrollment_pause', { p_enrollment_id: map.objects.enrollment, p_starts_on: args.p_starts_on, p_ends_on: args.p_ends_on })
    assert.equal(pendingOverlap.ok, false); assert.ok(pendingOverlap.blockers.some(b => b.includes('chồng')))
    const approved = await rpc('ADMIN', 'decide_enrollment_pause', { p_request_id: requested.request_id, p_approve: true, p_note: RUN + ' synthetic approval' }); assert.equal(approved.ok, true, JSON.stringify(approved))
    map.objects.pause = approved.pause_id
    assert.equal((await read('enrollment_pauses', approved.pause_id)).status, 'ACTIVE')
    const pauseBefore = await read('enrollment_pauses', approved.pause_id)
    for (const actor of ['STAFF', 'BA', 'FIN', 'TEACHER', 'PARENT', 'ANON']) {
      const denied = await c[actor].rpc('decide_enrollment_pause', { p_request_id: requested.request_id, p_approve: true, p_note: RUN })
      assert.ok(denied.error, actor + ' must not approve even a repeated decision'); assert.notEqual(denied.error.code, 'PGRST202')
    }
    const repeated = await rpc('ADMIN', 'decide_enrollment_pause', { p_request_id: requested.request_id, p_approve: true, p_note: RUN + ' retry' })
    assert.equal(repeated.ok, true); assert.equal(repeated.repeated, true); assert.equal(repeated.pause_id, approved.pause_id)
    assert.deepEqual(await read('enrollment_pauses', approved.pause_id), pauseBefore)
    const requestRow = await read('enrollment_pause_requests', requested.request_id)
    assert.equal(requestRow.status, 'APPROVED'); assert.equal(requestRow.decided_by, accounts.ADMIN.id); assert.equal(requestRow.pause_id, approved.pause_id)
    const overlap = await rpc('ADMIN', 'preview_enrollment_pause', { p_enrollment_id: map.objects.enrollment, p_starts_on: '2026-10-02', p_ends_on: '2026-10-04' })
    assert.equal(overlap.ok, false); assert.ok(overlap.blockers.some(b => b.includes('chồng')))
    const ended = await rpc('ADMIN', 'cancel_active_pause', { p_pause_id: approved.pause_id, p_note: RUN + ' synthetic cancellation' }); assert.equal(ended.ok, true, JSON.stringify(ended))
    assert.equal((await read('enrollment_pauses', approved.pause_id)).status, 'CANCELLED')
    assert.deepEqual(ok(await root.from('payments').select('id,amount,created_by'), 'payment after pause'), before)
    assert.deepEqual(await read('invoices', map.objects.invoice), invoiceBefore)
    return { request: requested.request_id, pause: approved.pause_id, state: 'CANCELLED', approved_actor: requestRow.decided_by, repeated_approval_same_pause: true, unauthorized_approval_denied: true, ordinary_overlap_still_blocked: true, financial_records_unchanged: true }
  })
  await check('Parent/student scope and final persisted ownership', async () => {
    const parent = await rpc('PARENT', 'portal_students', {})
    const student = await rpc('STUDENT', 'portal_students', {})
    assert.deepEqual(parent.map(r => r.id), [map.objects.student]); assert.deepEqual(student.map(r => r.id), [map.objects.student])
    assert.equal(ok(await c.BB.from('students').select('id').eq('id', map.objects.student), 'other branch RLS').length, 0)
    const payment = await read('payments', map.objects.cashPayment)
    assert.equal(payment.created_by, accounts.ADMIN.id); assert.equal(payment.student_id_snapshot, map.objects.student)
    const jobs = JSON.parse(execFileSync('docker', ['exec', 'supabase_db_vibe-execution-20260930', 'psql', '-U', 'postgres', '-d', 'postgres', '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', `select coalesce(jsonb_agg(jsonb_build_object('id',id,'attempts',attempts,'sent_at',sent_at,'provider_message_id',provider_message_id)),'[]'::jsonb) from notification_jobs where student_id='${map.objects.student}'::uuid`], { encoding: 'utf8' }).trim())
    assert.ok(jobs.every(j => j.attempts === 0 && !j.sent_at && !j.provider_message_id))
    return { persisted_student: map.objects.student, cash_payment: payment.id, actor_owner: payment.created_by, queued_jobs: jobs.length, attempted_sends: 0 }
  })
  save(); console.log(JSON.stringify({ run: RUN, pass: results.filter(r => r.status === 'PASS').length, failures: results.filter(r => r.status === 'FAIL') }))
  if (results.some(r => r.status === 'FAIL')) process.exitCode = 1
}
main().catch(e => { save(); console.error(e.message); process.exitCode = 1 })
