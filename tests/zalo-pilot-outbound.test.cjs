const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const load = require('./helpers/zalo-module-loader.cjs')()

const { zaloPilotOutboundBlocked } = load('lib/integrations/zalo/pilot-outbound.ts')
const { sendZaloPhoneTemplate } = load('lib/integrations/zalo/phone.ts')
const { sendZaloTemplateMessage } = load('lib/integrations/zalo/readiness.ts')
const { dispatchPreviewRegistrationZalo } = load('lib/integrations/zalo/preview-dispatch.ts')
const { getZaloCredential } = load('lib/integrations/zalo/oauth.ts')
const { verifyZaloToken } = load('lib/integrations/zalo/connection.ts')
const { finishAuthorization } = load('lib/integrations/zalo/authorization.ts')
const { maintainZaloCredentials } = load('lib/integrations/zalo/maintenance.ts')
const { recoverRegistrationNotification } = load('lib/integrations/zalo/registration-recovery.ts')
const outbound = load('lib/integrations/zalo/outbound.ts')
const { dispatch } = load('lib/notifications/worker.ts')

const credentials = {
  ZALO_TEMPLATE_SEND_ENABLED: 'true',
  ZALO_OA_ACCESS_TOKEN: 'live-looking-token',
  ZALO_OA_REFRESH_TOKEN: 'live-looking-refresh',
  ZALO_APP_SECRET: 'live-looking-secret',
  ZALO_OA_SECRET_KEY: 'live-looking-oa-secret',
  ZALO_APP_ID: '1355275380325944240',
  ZALO_OA_ID: '4520912928458797082',
  ZALO_CREDENTIAL_OWNER: 'main',
  ZALO_TOKEN_RENEWAL_ENABLED: 'true',
  ZALO_OAUTH_REDIRECT_URI: 'http://localhost:3000/api/integrations/zalo/oauth/callback',
}

const parameters = {
  customer_name: 'Phụ huynh',
  registration_code: 'DK-PILOT',
  student_name: 'Học viên',
  program_name: 'Piano',
  branch_name: 'Cần Thơ',
  order_code: 'DK-PILOT',
  payment_status: 'Đã nhận thanh toán 50%',
}

const phoneMessage = {
  jobId: '11111111-1111-4111-8111-111111111111',
  phone: '84987654321',
  templateId: '640377',
  parameters,
  trackingId: 'abc123',
  registrationCompleted: true,
  allowlisted: true,
}

const blockedModes = [
  { label: 'missing', VERCEL_ENV: 'production' },
  { label: 'missing-preview', VERCEL_ENV: 'preview' },
  { label: 'empty', ZALO_PILOT_OUTBOUND: '', VERCEL_ENV: 'production' },
  { label: 'false', ZALO_PILOT_OUTBOUND: 'false', VERCEL_ENV: 'production' },
  { label: 'malformed-true', ZALO_PILOT_OUTBOUND: 'true', VERCEL_ENV: 'production' },
  { label: 'malformed-yes', ZALO_PILOT_OUTBOUND: 'yes', VERCEL_ENV: 'production' },
  { label: 'malformed-case', ZALO_PILOT_OUTBOUND: 'Enabled', VERCEL_ENV: 'production' },
  { label: 'malformed-space', ZALO_PILOT_OUTBOUND: 'enabled ', VERCEL_ENV: 'production' },
  { label: 'disabled', ZALO_PILOT_OUTBOUND: 'disabled', VERCEL_ENV: 'production' },
]

function pilotEnv(mode) {
  const env = { ...credentials, VERCEL_ENV: mode.VERCEL_ENV }
  if (Object.prototype.hasOwnProperty.call(mode, 'ZALO_PILOT_OUTBOUND')) env.ZALO_PILOT_OUTBOUND = mode.ZALO_PILOT_OUTBOUND
  return env
}

