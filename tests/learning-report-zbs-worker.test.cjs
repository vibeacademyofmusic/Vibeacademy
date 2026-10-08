const test = require('node:test'), assert = require('node:assert/strict')
const { load } = require('./helpers/report-runtime.cjs')
const { deliverLearningReport } = load('lib/reports/zbs-worker.ts')
const env = { ZALO_PILOT_OUTBOUND: 'enabled', ZALO_LEARNING_REPORT_SEND_ENABLED: 'true', LEARNING_REPORT_PUBLIC_ORIGIN: 'https://reports.example.test', ZALO_APP_SECRET: 'test-secret-not-real', ZALO_APP_ID: '111111111', ZALO_OA_ID: '222222222' }
function fixture() {
  const state = { ready: true, locked: false, calls: [], finishes: [], failCommit: 0 }
  const prepared = { state: 'READY', template_id: '999999', template_version: 1, user_id: '333333333', parameters: { customer_name: 'Phụ huynh', student_name: 'Học viên', student_code: 'TEST', program_name: 'Piano', report_type: 'Báo cáo tháng', report_period: '01/09/2026-30/09/2026', report_link_id: 'a'.repeat(64) } }
  const admin = { rpc: async (name, args) => {
    state.calls.push(name)
    if (name === 'prepare_learning_report_zbs') return { data: state.ready ? prepared : { state: 'REPORT_TEMPLATE_NOT_READY' } }
    if (name === 'note_learning_report_zbs_blocked') return { data: null }
    if (name === 'zalo_credential_command') { assert.equal(args.p_action, 'READ'); return { data: { app_id: env.ZALO_APP_ID, oa_id: env.ZALO_OA_ID, state: 'READY', version: 1, access_token: 'test-only', expires_at: new Date(Date.now() + 3600000).toISOString() } } }
    if (name === 'claim_learning_report_zbs') { if (state.locked) return { data: null }; state.locked = true; return { data: { ...prepared, attempt_id: 'attempt' } } }
    if (name === 'finish_learning_report_zbs') { if (state.failCommit-- > 0) return { error: 'DB interrupted' }; state.finishes.push(args); return { data: args.p_state } }
    throw Error(name)
  } }
  return { admin, state, prepared }
}
test('disabled send gate or unapproved report template never contacts Zalo or claims a send', async () => {
  const { admin, state } = fixture(); const never = () => { throw Error('Network forbidden') }
  assert.equal(await deliverLearningReport(admin, 'job', { ...env, ZALO_LEARNING_REPORT_SEND_ENABLED: 'false' }, never), 'REPORT_SENDING_DISABLED')
  assert.equal(state.calls.includes('claim_learning_report_zbs'), false)
  state.ready = false; assert.equal(await deliverLearningReport(admin, 'job', env, never), 'REPORT_TEMPLATE_NOT_READY')
})
test('accepted request saves provider evidence; duplicate worker and database retry never resend', async () => {
  const { admin, state } = fixture(); let requests = 0; state.failCommit = 1
  const transport = async (url, init) => {
    requests++; assert.equal(url, 'https://openapi.zalo.me/v3.0/oa/message/template')
    const body = JSON.parse(init.body); assert.equal(Object.keys(body.template_data).length, 7); assert.equal(body.template_id, '999999')
    assert.ok(init.headers.appsecret_proof); assert.equal(init.redirect, 'error')
    return Response.json({ error: 0, data: { message_id: 'report-message', user_id: '333333333' } })
  }
  assert.equal(await deliverLearningReport(admin, 'job', env, transport), 'ACCEPTED')
  assert.equal(await deliverLearningReport(admin, 'job', env, transport), 'NOT_CLAIMED'); assert.equal(requests, 1)
  assert.equal(state.finishes[0].p_message, 'report-message')
})
test('timeout, malformed response and HTTP errors are unknown and stay locked', async () => {
  for (const transport of [async () => { throw Error('timeout') }, async () => Response.json({ error: 0 }), async () => Response.json({ error: 0, data: { message_id: 'wrong-recipient', user_id: '444444444' } }), async () => Response.json({ error: -1 }, { status: 500 })]) {
    const { admin, state } = fixture()
    assert.equal(await deliverLearningReport(admin, 'job', env, transport), 'UNKNOWN')
    assert.equal(await deliverLearningReport(admin, 'job', env, transport), 'NOT_CLAIMED')
    assert.equal(state.finishes[0].p_message, null)
  }
})
test('explicit provider rejection saves a sanitized code, no invented message id', async () => {
  const { admin, state } = fixture()
  assert.equal(await deliverLearningReport(admin, 'job', env, async () => Response.json({ error: -242, message: 'secret provider detail' })), 'REJECTED')
  assert.equal(state.finishes[0].p_error, 'ZALO_ERROR_-242'); assert.equal(state.finishes[0].p_message, null)
})
