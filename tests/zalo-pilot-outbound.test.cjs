const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./helpers/zalo-module-loader.cjs')()

const { sendZaloPhoneTemplate } = load('lib/integrations/zalo/phone.ts')
const { sendZaloTemplateMessage } = load('lib/integrations/zalo/readiness.ts')
const { dispatchPreviewRegistrationZalo } = load('lib/integrations/zalo/preview-dispatch.ts')
const { getZaloCredential } = load('lib/integrations/zalo/oauth.ts')
const { verifyZaloToken } = load('lib/integrations/zalo/connection.ts')
const { finishAuthorization } = load('lib/integrations/zalo/authorization.ts')
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
  { ZALO_PILOT_OUTBOUND: 'disabled', VERCEL_ENV: 'production' },
  { ZALO_PILOT_OUTBOUND: 'disabled' },
  {},
]

for (const mode of blockedModes) {
  const label = mode.ZALO_PILOT_OUTBOUND || 'default-non-production'
  const env = { ...credentials, ...mode }
  test(`pilot control ${label} makes zero provider calls with an enabled template and credentials`, async () => {
    let calls = 0
    const transport = async () => { calls += 1; throw new Error('provider call') }
    const phone = await sendZaloPhoneTemplate(phoneMessage, env, transport)
    assert.equal(phone.state, 'ZALO_PILOT_OUTBOUND_DISABLED')
    assert.notEqual(phone.state, 'ACCEPTED')
    assert.equal(phone.delivered, undefined)
    const uid = await sendZaloTemplateMessage({
      ...phoneMessage,
      providerUserId: 'owner-zalo-user',
      idempotencyKey: 'domain:REGISTRATION_COMPLETED:preview',
    }, env, transport)
    assert.equal(uid.state, 'ZALO_PILOT_OUTBOUND_DISABLED')
    assert.notEqual(uid.delivered, true)
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
    const previous = { pilot: process.env.ZALO_PILOT_OUTBOUND, vercel: process.env.VERCEL_ENV }
    if (mode.ZALO_PILOT_OUTBOUND) process.env.ZALO_PILOT_OUTBOUND = mode.ZALO_PILOT_OUTBOUND
    else delete process.env.ZALO_PILOT_OUTBOUND
    if (mode.VERCEL_ENV) process.env.VERCEL_ENV = mode.VERCEL_ENV
    else delete process.env.VERCEL_ENV
    try {
      const direct = await outbound.sendZaloTemplateMessage({ providerUserId: '1', templateId: '640377', parameters, idempotencyKey: 'k' })
      assert.equal(direct.state, 'ZALO_PILOT_OUTBOUND_DISABLED')
      const job = { id: 'job', channel: 'ZALO', delivery_mode: 'LIVE', idempotency_key: 'stable', lease_token: 'lease', recipient_id: 'user', payload: { title: 'Hello', href: '/' } }
      const completed = []
      const result = await dispatch({
        claim: async () => job,
        complete: async (...args) => { completed.push(args) },
      }, 'job', { ZALO: { send: async () => { calls += 1; return { confirmed: true, receipt: 'delivered' } } } })
      assert.equal(result, 'FAILED')
      assert.equal(completed[0][2], null)
      assert.equal(completed[0][3], 'ZALO_PILOT_OUTBOUND_DISABLED')
    } finally {
      if (previous.pilot === undefined) delete process.env.ZALO_PILOT_OUTBOUND
      else process.env.ZALO_PILOT_OUTBOUND = previous.pilot
      if (previous.vercel === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = previous.vercel
    }
    assert.equal(calls, 0)
  })
}

test('production without the pilot flag keeps the existing provider gate', async () => {
  let calls = 0
  const env = { ...credentials, VERCEL_ENV: 'production' }
  delete env.ZALO_PILOT_OUTBOUND
  const sent = await sendZaloPhoneTemplate(phoneMessage, env, async () => {
    calls += 1
    return { status: 200, json: async () => ({ error: 0, data: { msg_id: 'mock-only' } }) }
  })
  assert.equal(sent.state, 'ACCEPTED')
  assert.equal(sent.delivered, false)
  assert.equal(calls, 1)
})