function applyProcessEnv(mode) {
  const previous = { pilot: process.env.ZALO_PILOT_OUTBOUND, vercel: process.env.VERCEL_ENV }
  if (Object.prototype.hasOwnProperty.call(mode, 'ZALO_PILOT_OUTBOUND')) process.env.ZALO_PILOT_OUTBOUND = mode.ZALO_PILOT_OUTBOUND
  else delete process.env.ZALO_PILOT_OUTBOUND
  if (mode.VERCEL_ENV) process.env.VERCEL_ENV = mode.VERCEL_ENV
  else delete process.env.VERCEL_ENV
  return () => {
    if (previous.pilot === undefined) delete process.env.ZALO_PILOT_OUTBOUND
    else process.env.ZALO_PILOT_OUTBOUND = previous.pilot
    if (previous.vercel === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = previous.vercel
  }
}

test('only the exact value enabled opens the pilot gate', () => {
  for (const mode of blockedModes) {
    assert.equal(zaloPilotOutboundBlocked(pilotEnv(mode)), true, mode.label)
  }
  assert.equal(zaloPilotOutboundBlocked({ ...credentials, ZALO_PILOT_OUTBOUND: 'enabled', VERCEL_ENV: 'production' }), false)
})

for (const mode of blockedModes) {
  test(`pilot control ${mode.label} makes zero provider calls`, async () => {
    let calls = 0
    const env = pilotEnv(mode)
    const transport = async () => { calls += 1; throw new Error('provider call') }
    const phone = await sendZaloPhoneTemplate(phoneMessage, env, transport)
    assert.equal(phone.state, 'ZALO_PILOT_OUTBOUND_DISABLED')
    assert.notEqual(phone.state, 'ACCEPTED')
    const uid = await sendZaloTemplateMessage({
      ...phoneMessage,
      providerUserId: 'owner-zalo-user',
      idempotencyKey: 'domain:REGISTRATION_COMPLETED:preview',
    }, env, transport)
    assert.equal(uid.state, 'ZALO_PILOT_OUTBOUND_DISABLED')
    const rpc = []
    const dispatched = await dispatchPreviewRegistrationZalo({
      rpc: async (fn) => { rpc.push(fn); return { data: [{ decision: 'SEND', job_id: phoneMessage.jobId, provider_user_id: '84987654321', idempotency_key: 'k', parameters, delivery_channel: 'PHONE' }], error: null } },
    }, 1, transport, env, transport)
    assert.equal(dispatched, 'ZALO_PILOT_OUTBOUND_DISABLED')
    assert.deepEqual(rpc, [])
    await assert.rejects(getZaloCredential({ rpc: async () => { calls += 1; return { data: null, error: null } } }, env, transport), /ZALO_PILOT_OUTBOUND_DISABLED/)
    assert.equal(await verifyZaloToken('live-looking-token', env, transport), 'ZALO_PILOT_OUTBOUND_DISABLED')
    await assert.rejects(finishAuthorization({ rpc: async () => { throw new Error('provider call') } }, 'admin', {
      state: 'a'.repeat(43), cookieState: 'a'.repeat(43), code: 'code', oaId: credentials.ZALO_OA_ID,
    }, env, transport), /ZALO_PILOT_OUTBOUND_DISABLED/)

    const jobId = 'aa920000-0000-4000-8000-000000000081'
    const recovered = await recoverRegistrationNotification({
      async rpc(name) {
        if (name !== 'zalo_registration_recovery') throw new Error(name)
        return { data: { jobId, state: 'RETRY', reason: 'CHANNEL_READY', attempts: 1, orderCode: 123, history: [] }, error: null }
      },
    }, {
      async rpc(name) {
        if (name === 'zalo_credential_command') return { data: { app_id: credentials.ZALO_APP_ID, oa_id: credentials.ZALO_OA_ID, version: 1, state: 'READY', access_token: 'mock', refresh_token: 'mock-refresh', expires_at: new Date(Date.now() + 3600000).toISOString() }, error: null }
        calls += 1
        throw new Error(name)
      },
    }, { jobId, action: 'SEND', expectedAttempts: 1 }, env, transport)
    assert.equal(recovered.state, 'BLOCKED')
    assert.equal(recovered.reason, 'ZALO_PILOT_OUTBOUND_DISABLED')
    assert.notEqual(recovered.state, 'ACCEPTED')
    assert.notEqual(recovered.state, 'DELIVERED')

    const maintained = await maintainZaloCredentials({
      async rpc(name) {
        if (name !== 'zalo_scheduler_health') { calls += 1; throw new Error(name) }
        return { data: { ok: true }, error: null }
      },
    }, env, transport)
    assert.equal(maintained.result, 'ZALO_PILOT_OUTBOUND_DISABLED')

    const restore = applyProcessEnv(mode)
    try {
      const reminder = await outbound.sendZaloTemplateMessage({ providerUserId: '1', templateId: '640377', parameters, idempotencyKey: 'tuition-reminder' })
      assert.equal(reminder.state, 'ZALO_PILOT_OUTBOUND_DISABLED')
      const job = { id: 'job', channel: 'ZALO', delivery_mode: 'LIVE', idempotency_key: 'stable', lease_token: 'lease', recipient_id: 'user', payload: { title: 'Hello', href: '/' } }
      const completed = []
      const providers = { ZALO: { send: async () => { calls += 1; return { confirmed: true, receipt: 'delivered' } } } }
      for (const _retry of [1, 2]) {
        const result = await dispatch({
          claim: async () => job,
          complete: async (...args) => { completed.push(args) },
        }, 'job', providers)
        assert.equal(result, 'FAILED')
      }
      assert.equal(completed.length, 2)
      assert.equal(completed[0][2], null)
      assert.equal(completed[1][2], null)
      assert.equal(completed[0][3], 'ZALO_PILOT_OUTBOUND_DISABLED')
      assert.equal(completed[1][3], 'ZALO_PILOT_OUTBOUND_DISABLED')
    } finally {
      restore()
    }
    assert.equal(calls, 0)
  })
}

test('explicitly enabled opens the direct send gate and still does not mark delivered', async () => {
  let calls = 0
  const env = { ...credentials, ZALO_PILOT_OUTBOUND: 'enabled', VERCEL_ENV: 'production' }
  const sent = await sendZaloPhoneTemplate(phoneMessage, env, async () => {
    calls += 1
    return { status: 200, json: async () => ({ error: 0, data: { msg_id: 'mock-only' } }) }
  })
  assert.equal(sent.state, 'ACCEPTED')
  assert.equal(sent.delivered, false)
  assert.equal(calls, 1)
})

test('tuition reminder action sends only through the manual gate', () => {
  const source = fs.readFileSync('app/admin/tuition/reminders/actions.ts', 'utf8')
  const outbound = fs.readFileSync('lib/integrations/zalo/outbound.ts', 'utf8')
  const sender = fs.readFileSync('lib/integrations/zalo/tuition-test-send.ts', 'utf8')
  assert.match(source, /sendManualTuitionZalo/)
  assert.equal(source.includes('sendAuthorizedTuitionTest'), false)
  assert.match(sender, /zaloPilotOutboundBlocked\(env\)/)
  assert.equal(source.includes('fetch('), false)
  assert.equal(outbound.includes('fetch('), false)
  assert.match(outbound, /return \{ state: ZALO_OUTBOUND_STATE \}/)
})
