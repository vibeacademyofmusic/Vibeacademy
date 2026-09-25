/**
 * Isolated-preview fixture. Calls reserve/activate/record_verified_momo_ipn.
 * This is not a merchant payment and must never be exposed as a "mark paid" control.
 * Refuses every database except the local preview API on 127.0.0.1:55321.
 */
const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

const PREVIEW_API = 'http://127.0.0.1:55321'
const applicationId = process.argv[2]

function loadEnv(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || process.env[match[1]]) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[match[1]] = value
  }
}

function row(data) {
  return Array.isArray(data) ? data[0] : data
}

async function main() {
  loadEnv(path.join(__dirname, '..', '.env.local'))
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== PREVIEW_API) {
    throw new Error('REFUSING: this fixture only runs against the isolated preview API')
  }
  if (!applicationId || !process.env.PREVIEW_FIXTURE_EMAIL || !process.env.PREVIEW_FIXTURE_PASSWORD) {
    throw new Error('Usage: PREVIEW_FIXTURE_EMAIL=... PREVIEW_FIXTURE_PASSWORD=... node scripts/local-registration-deposit-fixture.cjs <application-id>')
  }
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!publishable || !serviceKey) throw new Error('REFUSING: preview keys are missing')

  const user = createClient(PREVIEW_API, publishable, { auth: { persistSession: false } })
  const admin = createClient(PREVIEW_API, serviceKey, { auth: { persistSession: false } })
  const { error: loginError } = await user.auth.signInWithPassword({
    email: process.env.PREVIEW_FIXTURE_EMAIL,
    password: process.env.PREVIEW_FIXTURE_PASSWORD,
  })
  if (loginError) throw new Error(`FIXTURE_LOGIN_FAILED: ${loginError.message}`)

  const { data: existing, error: existingError } = await user.from('registration_applications')
    .select('status').eq('id', applicationId).single()
  if (existingError) throw existingError
  let partialResult = null
  let thresholdResult = null
  let replay = null
  let completionReplay = null
  if (existing.status !== 'COMPLETED') {
    const { data: terms, error: termsError } = await user.from('registration_deposit_terms')
      .select('tuition_amount, deposit_due').eq('application_id', applicationId).single()
    if (termsError) throw termsError
    const depositDue = Number(terms.deposit_due)
    if (depositDue < 1000) throw new Error('FIXTURE_DEPOSIT_DUE_INVALID')
    const under = depositDue - 100000
    if (under < 1000) throw new Error('FIXTURE_UNDER_AMOUNT_INVALID')

    const first = await confirm(user, admin, under, 'FIXTURE-UNDER', 'preview-under')
    partialResult = first.result
    if (partialResult !== 'PARTIAL_DEPOSIT') throw new Error(`expected PARTIAL_DEPOSIT, got ${partialResult}`)
    const { count: studentsAfterPartial, error: partialCountError } = await user.from('students')
      .select('id', { count: 'exact', head: true }).eq('full_name', 'TEST Counter An')
    if (partialCountError) throw partialCountError
    if (studentsAfterPartial !== 0) throw new Error('student was created below the deposit threshold')

    const second = await confirm(user, admin, 100000, 'FIXTURE-THRESHOLD', 'preview-threshold')
    thresholdResult = second.result
    if (thresholdResult !== 'COMPLETED') throw new Error(`expected COMPLETED, got ${thresholdResult}`)
    const replayResponse = await admin.rpc('record_verified_momo_ipn', {
      p_order_id: second.orderId, p_partner_code: 'FIXTURE', p_transaction_id: 'FIXTURE-THRESHOLD',
      p_amount: 100000, p_result_code: 0,
    })
    if (replayResponse.error) throw replayResponse.error
    replay = replayResponse.data
    if (replay !== 'ALREADY_PAID') throw new Error(`expected ALREADY_PAID, got ${replay}`)
    const completionResponse = await admin.rpc('complete_momo_deposit_registration', { p_application: applicationId })
    if (completionResponse.error) throw completionResponse.error
    completionReplay = completionResponse.data
    if (completionReplay !== 'ALREADY_COMPLETED') throw new Error(`expected ALREADY_COMPLETED, got ${completionReplay}`)
  }

  const { data: application, error: applicationError } = await user.from('registration_applications')
    .select('application_code, status, linked_student_id').eq('id', applicationId).single()
  if (applicationError) throw applicationError
  const { data: student, error: studentError } = await user.from('students')
    .select('id, student_code, full_name').eq('id', application.linked_student_id).single()
  if (studentError) throw studentError
  const { data: placements, error: placementError } = await user.from('student_placement_cases')
    .select('id, status, curriculum_id, level_id, subject_id, assigned_class_id')
    .eq('registration_application_id', applicationId)
  if (placementError) throw placementError
  const { data: receipts, error: receiptError } = await user.from('payments')
    .select('id, payment_number, amount, reference, status').in('reference', ['MOMO:FIXTURE-UNDER', 'MOMO:FIXTURE-THRESHOLD'])
  if (receiptError) throw receiptError
  const { data: jobs, error: jobError } = await user.from('notification_jobs')
    .select('id, status, template_key, payload, error_code')
    .eq('entity_type', 'REGISTRATION_COMPLETED').eq('entity_id', applicationId)
  if (jobError) throw jobError

  const evidence = {
    fixture: true,
    provider: 'NOT_A_MOMO_PAYMENT',
    application_code: application.application_code,
    status: application.status,
    student_code: student?.student_code ?? null,
    student_count_for_name: 1,
    placements: placements ?? [],
    receipts: receipts ?? [],
    notification_jobs: (jobs ?? []).map(job => ({
      id: job.id,
      status: job.status,
      template_key: job.template_key,
      error_code: job.error_code,
      parameter_names: Object.keys(job.payload?.parameters ?? {}),
      program_name: job.payload?.parameters?.program_name ?? null,
      payment_status: job.payload?.parameters?.payment_status ?? null,
    })),
    partial_result: partialResult,
    threshold_result: thresholdResult,
    ipn_replay: replay,
    completion_replay: completionReplay,
  }
  if (evidence.placements.length !== 1 || evidence.placements[0].status !== 'UNASSIGNED' || evidence.placements[0].assigned_class_id) {
    throw new Error('expected exactly one unassigned placement')
  }
  if (!evidence.student_code || evidence.receipts.length !== 2 || evidence.notification_jobs.length !== 1) {
    throw new Error(`incomplete evidence: ${JSON.stringify(evidence)}`)
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

async function confirm(user, admin, amount, transactionId, label) {
  const { data: current, error: currentError } = await user.from('registration_applications')
    .select('version').eq('id', applicationId).single()
  if (currentError) throw currentError
  const { data, error: reserveError } = await user.rpc('reserve_registration_momo_order', {
    p_application: applicationId,
    p_request: crypto.randomUUID(),
    p_version: current.version,
    p_amount: amount,
  })
  if (reserveError) throw reserveError
  const order = row(data)
  if (!order?.order_id) throw new Error('reserve did not return an order')
  const { error: activateError } = await admin.rpc('activate_registration_momo_order', {
    p_order_id: order.order_id,
    p_partner_code: 'FIXTURE',
    p_amount: amount,
    p_pay_url: `https://test-payment.momo.vn/pay/${label}`,
  })
  if (activateError) throw activateError
  const { data: result, error: ipnError } = await admin.rpc('record_verified_momo_ipn', {
    p_order_id: order.order_id,
    p_partner_code: 'FIXTURE',
    p_transaction_id: transactionId,
    p_amount: amount,
    p_result_code: 0,
  })
  if (ipnError) throw ipnError
  return { orderId: order.order_id, result }
}

main().catch(error => {
  process.stderr.write(`FIXTURE_FAILED ${error.message ?? error}\n`)
  process.exit(1)
})
